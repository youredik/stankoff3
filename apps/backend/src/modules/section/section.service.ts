import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Section } from './section.entity';
import { SectionMember, SectionRole } from './section-member.entity';
import { Workspace } from '../workspace/workspace.entity';
import { WorkspaceMember } from '../workspace/workspace-member.entity';
import { UserRole } from '../user/user.entity';
import { Role } from '../rbac/role.entity';
import { RbacService } from '../rbac/rbac.service';
import { EventsGateway } from '../websocket/events.gateway';

/** Маппинг legacy enum → системный role slug */
const SEC_ROLE_SLUG_MAP: Record<SectionRole, string> = {
  [SectionRole.ADMIN]: 'section_admin',
  [SectionRole.VIEWER]: 'section_viewer',
};

@Injectable()
export class SectionService {
  constructor(
    @InjectRepository(Section)
    private sectionRepository: Repository<Section>,
    @InjectRepository(SectionMember)
    private memberRepository: Repository<SectionMember>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private workspaceMemberRepository: Repository<WorkspaceMember>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly rbacService: RbacService,
    @Optional() @Inject(EventsGateway) private readonly eventsGateway?: EventsGateway,
  ) {}

  // Получить все доступные разделы для пользователя
  async findAll(userId: string, userRole: UserRole): Promise<Section[]> {
    // Глобальный admin видит все разделы
    if (userRole === UserRole.ADMIN) {
      return this.sectionRepository.find({
        relations: ['workspaces'],
        order: { order: 'ASC', name: 'ASC' },
      });
    }

    // Получаем разделы где пользователь является членом
    const directMemberships = await this.memberRepository.find({
      where: { userId },
      relations: ['section', 'section.workspaces'],
    });
    const directSectionIds = new Set(directMemberships.map((m) => m.sectionId));

    // Получаем разделы через workspace membership
    const workspaceMemberships = await this.workspaceMemberRepository.find({
      where: { userId },
      relations: ['workspace'],
    });

    const workspaceSectionIds = new Set(
      workspaceMemberships
        .map((m) => m.workspace?.sectionId)
        .filter((id): id is string => id !== null && id !== undefined),
    );

    // Объединяем уникальные ID разделов
    const allSectionIds = [...new Set([...directSectionIds, ...workspaceSectionIds])];

    if (allSectionIds.length === 0) {
      return [];
    }

    // Загружаем разделы с workspaces
    const sections = await this.sectionRepository
      .createQueryBuilder('section')
      .leftJoinAndSelect('section.workspaces', 'workspace')
      .where('section.id IN (:...ids)', { ids: allSectionIds })
      .orderBy('section.order', 'ASC')
      .addOrderBy('section.name', 'ASC')
      .getMany();

    return sections;
  }

  async findOne(id: string): Promise<Section | null> {
    return this.sectionRepository.findOne({
      where: { id },
      relations: ['workspaces', 'members', 'members.user'],
    });
  }

  // Проверка доступа пользователя к разделу
  async checkAccess(
    sectionId: string,
    userId: string,
    userRole: UserRole,
    requiredRole?: SectionRole,
  ): Promise<SectionMember | null> {
    // Глобальный admin имеет полный доступ
    if (userRole === UserRole.ADMIN) {
      return { role: SectionRole.ADMIN } as SectionMember;
    }

    // Проверяем прямое членство в разделе
    const membership = await this.memberRepository.findOne({
      where: { sectionId, userId },
    });

    if (membership) {
      // Проверка минимальной роли
      if (requiredRole) {
        const roleHierarchy = {
          [SectionRole.VIEWER]: 0,
          [SectionRole.ADMIN]: 1,
        };
        if (roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
          return null;
        }
      }
      return membership;
    }

    // Проверяем доступ через workspace membership
    const section = await this.sectionRepository.findOne({
      where: { id: sectionId },
      relations: ['workspaces'],
    });

    if (!section) {
      return null;
    }

    for (const workspace of section.workspaces) {
      const workspaceMembership = await this.workspaceMemberRepository.findOne({
        where: { workspaceId: workspace.id, userId },
      });
      if (workspaceMembership) {
        // Пользователь имеет доступ к разделу через workspace, но только viewer
        if (requiredRole === SectionRole.ADMIN) {
          return null; // Нужен admin, а через workspace только viewer
        }
        return { role: SectionRole.VIEWER } as SectionMember;
      }
    }

    return null;
  }

  async create(
    data: Partial<Section>,
    creatorId: string,
  ): Promise<Section> {
    // Если order не указан, ставим в конец
    if (data.order === undefined) {
      const maxOrder = await this.sectionRepository
        .createQueryBuilder('section')
        .select('MAX(section.order)', 'max')
        .getRawOne();
      data.order = (maxOrder?.max ?? -1) + 1;
    }

    const section = this.sectionRepository.create(data);
    const saved = await this.sectionRepository.save(section);

    // Добавляем создателя как admin раздела
    await this.addMember(saved.id, creatorId, SectionRole.ADMIN);

    return saved;
  }

  async update(id: string, data: Partial<Section>): Promise<Section | null> {
    const section = await this.findOne(id);
    if (!section) {
      throw new NotFoundException('Раздел не найден');
    }

    await this.sectionRepository.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const section = await this.sectionRepository.findOne({
      where: { id },
      relations: ['workspaces'],
    });

    if (!section) {
      throw new NotFoundException('Раздел не найден');
    }

    // Проверяем, что раздел пустой
    if (section.workspaces && section.workspaces.length > 0) {
      throw new BadRequestException(
        'Нельзя удалить раздел, содержащий рабочие места. Сначала переместите или удалите рабочие места.',
      );
    }

    await this.sectionRepository.delete(id);
  }

  // Получить роли пользователя во всех разделах
  async getMyRoles(
    userId: string,
    userRole: UserRole,
  ): Promise<Record<string, SectionRole>> {
    const roles: Record<string, SectionRole> = {};

    // Глобальный admin имеет admin роль во всех разделах
    if (userRole === UserRole.ADMIN) {
      const sections = await this.sectionRepository.find();
      for (const section of sections) {
        roles[section.id] = SectionRole.ADMIN;
      }
      return roles;
    }

    // Прямые членства
    const memberships = await this.memberRepository.find({
      where: { userId },
    });

    for (const m of memberships) {
      roles[m.sectionId] = m.role;
    }

    // Через workspace (только viewer если нет прямого членства)
    const workspaceMemberships = await this.workspaceMemberRepository.find({
      where: { userId },
      relations: ['workspace'],
    });

    for (const wm of workspaceMemberships) {
      if (wm.workspace?.sectionId && !roles[wm.workspace.sectionId]) {
        roles[wm.workspace.sectionId] = SectionRole.VIEWER;
      }
    }

    return roles;
  }

  // === Управление участниками ===

  async getMembers(sectionId: string): Promise<SectionMember[]> {
    return this.memberRepository.find({
      where: { sectionId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async addMember(
    sectionId: string,
    userId: string,
    role: SectionRole = SectionRole.VIEWER,
    roleId?: string,
  ): Promise<SectionMember> {
    const section = await this.sectionRepository.findOne({ where: { id: sectionId } });
    if (!section) {
      throw new NotFoundException('Раздел не найден');
    }

    const resolvedRoleId = roleId || await this.resolveSectionRoleId(role);

    // Проверяем, не является ли уже членом
    const existing = await this.memberRepository.findOne({
      where: { sectionId, userId },
    });
    if (existing) {
      existing.role = role;
      existing.roleId = resolvedRoleId;
      const saved = await this.memberRepository.save(existing);
      this.rbacService.invalidateUser(userId);
      this.eventsGateway?.emitRbacPermissionsChanged(userId);
      return saved;
    }

    const member = this.memberRepository.create({ sectionId, userId, role, roleId: resolvedRoleId });
    const saved = await this.memberRepository.save(member);
    this.rbacService.invalidateUser(userId);
    this.eventsGateway?.emitRbacPermissionsChanged(userId);
    return saved;
  }

  async updateMemberRole(
    sectionId: string,
    userId: string,
    role: SectionRole,
    roleId?: string,
  ): Promise<SectionMember> {
    const member = await this.memberRepository.findOne({
      where: { sectionId, userId },
    });
    if (!member) {
      throw new NotFoundException('Участник не найден');
    }

    const resolvedRoleId = roleId || await this.resolveSectionRoleId(role);
    member.role = role;
    member.roleId = resolvedRoleId;
    const saved = await this.memberRepository.save(member);
    this.rbacService.invalidateUser(userId);
    this.eventsGateway?.emitRbacPermissionsChanged(userId);
    return saved;
  }

  async removeMember(sectionId: string, userId: string): Promise<void> {
    const result = await this.memberRepository.delete({ sectionId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Участник не найден');
    }
    this.rbacService.invalidateUser(userId);
    this.eventsGateway?.emitRbacPermissionsChanged(userId);
  }

  private async resolveSectionRoleId(role: SectionRole): Promise<string | null> {
    const slug = SEC_ROLE_SLUG_MAP[role];
    if (!slug) return null;
    const roleEntity = await this.roleRepository.findOne({ where: { slug } });
    return roleEntity?.id || null;
  }

  // === Reorder ===

  async reorder(sectionIds: string[]): Promise<void> {
    for (let i = 0; i < sectionIds.length; i++) {
      await this.sectionRepository.update(sectionIds[i], { order: i });
    }
  }
}
