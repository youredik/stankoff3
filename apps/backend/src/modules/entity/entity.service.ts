import { Injectable, NotFoundException, Inject, forwardRef, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource, SelectQueryBuilder } from 'typeorm';
import { WorkspaceEntity } from './entity.entity';
import { GlobalCounter } from './global-counter.entity';
import { Workspace } from '../workspace/workspace.entity';
import { User } from '../user/user.entity';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { KanbanQueryDto, ColumnLoadMoreDto } from './dto/kanban-query.dto';
import { EventsGateway } from '../websocket/events.gateway';
import { S3Service } from '../s3/s3.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { EmailService } from '../email/email.service';
import { AutomationService } from '../automation/automation.service';
import { TriggerType } from '../automation/automation-rule.entity';
import { TriggersService } from '../bpmn/triggers/triggers.service';
import { TriggerType as BpmnTriggerType } from '../bpmn/entities/process-trigger.entity';
import { SlaService } from '../sla/sla.service';
import { FieldValidationService } from './field-validation.service';
import { FormulaEvaluatorService } from './formula-evaluator.service';

@Injectable()
export class EntityService {
  private readonly logger = new Logger(EntityService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(GlobalCounter)
    private globalCounterRepository: Repository<GlobalCounter>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private eventsGateway: EventsGateway,
    private s3Service: S3Service,
    @Inject(forwardRef(() => AuditLogService))
    private auditLogService: AuditLogService,
    private emailService: EmailService,
    private configService: ConfigService,
    @Inject(forwardRef(() => AutomationService))
    private automationService: AutomationService,
    @Optional()
    @Inject(forwardRef(() => TriggersService))
    private triggersService: TriggersService,
    private slaService: SlaService,
    private fieldValidationService: FieldValidationService,
    private formulaEvaluatorService: FormulaEvaluatorService,
  ) {
    this.frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
  }

  async findAll(workspaceId?: string): Promise<WorkspaceEntity[]> {
    return this.entityRepository.find({
      where: workspaceId ? { workspaceId } : {},
      relations: ['assignee'],
      order: { createdAt: 'DESC' },
    });
  }

  async findForKanban(query: KanbanQueryDto): Promise<{
    columns: { status: string; items: WorkspaceEntity[]; total: number; hasMore: boolean }[];
    totalAll: number;
  }> {
    const perColumn = query.perColumn || 20;

    // 1) Counts per status
    const countQb = this.entityRepository
      .createQueryBuilder('entity')
      .select('entity.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('entity.workspaceId = :workspaceId', { workspaceId: query.workspaceId });

    this.applyKanbanFilters(countQb, query);
    countQb.groupBy('entity.status');

    const statusCounts = await countQb.getRawMany<{ status: string; count: number }>();
    const countMap = new Map(statusCounts.map((r) => [r.status, Number(r.count)]));

    // 2) First N entities per status (parallel)
    const statuses = Array.from(countMap.keys());
    const columnPromises = statuses.map(async (status) => {
      const total = countMap.get(status) || 0;
      if (total === 0) return { status, items: [] as WorkspaceEntity[], total: 0, hasMore: false };

      const qb = this.entityRepository
        .createQueryBuilder('entity')
        .leftJoinAndSelect('entity.assignee', 'assignee')
        .where('entity.workspaceId = :workspaceId', { workspaceId: query.workspaceId })
        .andWhere('entity.status = :status', { status });

      this.applyKanbanFilters(qb, query);
      this.applyKanbanSort(qb);
      qb.take(perColumn);

      const items = await qb.getMany();
      return { status, items, total, hasMore: total > perColumn };
    });

    const columns = await Promise.all(columnPromises);
    const totalAll = statusCounts.reduce((sum, r) => sum + Number(r.count), 0);

    return { columns, totalAll };
  }

  async findColumnPage(query: ColumnLoadMoreDto): Promise<{
    items: WorkspaceEntity[];
    total: number;
    hasMore: boolean;
  }> {
    const limit = query.limit || 20;

    const qb = this.entityRepository
      .createQueryBuilder('entity')
      .leftJoinAndSelect('entity.assignee', 'assignee')
      .where('entity.workspaceId = :workspaceId', { workspaceId: query.workspaceId })
      .andWhere('entity.status = :status', { status: query.status });

    this.applyKanbanFilters(qb, query);
    this.applyKanbanSort(qb);
    qb.skip(query.offset).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, hasMore: query.offset + items.length < total };
  }

  private applyKanbanFilters(
    qb: SelectQueryBuilder<WorkspaceEntity>,
    filters: { search?: string; assigneeId?: string[]; priority?: string[]; dateFrom?: string; dateTo?: string },
  ): void {
    if (filters.search) {
      qb.andWhere(
        '(LOWER(entity.title) LIKE LOWER(:search) OR LOWER(entity.customId) LIKE LOWER(:search))',
        { search: `%${filters.search}%` },
      );
    }
    if (filters.assigneeId?.length) {
      qb.andWhere('entity.assigneeId IN (:...assigneeIds)', { assigneeIds: filters.assigneeId });
    }
    if (filters.priority?.length) {
      qb.andWhere('entity.priority IN (:...priorities)', { priorities: filters.priority });
    }
    if (filters.dateFrom) {
      qb.andWhere('entity.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('entity.createdAt <= :dateTo', { dateTo: new Date(filters.dateTo + 'T23:59:59.999Z') });
    }
  }

  private applyKanbanSort(qb: SelectQueryBuilder<WorkspaceEntity>): void {
    qb.orderBy(
      "CASE entity.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END",
      'ASC',
    ).addOrderBy('entity.createdAt', 'DESC');
  }

  async search(
    query: string,
    workspaceIds: string[],
    limit = 10,
  ): Promise<{ entities: WorkspaceEntity[]; workspaces: Map<string, Workspace> }> {
    const qb = this.entityRepository
      .createQueryBuilder('entity')
      .leftJoinAndSelect('entity.assignee', 'assignee')
      .where('entity.workspaceId IN (:...workspaceIds)', { workspaceIds })
      .andWhere(
        '(LOWER(entity.title) LIKE LOWER(:query) OR LOWER(entity.customId) LIKE LOWER(:query))',
        { query: `%${query}%` },
      )
      .orderBy('entity.createdAt', 'DESC')
      .limit(limit);

    const entities = await qb.getMany();

    // Загружаем информацию о workspace для отображения
    const uniqueWorkspaceIds = [...new Set(entities.map((e) => e.workspaceId))];
    const workspaces = new Map<string, Workspace>();

    if (uniqueWorkspaceIds.length > 0) {
      const workspaceList = await this.workspaceRepository.find({
        where: uniqueWorkspaceIds.map((id) => ({ id })),
      });
      for (const ws of workspaceList) {
        workspaces.set(ws.id, ws);
      }
    }

    return { entities, workspaces };
  }

  async findOne(id: string): Promise<any> {
    const entity = await this.entityRepository.findOne({
      where: { id },
      relations: ['assignee', 'comments', 'comments.author'],
    });
    if (!entity) {
      throw new NotFoundException(`Entity ${id} not found`);
    }

    // Generate signed URLs for all comment attachments
    if (entity.comments && entity.comments.length > 0) {
      const allKeys: string[] = [];
      for (const comment of entity.comments) {
        for (const att of comment.attachments || []) {
          if (att.key) allKeys.push(att.key);
          if (att.thumbnailKey) allKeys.push(att.thumbnailKey);
        }
      }

      if (allKeys.length > 0) {
        const signedUrls = await this.s3Service.getSignedUrlsBatch(allKeys);

        // Map attachments with signed URLs
        const commentsWithUrls = entity.comments.map((comment) => ({
          ...comment,
          attachments: (comment.attachments || []).map((att) => ({
            id: att.id,
            name: att.name,
            size: att.size,
            mimeType: att.mimeType,
            key: att.key,
            url: signedUrls.get(att.key) || '',
            thumbnailUrl: att.thumbnailKey
              ? signedUrls.get(att.thumbnailKey)
              : undefined,
          })),
        }));

        return { ...entity, comments: commentsWithUrls };
      }
    }

    return entity;
  }

  async create(dto: CreateEntityDto, actorId?: string): Promise<WorkspaceEntity> {
    // Генерируем customId в транзакции для избежания дублирования номеров
    const saved = await this.dataSource.transaction(async (manager) => {
      // Получаем workspace для prefix
      const workspace = await manager.findOne(Workspace, {
        where: { id: dto.workspaceId },
      });

      if (!workspace) {
        throw new NotFoundException(`Workspace ${dto.workspaceId} not found`);
      }

      // Валидация data по полям workspace
      if (dto.data && workspace.sections) {
        this.fieldValidationService.validateEntityData(dto.data, workspace.sections);
        // Пересчёт computed полей
        dto.data = this.formulaEvaluatorService.computeFields(dto.data, workspace.sections);
      }

      // Получаем или создаём глобальный счётчик с блокировкой
      let counter = await manager.findOne(GlobalCounter, {
        where: { name: 'entity_number' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!counter) {
        // Первый запуск - создаём счётчик и инициализируем его максимальным номером из существующих заявок
        const maxResult = await manager
          .createQueryBuilder(WorkspaceEntity, 'e')
          .select('MAX(CAST(SPLIT_PART(e.customId, \'-\', 2) AS INTEGER))', 'maxNum')
          .getRawOne();

        const maxNum = maxResult?.maxNum || 0;

        counter = manager.create(GlobalCounter, {
          name: 'entity_number',
          value: maxNum,
        });
      }

      // Инкрементируем глобальный счётчик
      counter.value += 1;
      await manager.save(GlobalCounter, counter);

      // Генерируем customId с prefix workspace и глобальным номером
      const customId = `${workspace.prefix}-${counter.value}`;

      // Создаём entity с сгенерированным customId
      const entity = manager.create(WorkspaceEntity, {
        ...dto,
        customId,
      });

      return manager.save(WorkspaceEntity, entity);
    });

    this.eventsGateway.emitEntityCreated(saved);

    // Логирование создания
    if (actorId) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_CREATED,
        dto.workspaceId,
        actorId,
        {
          description: 'Создана заявка',
          newValues: { title: saved.title, status: saved.status, customId: saved.customId },
        },
        saved.id,
      );
    }

    // Автоматизация: триггер ON_CREATE
    try {
      const entityWithRelations = await this.findOne(saved.id);
      await this.automationService.executeRules({
        entity: entityWithRelations,
        trigger: TriggerType.ON_CREATE,
      });
    } catch (err) {
      this.logger.error(`Automation error on create: ${err.message}`);
    }

    // BPMN триггеры: entity_created
    if (this.triggersService) {
      try {
        await this.triggersService.evaluateTriggers(
          BpmnTriggerType.ENTITY_CREATED,
          {
            entityId: saved.id,
            workspaceId: saved.workspaceId,
            title: saved.title,
            status: saved.status,
            priority: saved.priority,
            customId: saved.customId,
            createdById: actorId,
          },
          saved.workspaceId,
        );
      } catch (err) {
        this.logger.error(`BPMN trigger error on create: ${err.message}`);
      }
    }

    // SLA: создаём SLA instance для новой заявки
    try {
      const slaInstance = await this.slaService.createInstance(
        saved.workspaceId,
        'entity',
        saved.id,
        {
          status: saved.status,
          priority: saved.priority,
          ...saved.data,
        },
      );
      if (slaInstance) {
        this.logger.log(`SLA instance created for entity ${saved.id}: ${slaInstance.id}`);
      }
    } catch (err) {
      this.logger.error(`SLA creation error: ${err.message}`);
    }

    return saved;
  }

  async update(id: string, dto: UpdateEntityDto, actorId?: string): Promise<WorkspaceEntity> {
    const current = await this.findOne(id);

    // Валидация data по полям workspace
    if (dto.data) {
      const workspace = await this.workspaceRepository.findOne({
        where: { id: current.workspaceId },
      });
      if (workspace?.sections) {
        this.fieldValidationService.validateEntityData(dto.data, workspace.sections);
        // Пересчёт computed полей
        dto.data = this.formulaEvaluatorService.computeFields(dto.data, workspace.sections);
      }
    }

    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    const changedFields: string[] = [];

    // Определяем изменённые поля
    for (const key of Object.keys(dto)) {
      if (current[key] !== (dto as any)[key]) {
        oldValues[key] = current[key];
        newValues[key] = (dto as any)[key];
        changedFields.push(key);
      }
    }

    await this.entityRepository.update(id, dto);
    const updated = await this.findOne(id);
    this.eventsGateway.emitEntityUpdated(updated);

    // Логирование обновления
    if (actorId && changedFields.length > 0) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_UPDATED,
        current.workspaceId,
        actorId,
        {
          description: 'Обновлена заявка',
          oldValues,
          newValues,
          changedFields,
        },
        id,
      );
    }

    return updated;
  }

  async updateStatus(id: string, status: string, actorId?: string): Promise<WorkspaceEntity> {
    const current = await this.findOne(id);
    const oldStatus = current.status;

    await this.entityRepository.update(id, { status });
    const updated = await this.findOne(id);
    this.eventsGateway.emitStatusChanged({ id, status, entity: updated });

    // Логирование изменения статуса
    if (actorId && oldStatus !== status) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_STATUS_CHANGED,
        current.workspaceId,
        actorId,
        {
          description: 'Изменён статус',
          oldValues: { status: oldStatus },
          newValues: { status },
          changedFields: ['status'],
        },
        id,
      );

      // Email уведомление исполнителю об изменении статуса
      if (updated.assigneeId && updated.assigneeId !== actorId) {
        const [assignee, changedBy] = await Promise.all([
          this.userRepository.findOne({ where: { id: updated.assigneeId } }),
          actorId ? this.userRepository.findOne({ where: { id: actorId } }) : null,
        ]);
        if (assignee && changedBy) {
          this.emailService.sendStatusChangeNotification(
            assignee, updated, changedBy, oldStatus, status, this.frontendUrl,
          ).catch(() => {}); // Не блокируем при ошибке
        }
      }

      // Автоматизация: триггер ON_STATUS_CHANGE
      try {
        await this.automationService.executeRules({
          entity: updated,
          previousEntity: current,
          trigger: TriggerType.ON_STATUS_CHANGE,
        });
      } catch (err) {
        this.logger.error(`Automation error on status change: ${err.message}`);
      }

      // BPMN триггеры: status_changed
      if (this.triggersService) {
        try {
          await this.triggersService.evaluateTriggers(
            BpmnTriggerType.STATUS_CHANGED,
            {
              entityId: id,
              workspaceId: current.workspaceId,
              oldStatus,
              newStatus: status,
              title: updated.title,
              priority: updated.priority,
              assigneeId: updated.assigneeId,
              userId: actorId,
            },
            current.workspaceId,
          );
        } catch (err) {
          this.logger.error(`BPMN trigger error on status change: ${err.message}`);
        }
      }

      // SLA: отмечаем закрытие при переходе в финальный статус
      const closedStatuses = ['closed', 'done', 'resolved', 'cancelled', 'completed'];
      if (closedStatuses.includes(status.toLowerCase())) {
        try {
          await this.slaService.recordResolution('entity', id);
          this.logger.log(`SLA resolution recorded for entity ${id}`);
        } catch (err) {
          this.logger.error(`SLA resolution error: ${err.message}`);
        }
      }
    }

    return updated;
  }

  async updateAssignee(
    id: string,
    assigneeId: string | null,
    actorId?: string,
  ): Promise<WorkspaceEntity> {
    const current = await this.findOne(id);
    const previousAssigneeId = current.assigneeId;
    await this.entityRepository.update(id, { assigneeId });
    const updated = await this.findOne(id);
    this.eventsGateway.emitEntityUpdated(updated);

    // Emit specific assignee change event for notifications
    if (assigneeId !== previousAssigneeId) {
      this.eventsGateway.emitAssigneeChanged({
        entityId: id,
        entity: updated,
        assigneeId,
        previousAssigneeId,
      });

      // Логирование изменения исполнителя
      if (actorId) {
        await this.auditLogService.log(
          AuditActionType.ENTITY_ASSIGNEE_CHANGED,
          current.workspaceId,
          actorId,
          {
            description: 'Изменён исполнитель',
            oldValues: { assigneeId: previousAssigneeId },
            newValues: { assigneeId },
            changedFields: ['assigneeId'],
          },
          id,
        );
      }

      // Email уведомление новому исполнителю
      if (assigneeId && actorId && assigneeId !== actorId) {
        const [assignee, assignedBy] = await Promise.all([
          this.userRepository.findOne({ where: { id: assigneeId } }),
          this.userRepository.findOne({ where: { id: actorId } }),
        ]);
        if (assignee && assignedBy) {
          this.emailService.sendAssignmentNotification(
            assignee, updated, assignedBy, this.frontendUrl,
          ).catch(() => {}); // Не блокируем при ошибке
        }
      }

      // Автоматизация: триггер ON_ASSIGN
      try {
        await this.automationService.executeRules({
          entity: updated,
          previousEntity: current,
          trigger: TriggerType.ON_ASSIGN,
        });
      } catch (err) {
        this.logger.error(`Automation error on assign: ${err.message}`);
      }

      // BPMN триггеры: assignee_changed
      if (this.triggersService) {
        try {
          await this.triggersService.evaluateTriggers(
            BpmnTriggerType.ASSIGNEE_CHANGED,
            {
              entityId: id,
              workspaceId: current.workspaceId,
              oldAssigneeId: previousAssigneeId,
              newAssigneeId: assigneeId,
              title: updated.title,
              status: updated.status,
              priority: updated.priority,
              assignedById: actorId,
            },
            current.workspaceId,
          );
        } catch (err) {
          this.logger.error(`BPMN trigger error on assignee change: ${err.message}`);
        }
      }
    }

    return updated;
  }

  async remove(id: string, actorId?: string): Promise<void> {
    const entity = await this.findOne(id);

    // Логирование удаления (перед удалением, чтобы сохранить данные)
    if (actorId) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_DELETED,
        entity.workspaceId,
        actorId,
        {
          description: 'Удалена заявка',
          oldValues: { title: entity.title, customId: entity.customId, status: entity.status },
        },
        id,
      );
    }

    await this.entityRepository.remove(entity);
  }

  async removeTestData(): Promise<{ deleted: number }> {
    const testPatterns = [
      'Playwright',
      'Тест карточки',
      'DnD тест',
      'УникальнаяЗаявка',
      'Уведомление ',
      '[E2E]',
    ];

    const entities = await this.entityRepository.find();
    const testEntities = entities.filter((e) =>
      testPatterns.some((pattern) => e.title.includes(pattern)),
    );

    if (testEntities.length > 0) {
      await this.entityRepository.remove(testEntities);
    }

    return { deleted: testEntities.length };
  }

  // ==================== Export / Import ====================

  async exportToCsv(workspaceId: string): Promise<string> {
    const entities = await this.entityRepository.find({
      where: { workspaceId },
      relations: ['assignee'],
      order: { createdAt: 'DESC' },
    });

    const headers = ['ID', 'Номер', 'Название', 'Статус', 'Приоритет', 'Исполнитель', 'Создано'];
    const rows = entities.map((e) => [
      e.id,
      e.customId,
      `"${(e.title || '').replace(/"/g, '""')}"`,
      e.status,
      e.priority || '',
      e.assignee ? `${e.assignee.firstName} ${e.assignee.lastName}` : '',
      e.createdAt.toISOString(),
    ]);

    return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  }

  async exportToJson(workspaceId: string): Promise<object> {
    const entities = await this.entityRepository.find({
      where: { workspaceId },
      relations: ['assignee'],
      order: { createdAt: 'DESC' },
    });

    return {
      exportedAt: new Date().toISOString(),
      workspaceId,
      count: entities.length,
      entities: entities.map((e) => ({
        customId: e.customId,
        title: e.title,
        status: e.status,
        priority: e.priority,
        data: e.data,
        assignee: e.assignee
          ? { email: e.assignee.email, name: `${e.assignee.firstName} ${e.assignee.lastName}` }
          : null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    };
  }

  async importFromCsv(
    workspaceId: string,
    csv: string,
    actorId: string,
  ): Promise<{ imported: number; errors: string[] }> {
    const lines = csv.split('\n').filter((line) => line.trim());
    if (lines.length < 2) {
      return { imported: 0, errors: ['Файл пуст или содержит только заголовки'] };
    }

    // Пропускаем заголовок
    const dataLines = lines.slice(1);
    const errors: string[] = [];
    let imported = 0;

    for (let i = 0; i < dataLines.length; i++) {
      try {
        const line = dataLines[i];
        // Парсим CSV с учётом кавычек
        const parts = this.parseCsvLine(line);

        if (parts.length < 3) {
          errors.push(`Строка ${i + 2}: недостаточно полей`);
          continue;
        }

        const title = parts[2]?.replace(/^"|"$/g, '').replace(/""/g, '"') || '';
        const status = parts[3] || 'new';
        const priority = parts[4] as 'low' | 'medium' | 'high' | undefined;

        if (!title) {
          errors.push(`Строка ${i + 2}: название не указано`);
          continue;
        }

        await this.create(
          {
            workspaceId,
            title,
            status,
            priority: priority || 'medium',
            data: {},
          },
          actorId,
        );
        imported++;
      } catch (err) {
        errors.push(`Строка ${i + 2}: ${(err as Error).message}`);
      }
    }

    return { imported, errors };
  }

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
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ';' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }
}
