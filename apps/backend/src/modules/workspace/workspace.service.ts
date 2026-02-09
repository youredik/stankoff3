import { Injectable, NotFoundException } from '@nestjs/common';
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

  // Получить все workspaces (фильтрация по пользователю, исключая internal)
  async findAll(userId: string, userRole: UserRole): Promise<Workspace[]> {
    // Глобальный admin видит все (кроме internal)
    if (userRole === UserRole.ADMIN) {
      return this.workspaceRepository.find({
        where: { isInternal: false },
        relations: ['section'],
        order: { orderInSection: 'ASC', name: 'ASC' },
      });
    }

    // Остальные видят только свои (кроме internal)
    const memberships = await this.memberRepository.find({
      where: { userId },
      relations: ['workspace', 'workspace.section'],
    });

    return memberships
      .map((m) => m.workspace)
      .filter((ws) => !ws.isInternal);
  }

  // Алиас для findAll — для использования в поиске
  async getAccessibleWorkspaces(userId: string, userRole: UserRole): Promise<Workspace[]> {
    return this.findAll(userId, userRole);
  }

  async findOne(id: string): Promise<Workspace | null> {
    return this.workspaceRepository.findOne({
      where: { id },
      relations: ['section'],
    });
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

    // Глобальный admin имеет admin роль во всех workspaces (кроме internal)
    if (userRole === UserRole.ADMIN) {
      const workspaces = await this.workspaceRepository.find({
        where: { isInternal: false },
      });
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
