import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, RoleScope } from './role.entity';
import { User } from '../user/user.entity';
import { WorkspaceMember } from '../workspace/workspace-member.entity';
import { SectionMember } from '../section/section-member.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RbacService } from './rbac.service';
import { EventsGateway } from '../websocket/events.gateway';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private readonly wsMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(SectionMember)
    private readonly secMemberRepo: Repository<SectionMember>,
    private readonly rbacService: RbacService,
    @Optional() @Inject(EventsGateway) private readonly eventsGateway?: EventsGateway,
  ) {}

  /**
   * Получить все роли, опционально фильтруя по scope.
   */
  async findAll(scope?: RoleScope): Promise<Role[]> {
    const where = scope ? { scope } : {};
    return this.roleRepo.find({ where, order: { scope: 'ASC', name: 'ASC' } });
  }

  /**
   * Получить роль по ID.
   */
  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Роль не найдена: ${id}`);
    }
    return role;
  }

  /**
   * Получить роль по slug.
   */
  async findBySlug(slug: string): Promise<Role | null> {
    return this.roleRepo.findOne({ where: { slug } });
  }

  /**
   * Создать новую роль.
   */
  async create(dto: CreateRoleDto): Promise<Role> {
    const existing = await this.roleRepo.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Роль с slug '${dto.slug}' уже существует`);
    }

    const role = this.roleRepo.create({
      name: dto.name,
      slug: dto.slug,
      description: dto.description || null,
      scope: dto.scope,
      permissions: dto.permissions,
      isSystem: false,
      isDefault: false,
    });

    return this.roleRepo.save(role);
  }

  /**
   * Обновить роль. Системные роли: можно менять name, description, permissions, но не slug.
   */
  async update(id: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);

    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.permissions !== undefined) role.permissions = dto.permissions;

    const saved = await this.roleRepo.save(role);

    // Инвалидируем кэш — permissions роли изменились
    this.rbacService.invalidateAll();

    // Уведомляем всех пользователей с этой ролью через WebSocket
    await this.notifyUsersWithRole(id, role.scope);

    return saved;
  }

  /**
   * Удалить роль. Системные роли удалить нельзя.
   */
  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);

    if (role.isSystem) {
      throw new ForbiddenException('Нельзя удалить системную роль');
    }

    // Проверяем, что роль не используется
    if (role.scope === 'global') {
      const usersCount = await this.userRepo.count({ where: { roleId: id } });
      if (usersCount > 0) {
        throw new ConflictException(
          `Роль используется ${usersCount} пользователями. Переназначьте их перед удалением.`,
        );
      }
    }

    await this.roleRepo.remove(role);
  }

  /**
   * Назначить глобальную роль пользователю.
   */
  async assignGlobalRole(userId: string, roleId: string): Promise<User> {
    const role = await this.findOne(roleId);
    if (role.scope !== 'global') {
      throw new ForbiddenException('Можно назначить только глобальную роль');
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`Пользователь не найден: ${userId}`);
    }

    user.roleId = roleId;
    const saved = await this.userRepo.save(user);

    this.rbacService.invalidateUser(userId);
    this.eventsGateway?.emitRbacPermissionsChanged(userId);
    return saved;
  }

  /**
   * Получить дефолтную роль для scope.
   */
  async getDefaultRole(scope: RoleScope): Promise<Role | null> {
    return this.roleRepo.findOne({ where: { scope, isDefault: true } });
  }

  /**
   * Уведомить всех пользователей, у которых назначена данная роль.
   */
  private async notifyUsersWithRole(roleId: string, scope: RoleScope): Promise<void> {
    if (!this.eventsGateway) return;

    const userIds = new Set<string>();

    if (scope === 'global') {
      const users = await this.userRepo.find({ where: { roleId }, select: ['id'] });
      users.forEach((u) => userIds.add(u.id));
    } else if (scope === 'workspace') {
      const members = await this.wsMemberRepo.find({ where: { roleId }, select: ['userId'] });
      members.forEach((m) => userIds.add(m.userId));
    } else if (scope === 'section') {
      const members = await this.secMemberRepo.find({ where: { roleId }, select: ['userId'] });
      members.forEach((m) => userIds.add(m.userId));
    }

    for (const userId of userIds) {
      this.eventsGateway.emitRbacPermissionsChanged(userId);
    }
  }
}
