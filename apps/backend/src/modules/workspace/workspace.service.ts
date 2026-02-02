import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Workspace } from './workspace.entity';
import { WorkspaceMember, WorkspaceRole } from './workspace-member.entity';
import { WorkspaceEntity } from '../entity/entity.entity';
import { UserRole } from '../user/user.entity';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private memberRepository: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
  ) {}

  // Получить все workspaces (фильтрация по пользователю)
  async findAll(userId: string, userRole: UserRole): Promise<Workspace[]> {
    // Глобальный admin видит все
    if (userRole === UserRole.ADMIN) {
      return this.workspaceRepository.find();
    }

    // Остальные видят только свои
    const memberships = await this.memberRepository.find({
      where: { userId },
      relations: ['workspace'],
    });

    return memberships.map((m) => m.workspace);
  }

  async findOne(id: string): Promise<Workspace | null> {
    return this.workspaceRepository.findOne({ where: { id } });
  }

  // Проверка доступа пользователя к workspace
  async checkAccess(
    workspaceId: string,
    userId: string,
    userRole: UserRole,
    requiredRole?: WorkspaceRole,
  ): Promise<WorkspaceMember | null> {
    // Глобальный admin имеет полный доступ
    if (userRole === UserRole.ADMIN) {
      return { role: WorkspaceRole.ADMIN } as WorkspaceMember;
    }

    const membership = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });

    if (!membership) {
      return null;
    }

    // Проверка минимальной роли
    if (requiredRole) {
      const roleHierarchy = {
        [WorkspaceRole.VIEWER]: 0,
        [WorkspaceRole.EDITOR]: 1,
        [WorkspaceRole.ADMIN]: 2,
      };
      if (roleHierarchy[membership.role] < roleHierarchy[requiredRole]) {
        return null;
      }
    }

    return membership;
  }

  async create(workspaceData: Partial<Workspace>, creatorId: string): Promise<Workspace> {
    const workspace = this.workspaceRepository.create(workspaceData);
    const saved = await this.workspaceRepository.save(workspace);

    // Добавляем создателя как admin workspace
    await this.addMember(saved.id, creatorId, WorkspaceRole.ADMIN);

    return saved;
  }

  async update(id: string, workspaceData: Partial<Workspace>): Promise<Workspace | null> {
    await this.workspaceRepository.update(id, workspaceData);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.workspaceRepository.delete(id);
  }

  // Получить роли пользователя во всех workspaces
  async getMyRoles(
    userId: string,
    userRole: UserRole,
  ): Promise<Record<string, WorkspaceRole>> {
    const roles: Record<string, WorkspaceRole> = {};

    // Глобальный admin имеет admin роль во всех workspaces
    if (userRole === UserRole.ADMIN) {
      const workspaces = await this.workspaceRepository.find();
      for (const ws of workspaces) {
        roles[ws.id] = WorkspaceRole.ADMIN;
      }
      return roles;
    }

    // Остальные — по membership
    const memberships = await this.memberRepository.find({
      where: { userId },
    });

    for (const m of memberships) {
      roles[m.workspaceId] = m.role;
    }

    return roles;
  }

  // === Управление участниками ===

  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    return this.memberRepository.find({
      where: { workspaceId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole = WorkspaceRole.EDITOR,
  ): Promise<WorkspaceMember> {
    // Проверяем существование workspace
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    // Проверяем, не является ли уже членом
    const existing = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (existing) {
      // Обновляем роль
      existing.role = role;
      return this.memberRepository.save(existing);
    }

    const member = this.memberRepository.create({ workspaceId, userId, role });
    return this.memberRepository.save(member);
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMember> {
    const member = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (!member) {
      throw new NotFoundException('Участник не найден');
    }

    member.role = role;
    return this.memberRepository.save(member);
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const result = await this.memberRepository.delete({ workspaceId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Участник не найден');
    }
  }

  // === Дублирование, архивирование, экспорт ===

  // Дублировать workspace (структуру без заявок)
  async duplicate(
    workspaceId: string,
    creatorId: string,
    newName?: string,
  ): Promise<Workspace> {
    const original = await this.findOne(workspaceId);
    if (!original) {
      throw new NotFoundException('Workspace не найден');
    }

    // Генерируем новые ID для секций и полей
    const newSections = original.sections.map((section) => ({
      ...section,
      id: uuidv4(),
      fields: section.fields.map((field) => ({
        ...field,
        id: uuidv4(),
        options: field.options?.map((opt) => ({ ...opt, id: uuidv4() })),
      })),
    }));

    // Создаём копию workspace
    const duplicated = this.workspaceRepository.create({
      name: newName || `${original.name} (копия)`,
      icon: original.icon,
      prefix: `${original.prefix}C`, // Добавляем суффикс C (Copy)
      sections: newSections,
      lastEntityNumber: 0, // Сбрасываем счётчик
      isArchived: false,
    });

    const saved = await this.workspaceRepository.save(duplicated);

    // Добавляем создателя как admin
    await this.addMember(saved.id, creatorId, WorkspaceRole.ADMIN);

    return saved;
  }

  // Архивировать/разархивировать workspace
  async setArchived(workspaceId: string, isArchived: boolean): Promise<Workspace> {
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    workspace.isArchived = isArchived;
    return this.workspaceRepository.save(workspace);
  }

  // Экспорт заявок workspace в JSON
  async exportToJson(workspaceId: string): Promise<{
    workspace: Workspace;
    entities: WorkspaceEntity[];
    exportedAt: string;
  }> {
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    const entities = await this.entityRepository.find({
      where: { workspaceId },
      relations: ['assignee', 'comments', 'comments.author'],
      order: { createdAt: 'DESC' },
    });

    return {
      workspace,
      entities,
      exportedAt: new Date().toISOString(),
    };
  }

  // Экспорт заявок workspace в CSV
  async exportToCsv(workspaceId: string): Promise<string> {
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    const entities = await this.entityRepository.find({
      where: { workspaceId },
      relations: ['assignee'],
      order: { createdAt: 'DESC' },
    });

    // Заголовки CSV
    const headers = [
      'ID',
      'Номер',
      'Название',
      'Статус',
      'Приоритет',
      'Исполнитель',
      'Создано',
      'Обновлено',
    ];

    // Строки данных
    const rows = entities.map((e) => [
      e.id,
      e.customId,
      `"${(e.title || '').replace(/"/g, '""')}"`,
      e.status,
      e.priority || '',
      e.assignee ? `${e.assignee.firstName} ${e.assignee.lastName}` : '',
      e.createdAt.toISOString(),
      e.updatedAt.toISOString(),
    ]);

    // Собираем CSV
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return csv;
  }
}
