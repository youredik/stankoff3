import { Injectable, NotFoundException, ForbiddenException, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Workspace } from './workspace.entity';
import { WorkspaceMember, WorkspaceRole } from './workspace-member.entity';
import { WorkspaceEntity } from '../entity/entity.entity';
import { UserRole } from '../user/user.entity';
import { RbacService } from '../rbac/rbac.service';
import { Role } from '../rbac/role.entity';
import { EventsGateway } from '../websocket/events.gateway';

/** Маппинг legacy enum → системный role slug */
const WS_ROLE_SLUG_MAP: Record<WorkspaceRole, string> = {
  [WorkspaceRole.ADMIN]: 'ws_admin',
  [WorkspaceRole.EDITOR]: 'ws_editor',
  [WorkspaceRole.VIEWER]: 'ws_viewer',
};

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private memberRepository: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly rbacService: RbacService,
    @Optional() @Inject(EventsGateway) private readonly eventsGateway?: EventsGateway,
  ) {}

  // Получить все workspaces (фильтрация по permissions, исключая internal)
  async findAll(userId: string, _userRole?: UserRole): Promise<Workspace[]> {
    const accessibleIds = await this.rbacService.getAccessibleWorkspaceIds(userId);

    if (accessibleIds.length === 0) return [];

    return this.workspaceRepository.find({
      where: { id: In(accessibleIds), isInternal: false },
      relations: ['section'],
      order: { orderInSection: 'ASC', name: 'ASC' },
    });
  }

  // Алиас для findAll — для использования в поиске
  async getAccessibleWorkspaces(userId: string, _userRole?: UserRole): Promise<Workspace[]> {
    return this.findAll(userId);
  }

  async findOne(id: string): Promise<Workspace | null> {
    return this.workspaceRepository.findOne({
      where: { id },
      relations: ['section'],
    });
  }

  // Проверка доступа пользователя к workspace (через RBAC permissions)
  async checkAccess(
    workspaceId: string,
    userId: string,
    _userRole?: UserRole,
    requiredRole?: WorkspaceRole,
  ): Promise<WorkspaceMember | null> {
    // Маппинг старых WorkspaceRole → permission
    const requiredPermission = this.mapWorkspaceRoleToPermission(requiredRole);

    const hasAccess = await this.rbacService.hasPermission(
      userId,
      requiredPermission,
      { workspaceId },
    );

    if (!hasAccess) return null;

    // Возвращаем membership для обратной совместимости (вызывающий код может использовать access.role)
    const membership = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });

    // Если membership нет, но доступ есть (суперадмин) — возвращаем синтетический объект
    return membership || ({ role: WorkspaceRole.ADMIN } as WorkspaceMember);
  }

  private mapWorkspaceRoleToPermission(requiredRole?: WorkspaceRole): string {
    switch (requiredRole) {
      case WorkspaceRole.ADMIN:
        return 'workspace:settings:update';
      case WorkspaceRole.EDITOR:
        return 'workspace:entity:update';
      default:
        return 'workspace:entity:read';
    }
  }

  async create(workspaceData: Partial<Workspace>, creatorId: string): Promise<Workspace> {
    const workspace = this.workspaceRepository.create(workspaceData);
    const saved = await this.workspaceRepository.save(workspace);

    // Добавляем создателя как admin workspace
    await this.addMember(saved.id, creatorId, WorkspaceRole.ADMIN);

    return saved;
  }

  async update(id: string, workspaceData: Partial<Workspace>): Promise<Workspace | null> {
    const existing = await this.findOne(id);

    if (existing?.isSystem) {
      // Запрещаем менять ключевые поля системного workspace
      delete workspaceData.prefix;
      delete workspaceData.systemType;
      delete workspaceData.isSystem;

      // Защищаем системные поля от удаления
      if (workspaceData.sections && existing.sections) {
        workspaceData.sections = this.protectSystemFields(existing.sections, workspaceData.sections);
      }
    }

    await this.workspaceRepository.update(id, workspaceData);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const ws = await this.findOne(id);
    if (ws?.isSystem) {
      throw new ForbiddenException('Системный workspace нельзя удалить');
    }
    await this.workspaceRepository.delete(id);
  }

  /**
   * Защищает системные поля от удаления при обновлении workspace.
   * Пользователь может добавлять новые поля, но не удалять поля с system: true.
   */
  private protectSystemFields(
    existingSections: Workspace['sections'],
    newSections: Workspace['sections'],
  ): Workspace['sections'] {
    // Собираем все системные поля из существующих секций
    const systemFields = new Map<string, { sectionId: string; field: typeof existingSections[0]['fields'][0] }>();
    for (const section of existingSections) {
      for (const field of section.fields) {
        if (field.system) {
          systemFields.set(field.id, { sectionId: section.id, field });
        }
      }
    }

    // Проверяем что все системные поля присутствуют в новых секциях
    const newFieldIds = new Set<string>();
    for (const section of newSections) {
      for (const field of section.fields) {
        newFieldIds.add(field.id);
      }
    }

    // Возвращаем отсутствующие системные поля в их секции
    for (const [fieldId, { sectionId, field }] of systemFields) {
      if (!newFieldIds.has(fieldId)) {
        const targetSection = newSections.find((s) => s.id === sectionId);
        if (targetSection) {
          targetSection.fields.push(field);
        } else {
          // Секция удалена — восстанавливаем
          const existingSection = existingSections.find((s) => s.id === sectionId);
          if (existingSection) {
            newSections.push({
              ...existingSection,
              fields: [field],
            });
          }
        }
      }
    }

    return newSections;
  }

  // Получить роли пользователя во всех workspaces
  async getMyRoles(
    userId: string,
    _userRole?: UserRole,
  ): Promise<Record<string, WorkspaceRole>> {
    const roles: Record<string, WorkspaceRole> = {};

    // Проверяем: суперадмин (role с permission '*') → admin во всех
    const accessibleIds = await this.rbacService.getAccessibleWorkspaceIds(userId);
    const memberships = await this.memberRepository.find({
      where: { userId },
    });

    const memberMap = new Map(memberships.map((m) => [m.workspaceId, m.role]));

    for (const wsId of accessibleIds) {
      roles[wsId] = memberMap.get(wsId) || WorkspaceRole.ADMIN;
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
    roleId?: string,
  ): Promise<WorkspaceMember> {
    // Проверяем существование workspace
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    // Resolve roleId: если передан явно — используем, иначе маппим по enum
    const resolvedRoleId = roleId || await this.resolveWorkspaceRoleId(role);

    // Проверяем, не является ли уже членом
    const existing = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (existing) {
      existing.role = role;
      existing.roleId = resolvedRoleId;
      const saved = await this.memberRepository.save(existing);
      this.rbacService.invalidateUser(userId);
      this.eventsGateway?.emitRbacPermissionsChanged(userId);
      return saved;
    }

    const member = this.memberRepository.create({ workspaceId, userId, role, roleId: resolvedRoleId });
    const saved = await this.memberRepository.save(member);
    this.rbacService.invalidateUser(userId);
    this.eventsGateway?.emitRbacPermissionsChanged(userId);
    return saved;
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    roleId?: string,
  ): Promise<WorkspaceMember> {
    const member = await this.memberRepository.findOne({
      where: { workspaceId, userId },
    });
    if (!member) {
      throw new NotFoundException('Участник не найден');
    }

    const resolvedRoleId = roleId || await this.resolveWorkspaceRoleId(role);
    member.role = role;
    member.roleId = resolvedRoleId;
    const saved = await this.memberRepository.save(member);
    this.rbacService.invalidateUser(userId);
    this.eventsGateway?.emitRbacPermissionsChanged(userId);
    return saved;
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const result = await this.memberRepository.delete({ workspaceId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Участник не найден');
    }
    this.rbacService.invalidateUser(userId);
    this.eventsGateway?.emitRbacPermissionsChanged(userId);
  }

  private async resolveWorkspaceRoleId(role: WorkspaceRole): Promise<string | null> {
    const slug = WS_ROLE_SLUG_MAP[role];
    if (!slug) return null;
    const roleEntity = await this.roleRepository.findOne({ where: { slug } });
    return roleEntity?.id || null;
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
      sectionId: original.sectionId, // Копируем раздел
      showInMenu: original.showInMenu,
      orderInSection: original.orderInSection,
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

  // Установить раздел для workspace
  async setSection(workspaceId: string, sectionId: string | null): Promise<Workspace> {
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    workspace.sectionId = sectionId;
    const saved = await this.workspaceRepository.save(workspace);
    return this.findOne(saved.id) as Promise<Workspace>;
  }

  // Установить showInMenu
  async setShowInMenu(workspaceId: string, showInMenu: boolean): Promise<Workspace> {
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    workspace.showInMenu = showInMenu;
    return this.workspaceRepository.save(workspace);
  }

  // Изменить порядок workspaces внутри раздела
  async reorderInSection(workspaceIds: string[]): Promise<void> {
    for (let i = 0; i < workspaceIds.length; i++) {
      await this.workspaceRepository.update(workspaceIds[i], { orderInSection: i });
    }
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

  // Импорт из JSON
  async importFromJson(
    workspaceId: string,
    entities: any[],
    _userId: string,
  ): Promise<{ imported: number; errors: string[] }> {
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    const errors: string[] = [];
    let imported = 0;

    for (let i = 0; i < entities.length; i++) {
      const item = entities[i];
      try {
        // Получаем следующий номер
        const nextNumber = workspace.lastEntityNumber + 1;
        workspace.lastEntityNumber = nextNumber;

        const entity = this.entityRepository.create({
          workspaceId,
          customId: `${workspace.prefix}-${nextNumber}`,
          title: item.title || `Импортированная заявка ${nextNumber}`,
          status: item.status || 'new',
          priority: item.priority || 'medium',
          data: item.data || {},
        });

        await this.entityRepository.save(entity);
        imported++;
      } catch (err) {
        errors.push(`Строка ${i + 1}: ${(err as Error).message}`);
      }
    }

    // Сохраняем обновлённый счётчик
    await this.workspaceRepository.save(workspace);

    return { imported, errors };
  }

  // Импорт из CSV
  async importFromCsv(
    workspaceId: string,
    csvContent: string,
    _userId: string,
  ): Promise<{ imported: number; errors: string[] }> {
    const workspace = await this.findOne(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace не найден');
    }

    const errors: string[] = [];
    let imported = 0;

    // Парсим CSV
    const lines = csvContent.split('\n').filter((line) => line.trim());
    if (lines.length < 2) {
      return { imported: 0, errors: ['CSV должен содержать заголовок и хотя бы одну строку данных'] };
    }

    // Парсим заголовки
    const headers = this.parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

    // Ищем индексы нужных колонок
    const titleIndex = headers.findIndex((h) =>
      ['название', 'title', 'name', 'заголовок'].includes(h),
    );
    const statusIndex = headers.findIndex((h) =>
      ['статус', 'status'].includes(h),
    );
    const priorityIndex = headers.findIndex((h) =>
      ['приоритет', 'priority'].includes(h),
    );

    if (titleIndex === -1) {
      return {
        imported: 0,
        errors: ['Не найдена колонка "Название" или "Title"'],
      };
    }

    // Импортируем строки
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCsvLine(lines[i]);
        const title = values[titleIndex]?.trim();

        if (!title) {
          errors.push(`Строка ${i + 1}: пустое название`);
          continue;
        }

        // Получаем следующий номер
        const nextNumber = workspace.lastEntityNumber + 1;
        workspace.lastEntityNumber = nextNumber;

        const entity = this.entityRepository.create({
          workspaceId,
          customId: `${workspace.prefix}-${nextNumber}`,
          title,
          status: statusIndex >= 0 ? values[statusIndex]?.trim() || 'new' : 'new',
          priority: priorityIndex >= 0 ? this.mapPriority(values[priorityIndex]?.trim()) : 'medium',
          data: {},
        });

        await this.entityRepository.save(entity);
        imported++;
      } catch (err) {
        errors.push(`Строка ${i + 1}: ${(err as Error).message}`);
      }
    }

    // Сохраняем обновлённый счётчик
    await this.workspaceRepository.save(workspace);

    return { imported, errors };
  }

  // Парсинг строки CSV с учётом кавычек
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Пропускаем следующую кавычку
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  // Маппинг приоритета
  private mapPriority(value?: string): 'low' | 'medium' | 'high' {
    if (!value) return 'medium';
    const lower = value.toLowerCase();
    if (['high', 'высокий', 'срочный', '3'].includes(lower)) return 'high';
    if (['low', 'низкий', '1'].includes(lower)) return 'low';
    return 'medium';
  }
}
