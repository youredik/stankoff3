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
import { TableQueryDto } from './dto/table-query.dto';
import { FacetsQueryDto } from './dto/facets-query.dto';
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
import { ClassifierService } from '../ai/services/classifier.service';
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
    @Optional()
    @Inject(forwardRef(() => ClassifierService))
    private classifierService: ClassifierService,
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

    // Загружаем workspace для метаданных полей (нужно для JSONB фильтрации)
    const workspace = query.customFilters
      ? await this.workspaceRepository.findOne({ where: { id: query.workspaceId } }) || undefined
      : undefined;

    // 1) Counts per status
    const countQb = this.entityRepository
      .createQueryBuilder('entity')
      .select('entity.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('entity.workspaceId = :workspaceId', { workspaceId: query.workspaceId });

    this.applyKanbanFilters(countQb, query, workspace);
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

      this.applyKanbanFilters(qb, query, workspace);
      this.applyKanbanSort(qb);
      qb.limit(perColumn);

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

    const workspace = query.customFilters
      ? await this.workspaceRepository.findOne({ where: { id: query.workspaceId } }) || undefined
      : undefined;

    const qb = this.entityRepository
      .createQueryBuilder('entity')
      .leftJoinAndSelect('entity.assignee', 'assignee')
      .where('entity.workspaceId = :workspaceId', { workspaceId: query.workspaceId })
      .andWhere('entity.status = :status', { status: query.status });

    this.applyKanbanFilters(qb, query, workspace);
    this.applyKanbanSort(qb);
    qb.offset(query.offset).limit(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, hasMore: query.offset + items.length < total };
  }

  async findForTable(query: TableQueryDto): Promise<{
    items: WorkspaceEntity[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const page = query.page || 1;
    const perPage = query.perPage || 25;

    const workspace = query.customFilters
      ? await this.workspaceRepository.findOne({ where: { id: query.workspaceId } }) || undefined
      : undefined;

    const qb = this.entityRepository
      .createQueryBuilder('entity')
      .leftJoinAndSelect('entity.assignee', 'assignee')
      .where('entity.workspaceId = :workspaceId', { workspaceId: query.workspaceId });

    this.applyKanbanFilters(qb, query, workspace);

    if (query.status?.length) {
      qb.andWhere('entity.status IN (:...statuses)', { statuses: query.status });
    }

    this.applyTableSort(qb, query.sortBy || 'createdAt', query.sortOrder || 'DESC');

    qb.skip((page - 1) * perPage).take(perPage);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / perPage);

    return { items, total, page, perPage, totalPages };
  }

  private applyTableSort(
    qb: SelectQueryBuilder<WorkspaceEntity>,
    sortBy: string,
    sortOrder: 'ASC' | 'DESC',
  ): void {
    const sortMap: Record<string, string> = {
      createdAt: 'entity.createdAt',
      updatedAt: 'entity.updatedAt',
      title: 'entity.title',
      customId: 'entity.customId',
      status: 'entity.status',
      commentCount: 'entity.commentCount',
      lastActivityAt: 'entity.lastActivityAt',
    };

    if (sortBy === 'priority') {
      qb.orderBy(
        `CASE "entity"."priority" WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
        sortOrder,
      );
    } else if (sortBy === 'assignee') {
      qb.orderBy('assignee.firstName', sortOrder, 'NULLS LAST');
    } else {
      const column = sortMap[sortBy] || 'entity.createdAt';
      qb.orderBy(column, sortOrder, 'NULLS LAST');
    }
  }

  private applyKanbanFilters(
    qb: SelectQueryBuilder<WorkspaceEntity>,
    filters: { search?: string; assigneeId?: string[]; priority?: string[]; dateFrom?: string; dateTo?: string; customFilters?: string },
    workspace?: Workspace,
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
    if (filters.customFilters && workspace) {
      this.applyCustomFilters(qb, filters.customFilters, workspace);
    }
  }

  private applyCustomFilters(
    qb: SelectQueryBuilder<WorkspaceEntity>,
    customFiltersJson: string,
    workspace: Workspace,
  ): void {
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(customFiltersJson);
    } catch {
      return;
    }

    // Собираем все поля workspace в map fieldId → field
    const fieldMap = new Map<string, { type: string; config?: Record<string, any> }>();
    for (const section of workspace.sections || []) {
      for (const field of section.fields || []) {
        fieldMap.set(field.id, { type: field.type, config: field.config });
      }
    }

    let paramIndex = 0;
    for (const [fieldId, filterValue] of Object.entries(parsed)) {
      if (filterValue == null) continue;
      const fieldMeta = fieldMap.get(fieldId);
      if (!fieldMeta) continue;

      const pi = paramIndex++;
      const safeFieldId = fieldId.replace(/[^a-zA-Z0-9_-]/g, '');

      switch (fieldMeta.type) {
        case 'select':
        case 'user': {
          // массив выбранных значений
          if (Array.isArray(filterValue) && filterValue.length > 0) {
            const isMulti = fieldMeta.config?.multiSelect;
            if (isMulti) {
              // multiSelect хранит массив в data: проверяем пересечение
              qb.andWhere(`entity.data->'${safeFieldId}' ?| ARRAY[:...cf_${pi}]`, {
                [`cf_${pi}`]: filterValue,
              });
            } else {
              // single select: строковое значение
              qb.andWhere(`entity.data->>'${safeFieldId}' IN (:...cf_${pi})`, {
                [`cf_${pi}`]: filterValue,
              });
            }
          }
          break;
        }
        case 'number': {
          // { min?: number, max?: number }
          if (typeof filterValue === 'object') {
            if (filterValue.min != null) {
              qb.andWhere(`(entity.data->>'${safeFieldId}')::numeric >= :cf_${pi}_min`, {
                [`cf_${pi}_min`]: filterValue.min,
              });
            }
            if (filterValue.max != null) {
              qb.andWhere(`(entity.data->>'${safeFieldId}')::numeric <= :cf_${pi}_max`, {
                [`cf_${pi}_max`]: filterValue.max,
              });
            }
          }
          break;
        }
        case 'date': {
          // { from?: string, to?: string }
          if (typeof filterValue === 'object') {
            if (filterValue.from) {
              qb.andWhere(`(entity.data->>'${safeFieldId}')::timestamp >= :cf_${pi}_from`, {
                [`cf_${pi}_from`]: filterValue.from,
              });
            }
            if (filterValue.to) {
              qb.andWhere(`(entity.data->>'${safeFieldId}')::timestamp <= :cf_${pi}_to`, {
                [`cf_${pi}_to`]: new Date(filterValue.to + 'T23:59:59.999Z'),
              });
            }
          }
          break;
        }
        case 'checkbox': {
          // boolean
          if (typeof filterValue === 'boolean') {
            qb.andWhere(`(entity.data->>'${safeFieldId}')::boolean = :cf_${pi}`, {
              [`cf_${pi}`]: filterValue,
            });
          }
          break;
        }
        case 'text':
        case 'textarea':
        case 'url': {
          // текстовый поиск
          if (typeof filterValue === 'string' && filterValue.trim()) {
            qb.andWhere(`LOWER(entity.data->>'${safeFieldId}') LIKE LOWER(:cf_${pi})`, {
              [`cf_${pi}`]: `%${filterValue}%`,
            });
          }
          break;
        }
        case 'client': {
          // поиск по name/phone/email полям client объекта
          if (typeof filterValue === 'string' && filterValue.trim()) {
            qb.andWhere(
              `LOWER(COALESCE(entity.data->'${safeFieldId}'->>'name','') || ' ' || COALESCE(entity.data->'${safeFieldId}'->>'phone','') || ' ' || COALESCE(entity.data->'${safeFieldId}'->>'email','')) LIKE LOWER(:cf_${pi})`,
              { [`cf_${pi}`]: `%${filterValue}%` },
            );
          }
          break;
        }
      }
    }
  }

  private applyKanbanSort(qb: SelectQueryBuilder<WorkspaceEntity>): void {
    qb.orderBy(
      `CASE "entity"."priority" WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
      'ASC',
    )
      .addOrderBy('entity.createdAt', 'DESC');
  }

  // ==================== Faceted Search ====================

  private readonly SKIP_FACET_TYPES = ['status', 'file', 'relation', 'geolocation'];

  async getFacets(query: FacetsQueryDto): Promise<{
    builtIn: {
      status: { value: string; count: number }[];
      priority: { value: string; count: number }[];
      assignee: { value: string; count: number }[];
      createdAt: { min: string | null; max: string | null };
    };
    custom: Record<string, any>;
  }> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: query.workspaceId } });
    if (!workspace) {
      return {
        builtIn: { status: [], priority: [], assignee: [], createdAt: { min: null, max: null } },
        custom: {},
      };
    }

    // Собираем фильтруемые кастомные поля
    const filterableFields: { id: string; type: string; config?: Record<string, any>; options?: { id: string; label: string }[] }[] = [];
    for (const section of workspace.sections || []) {
      for (const field of section.fields || []) {
        if (!this.SKIP_FACET_TYPES.includes(field.type) && !['title', 'assignee', 'priority'].includes(field.id)) {
          filterableFields.push(field);
        }
      }
    }

    // Создаём базовый QueryBuilder с применёнными фильтрами
    const createBaseQb = () => {
      const qb = this.entityRepository
        .createQueryBuilder('entity')
        .where('entity.workspaceId = :workspaceId', { workspaceId: query.workspaceId });
      this.applyKanbanFilters(qb, query, workspace);
      return qb;
    };

    // Параллельно считаем все фасеты
    const [statusFacets, priorityFacets, assigneeFacets, dateFacets, ...customFacets] = await Promise.all([
      // Status facet
      createBaseQb()
        .select('entity.status', 'value')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy('entity.status')
        .getRawMany<{ value: string; count: number }>(),

      // Priority facet
      createBaseQb()
        .select('entity.priority', 'value')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy('entity.priority')
        .getRawMany<{ value: string; count: number }>(),

      // Assignee facet
      createBaseQb()
        .select('entity.assigneeId', 'value')
        .addSelect('COUNT(*)::int', 'count')
        .andWhere('entity.assigneeId IS NOT NULL')
        .groupBy('entity.assigneeId')
        .getRawMany<{ value: string; count: number }>(),

      // CreatedAt range
      createBaseQb()
        .select('MIN(entity.createdAt)', 'min')
        .addSelect('MAX(entity.createdAt)', 'max')
        .getRawOne<{ min: string | null; max: string | null }>(),

      // Custom field facets
      ...filterableFields.map((field) => this.computeFieldFacet(createBaseQb, field)),
    ]);

    // Собираем результат custom facets
    const customResult: Record<string, any> = {};
    filterableFields.forEach((field, index) => {
      customResult[field.id] = customFacets[index];
    });

    return {
      builtIn: {
        status: statusFacets,
        priority: priorityFacets.filter((f) => f.value != null),
        assignee: assigneeFacets,
        createdAt: dateFacets || { min: null, max: null },
      },
      custom: customResult,
    };
  }

  private async computeFieldFacet(
    createBaseQb: () => SelectQueryBuilder<WorkspaceEntity>,
    field: { id: string; type: string; config?: Record<string, any>; options?: { id: string; label: string }[] },
  ): Promise<any> {
    const safeFieldId = field.id.replace(/[^a-zA-Z0-9_-]/g, '');

    switch (field.type) {
      case 'select': {
        const isMulti = field.config?.multiSelect;
        let raw: { value: string; count: number }[];

        if (isMulti) {
          // Для multiSelect (массив в JSONB) — unnest
          raw = await createBaseQb()
            .select(`jsonb_array_elements_text(entity.data->'${safeFieldId}')`, 'value')
            .addSelect('COUNT(*)::int', 'count')
            .andWhere(`entity.data ? '${safeFieldId}'`)
            .andWhere(`jsonb_typeof(entity.data->'${safeFieldId}') = 'array'`)
            .groupBy('value')
            .getRawMany();
        } else {
          raw = await createBaseQb()
            .select(`entity.data->>'${safeFieldId}'`, 'value')
            .addSelect('COUNT(*)::int', 'count')
            .andWhere(`entity.data->>'${safeFieldId}' IS NOT NULL`)
            .andWhere(`entity.data->>'${safeFieldId}' != ''`)
            .groupBy('value')
            .getRawMany();
        }

        // Добавляем label из options
        const optionMap = new Map((field.options || []).map((o) => [o.id, o.label]));
        return {
          type: 'select',
          values: raw.map((r) => ({
            value: r.value,
            label: optionMap.get(r.value) || r.value,
            count: Number(r.count),
          })),
        };
      }

      case 'number': {
        const result = await createBaseQb()
          .select(`MIN((entity.data->>'${safeFieldId}')::numeric)`, 'min')
          .addSelect(`MAX((entity.data->>'${safeFieldId}')::numeric)`, 'max')
          .addSelect('COUNT(*)::int', 'count')
          .andWhere(`entity.data->>'${safeFieldId}' IS NOT NULL`)
          .andWhere(`entity.data->>'${safeFieldId}' != ''`)
          .andWhere(`entity.data->>'${safeFieldId}' ~ '^-?[0-9]+(\\.[0-9]+)?$'`)
          .getRawOne();

        return {
          type: 'number',
          min: result?.min != null ? Number(result.min) : null,
          max: result?.max != null ? Number(result.max) : null,
          count: Number(result?.count || 0),
        };
      }

      case 'date': {
        const result = await createBaseQb()
          .select(`MIN(entity.data->>'${safeFieldId}')`, 'min')
          .addSelect(`MAX(entity.data->>'${safeFieldId}')`, 'max')
          .addSelect('COUNT(*)::int', 'count')
          .andWhere(`entity.data->>'${safeFieldId}' IS NOT NULL`)
          .andWhere(`entity.data->>'${safeFieldId}' != ''`)
          .getRawOne();

        return {
          type: 'date',
          min: result?.min || null,
          max: result?.max || null,
          count: Number(result?.count || 0),
        };
      }

      case 'checkbox': {
        const raw = await createBaseQb()
          .select(`(entity.data->>'${safeFieldId}')::text`, 'value')
          .addSelect('COUNT(*)::int', 'count')
          .groupBy('value')
          .getRawMany<{ value: string; count: number }>();

        let trueCount = 0;
        let falseCount = 0;
        let total = 0;
        for (const r of raw) {
          const c = Number(r.count);
          total += c;
          if (r.value === 'true') trueCount = c;
          else falseCount += c;
        }

        return { type: 'checkbox', trueCount, falseCount, total };
      }

      case 'user': {
        const isMulti = field.config?.multiSelect;
        let raw: { value: string; count: number }[];

        if (isMulti) {
          raw = await createBaseQb()
            .select(`jsonb_array_elements_text(entity.data->'${safeFieldId}')`, 'value')
            .addSelect('COUNT(*)::int', 'count')
            .andWhere(`entity.data ? '${safeFieldId}'`)
            .andWhere(`jsonb_typeof(entity.data->'${safeFieldId}') = 'array'`)
            .groupBy('value')
            .getRawMany();
        } else {
          raw = await createBaseQb()
            .select(`entity.data->>'${safeFieldId}'`, 'value')
            .addSelect('COUNT(*)::int', 'count')
            .andWhere(`entity.data->>'${safeFieldId}' IS NOT NULL`)
            .andWhere(`entity.data->>'${safeFieldId}' != ''`)
            .groupBy('value')
            .getRawMany();
        }

        return {
          type: 'user',
          values: raw.map((r) => ({ value: r.value, count: Number(r.count) })),
        };
      }

      case 'text':
      case 'textarea':
      case 'url': {
        // Для текстовых полей — уникальные значения (top 50)
        const raw = await createBaseQb()
          .select(`entity.data->>'${safeFieldId}'`, 'value')
          .addSelect('COUNT(*)::int', 'count')
          .andWhere(`entity.data->>'${safeFieldId}' IS NOT NULL`)
          .andWhere(`entity.data->>'${safeFieldId}' != ''`)
          .groupBy('value')
          .orderBy('count', 'DESC')
          .limit(50)
          .getRawMany<{ value: string; count: number }>();

        return {
          type: 'text',
          values: raw.map((r) => r.value),
          count: raw.reduce((sum, r) => sum + Number(r.count), 0),
        };
      }

      case 'client': {
        // Для client поля — count заполненных
        const result = await createBaseQb()
          .select('COUNT(*)::int', 'count')
          .andWhere(`entity.data->>'${safeFieldId}' IS NOT NULL`)
          .andWhere(`entity.data->>'${safeFieldId}' != ''`)
          .andWhere(`entity.data->>'${safeFieldId}' != '{}'`)
          .getRawOne();

        return { type: 'client', count: Number(result?.count || 0) };
      }

      default:
        return { type: field.type, count: 0 };
    }
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

      // Резолв дефолтного статуса из конфигурации workspace
      // Если статус не передан или не существует среди статусов этого workspace —
      // используем первый статус из конфига (защита от race condition на фронте)
      const rawStatus = dto.status || 'new';
      const resolvedStatus = this.resolveStatusFromSections(rawStatus, workspace.sections);
      if (resolvedStatus !== rawStatus) {
        this.logger.warn(
          `Entity status "${rawStatus}" is invalid for workspace ${dto.workspaceId}, using default "${resolvedStatus}"`,
        );
      }

      // Валидация data по полям workspace
      let resolvedData = dto.data || {};
      if (resolvedData && workspace.sections) {
        this.fieldValidationService.validateEntityData(resolvedData, workspace.sections);
        resolvedData = this.formulaEvaluatorService.computeFields(resolvedData, workspace.sections);
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

      // Создаём entity с прямым присвоением свойств
      // (manager.create + spread DTO ненадёжен: INSERT может использовать старые значения DTO)
      const entity = new WorkspaceEntity();
      entity.workspaceId = dto.workspaceId;
      entity.title = dto.title;
      entity.status = resolvedStatus;
      entity.priority = dto.priority as string;
      entity.assigneeId = dto.assigneeId ?? null;
      entity.creatorId = dto.creatorId || actorId || null;
      entity.data = resolvedData;
      entity.customId = customId;

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

    // AI: автоклассификация в фоне (fire-and-forget)
    if (this.classifierService) {
      this.runAutoClassification(saved, actorId).catch((err) => {
        this.logger.error(`Auto-classification error for entity ${saved.id}: ${err.message}`);
      });
    }

    return saved;
  }

  /**
   * Автоклассификация entity через AI (fire-and-forget)
   */
  private async runAutoClassification(
    entity: WorkspaceEntity,
    actorId?: string,
  ): Promise<void> {
    if (!entity.title || entity.title.length < 5) return;

    const description = (entity.data as Record<string, unknown>)?.description;

    const classification = await this.classifierService.classifyAndSave(
      entity.id,
      {
        title: entity.title,
        description: typeof description === 'string' ? description : '',
        workspaceId: entity.workspaceId,
      },
      actorId,
    );

    this.eventsGateway.emitAiClassificationReady({
      entityId: entity.id,
      workspaceId: entity.workspaceId,
      classification: {
        category: classification.category,
        priority: classification.priority,
        skills: classification.skills as string[],
        confidence: classification.confidence,
      },
    });

    this.logger.log(
      `Auto-classification completed for entity ${entity.id}: ${classification.category} (${classification.confidence})`,
    );
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

    // Валидация статуса против конфигурации workspace.
    // Если запрошенный статус невалиден — сохраняем текущий (не меняем).
    const resolvedStatus = await this.resolveValidStatus(status, current.workspaceId);
    if (resolvedStatus !== status) {
      this.logger.warn(
        `updateStatus: status "${status}" is invalid for workspace ${current.workspaceId}, keeping current "${oldStatus}"`,
      );
      return current;
    }

    // Если статус совпадает с текущим — ничего не делаем
    if (resolvedStatus === oldStatus) {
      return current;
    }

    await this.entityRepository.update(id, { status: resolvedStatus });
    const updated = await this.findOne(id);
    this.eventsGateway.emitStatusChanged({ id, status: resolvedStatus, entity: updated });

    // Логирование изменения статуса
    if (actorId && oldStatus !== resolvedStatus) {
      await this.auditLogService.log(
        AuditActionType.ENTITY_STATUS_CHANGED,
        current.workspaceId,
        actorId,
        {
          description: 'Изменён статус',
          oldValues: { status: oldStatus },
          newValues: { status: resolvedStatus },
          changedFields: ['status'],
        },
        id,
      );

      // Email уведомления об изменении статуса — assignee + creator (кроме актора)
      this.notifyStatusChange(updated, actorId, oldStatus, resolvedStatus);

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
              newStatus: resolvedStatus,
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
      if (closedStatuses.includes(resolvedStatus.toLowerCase())) {
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
      // Email уведомления о назначении — новый assignee + creator (кроме актора)
      this.notifyAssigneeChange(updated, assigneeId, actorId);

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

  // ==================== Email Notifications ====================

  /**
   * Собирает уникальных получателей уведомления (assignee + creator), исключая актора.
   */
  private async getNotificationRecipients(
    entity: WorkspaceEntity,
    actorId?: string,
  ): Promise<{ recipients: User[]; actor: User | null }> {
    const recipientIds = new Set<string>();
    if (entity.assigneeId && entity.assigneeId !== actorId) {
      recipientIds.add(entity.assigneeId);
    }
    if (entity.creatorId && entity.creatorId !== actorId) {
      recipientIds.add(entity.creatorId);
    }

    if (recipientIds.size === 0 && !actorId) {
      return { recipients: [], actor: null };
    }

    const idsToLoad = [...recipientIds];
    if (actorId) idsToLoad.push(actorId);

    const users = await Promise.all(
      idsToLoad.map((id) => this.userRepository.findOne({ where: { id } })),
    );

    const userMap = new Map<string, User>();
    for (const u of users) {
      if (u) userMap.set(u.id, u);
    }

    const recipients = [...recipientIds]
      .map((id) => userMap.get(id))
      .filter((u): u is User => !!u);

    const actor = actorId ? userMap.get(actorId) || null : null;

    return { recipients, actor };
  }

  private async notifyStatusChange(
    entity: WorkspaceEntity,
    actorId: string | undefined,
    oldStatus: string,
    newStatus: string,
  ): Promise<void> {
    try {
      const { recipients, actor } = await this.getNotificationRecipients(entity, actorId);
      if (!recipients.length || !actor) return;

      for (const recipient of recipients) {
        this.emailService
          .sendStatusChangeNotification(recipient, entity, actor, oldStatus, newStatus, this.frontendUrl)
          .catch((err) => this.logger.error(`Ошибка email статуса ${entity.customId} → ${recipient.email}: ${err.message}`));
      }
    } catch (err) {
      this.logger.error(`notifyStatusChange error: ${err.message}`);
    }
  }

  private async notifyAssigneeChange(
    entity: WorkspaceEntity,
    newAssigneeId: string | null,
    actorId?: string,
  ): Promise<void> {
    if (!newAssigneeId || !actorId) return;

    try {
      const assignedBy = await this.userRepository.findOne({ where: { id: actorId } });
      if (!assignedBy) return;

      // Уведомляем нового исполнителя (если это не сам актор)
      if (newAssigneeId !== actorId) {
        const assignee = await this.userRepository.findOne({ where: { id: newAssigneeId } });
        if (assignee) {
          this.emailService
            .sendAssignmentNotification(assignee, entity, assignedBy, this.frontendUrl)
            .catch((err) => this.logger.error(`Ошибка email назначения ${entity.customId} → ${assignee.email}: ${err.message}`));
        }
      }

      // Уведомляем создателя (если он отличается от актора и нового исполнителя)
      if (entity.creatorId && entity.creatorId !== actorId && entity.creatorId !== newAssigneeId) {
        const creator = await this.userRepository.findOne({ where: { id: entity.creatorId } });
        if (creator) {
          this.emailService
            .sendAssignmentNotification(creator, entity, assignedBy, this.frontendUrl)
            .catch((err) => this.logger.error(`Ошибка email назначения (creator) ${entity.customId} → ${creator.email}: ${err.message}`));
        }
      }
    } catch (err) {
      this.logger.error(`notifyAssigneeChange error: ${err.message}`);
    }
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

  /**
   * Валидирует статус против конфигурации workspace.
   * Если статус невалиден — возвращает первый статус из конфига workspace.
   * Если конфиг отсутствует — возвращает исходный статус без изменений.
   */
  private async resolveValidStatus(status: string, workspaceId: string): Promise<string> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });
    return this.resolveStatusFromSections(status, workspace?.sections);
  }

  /**
   * Чистая логика валидации статуса по секциям workspace (без DB запроса).
   */
  private resolveStatusFromSections(status: string, sections?: any[]): string {
    if (!sections || !Array.isArray(sections)) {
      return status;
    }

    const validStatuses = new Set<string>();
    let defaultStatus: string | undefined;
    for (const section of sections) {
      if (!section.fields) continue;
      const statusField = section.fields.find((f: any) => f.type === 'status');
      if (statusField?.options?.length) {
        for (const opt of statusField.options) {
          validStatuses.add(opt.id);
        }
        if (!defaultStatus) {
          defaultStatus = statusField.options[0].id;
        }
      }
    }

    if (validStatuses.size === 0 || validStatuses.has(status)) {
      return status;
    }

    return defaultStatus || status;
  }
}
