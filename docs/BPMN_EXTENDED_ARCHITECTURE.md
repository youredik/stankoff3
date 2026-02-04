# Расширенная архитектура BPMN-платформы

**Дата создания:** 2026-02-04
**Статус:** Планирование
**Версия:** 1.0

---

## Содержание

1. [Обзор и цели](#1-обзор-и-цели)
2. [Триггеры запуска процессов](#2-триггеры-запуска-процессов)
3. [Human Tasks (Пользовательские задачи)](#3-human-tasks-пользовательские-задачи)
4. [Формы и UI для задач](#4-формы-и-ui-для-задач)
5. [SLA и дедлайны](#5-sla-и-дедлайны)
6. [Business Rules Engine (DMN)](#6-business-rules-engine-dmn)
7. [Интеграции с внешними системами](#7-интеграции-с-внешними-системами)
8. [Версионирование и миграция](#8-версионирование-и-миграция)
9. [Компенсации и откат](#9-компенсации-и-откат)
10. [Аналитика и отчёты](#10-аналитика-и-отчёты)
11. [Шаблоны процессов](#11-шаблоны-процессов)
12. [Права доступа](#12-права-доступа)
13. [AI/ML интеграция](#13-aiml-интеграция)
14. [Кросс-workspace взаимодействие](#14-кросс-workspace-взаимодействие)
15. [План реализации](#15-план-реализации)

---

## 1. Обзор и цели

### 1.1 Текущее состояние

```
┌─────────────────────────────────────────────────────────────────┐
│                    Реализовано (MVP)                            │
├─────────────────────────────────────────────────────────────────┤
│ ✅ BPMN редактор (bpmn-js)                                      │
│ ✅ Деплой процессов в Zeebe                                     │
│ ✅ Запуск процессов вручную                                     │
│ ✅ Service Tasks (6 workers)                                    │
│ ✅ Тепловая карта                                               │
│ ✅ Базовая статистика                                           │
│ ✅ Хранение definitions и instances в PostgreSQL                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Целевое состояние

```
┌─────────────────────────────────────────────────────────────────┐
│                    Полноценная BPM-платформа                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Триггеры   │    │   Human     │    │    DMN      │         │
│  │  (события,  │    │   Tasks     │    │  (правила)  │         │
│  │   таймеры)  │    │  + формы    │    │             │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            ▼                                    │
│              ┌─────────────────────────┐                        │
│              │      BPMN Engine        │                        │
│              │       (Zeebe)           │                        │
│              └─────────────────────────┘                        │
│                            │                                    │
│         ┌──────────────────┼──────────────────┐                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ Интеграции  │    │    SLA      │    │  Analytics  │         │
│  │ (Telegram,  │    │  Таймеры    │    │  Process    │         │
│  │  Email, 1C) │    │  Эскалация  │    │  Mining     │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Принципы архитектуры

1. **Модульность** — каждый функционал в отдельном модуле
2. **Event-driven** — взаимодействие через события
3. **Backward compatible** — новый функционал не ломает существующий
4. **Configurable** — настройка через UI, не код
5. **Scalable** — готовность к росту нагрузки

---

## 2. Триггеры запуска процессов

### 2.1 Типы триггеров

| Тип | Описание | Приоритет |
|-----|----------|-----------|
| Entity Events | Создание, изменение статуса, назначение | 🔴 Высокий |
| Timer/Cron | По расписанию | 🟡 Средний |
| Webhook | Внешние HTTP вызовы | 🟡 Средний |
| Message | Zeebe messages | 🟢 Низкий |
| Manual | Ручной запуск (уже есть) | ✅ Готово |

### 2.2 Модель данных

```sql
-- Таблица триггеров процессов
CREATE TABLE process_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_definition_id UUID NOT NULL REFERENCES process_definitions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Тип триггера
  trigger_type VARCHAR(50) NOT NULL, -- 'entity_created', 'status_changed', 'cron', 'webhook'

  -- Условия срабатывания (JSONB для гибкости)
  conditions JSONB NOT NULL DEFAULT '{}',
  -- Примеры:
  -- entity_created: { "entityTypes": ["ticket", "request"] }
  -- status_changed: { "fromStatus": "new", "toStatus": "in_progress" }
  -- cron: { "expression": "0 9 * * 1-5", "timezone": "Europe/Moscow" }
  -- webhook: { "secret": "xxx", "allowedIps": ["1.2.3.4"] }

  -- Переменные для передачи в процесс
  variable_mappings JSONB DEFAULT '{}',
  -- { "entityId": "$.entity.id", "priority": "$.entity.priority" }

  -- Состояние
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INT DEFAULT 0,

  -- Метаданные
  name VARCHAR(255),
  description TEXT,
  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_process_triggers_workspace ON process_triggers(workspace_id);
CREATE INDEX idx_process_triggers_type ON process_triggers(trigger_type) WHERE is_active = true;
CREATE INDEX idx_process_triggers_definition ON process_triggers(process_definition_id);

-- Лог срабатываний триггеров
CREATE TABLE trigger_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES process_triggers(id) ON DELETE CASCADE,
  process_instance_id UUID REFERENCES process_instances(id),

  -- Контекст срабатывания
  trigger_context JSONB NOT NULL, -- данные, вызвавшие триггер

  -- Результат
  status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'skipped'
  error_message TEXT,

  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trigger_executions_trigger ON trigger_executions(trigger_id);
CREATE INDEX idx_trigger_executions_date ON trigger_executions(executed_at);
```

### 2.3 Backend: TriggerModule

```
apps/backend/src/modules/bpmn/triggers/
├── triggers.module.ts
├── triggers.service.ts
├── triggers.controller.ts
├── dto/
│   ├── create-trigger.dto.ts
│   └── update-trigger.dto.ts
├── listeners/
│   ├── entity-event.listener.ts      # Слушает события entities
│   ├── cron-trigger.scheduler.ts     # Планировщик cron
│   └── webhook-trigger.controller.ts # HTTP endpoint для webhooks
└── interfaces/
    └── trigger.interface.ts
```

#### triggers.service.ts

```typescript
@Injectable()
export class TriggersService {
  constructor(
    @InjectRepository(ProcessTrigger)
    private triggerRepository: Repository<ProcessTrigger>,
    @InjectRepository(TriggerExecution)
    private executionRepository: Repository<TriggerExecution>,
    private bpmnService: BpmnService,
  ) {}

  // ==================== CRUD ====================

  async create(dto: CreateTriggerDto, userId: string): Promise<ProcessTrigger> {
    const trigger = this.triggerRepository.create({
      ...dto,
      createdById: userId,
    });
    return this.triggerRepository.save(trigger);
  }

  async findByWorkspace(workspaceId: string): Promise<ProcessTrigger[]> {
    return this.triggerRepository.find({
      where: { workspaceId },
      relations: ['processDefinition'],
      order: { createdAt: 'DESC' },
    });
  }

  // ==================== Trigger Evaluation ====================

  async evaluateTriggers(
    triggerType: TriggerType,
    context: Record<string, any>,
    workspaceId: string,
  ): Promise<void> {
    const triggers = await this.triggerRepository.find({
      where: {
        workspaceId,
        triggerType,
        isActive: true,
      },
      relations: ['processDefinition'],
    });

    for (const trigger of triggers) {
      const shouldFire = this.evaluateConditions(trigger.conditions, context);

      if (shouldFire) {
        await this.fireTrigger(trigger, context);
      }
    }
  }

  private evaluateConditions(
    conditions: Record<string, any>,
    context: Record<string, any>,
  ): boolean {
    // Простая проверка условий
    // Можно расширить до JSONPath или выражений

    if (conditions.fromStatus && context.oldStatus !== conditions.fromStatus) {
      return false;
    }
    if (conditions.toStatus && context.newStatus !== conditions.toStatus) {
      return false;
    }
    if (conditions.priority && context.priority !== conditions.priority) {
      return false;
    }

    return true;
  }

  private async fireTrigger(
    trigger: ProcessTrigger,
    context: Record<string, any>,
  ): Promise<void> {
    const execution = this.executionRepository.create({
      triggerId: trigger.id,
      triggerContext: context,
      status: 'pending',
    });

    try {
      // Маппинг переменных
      const variables = this.mapVariables(trigger.variableMappings, context);

      // Запуск процесса
      const instance = await this.bpmnService.startProcess(
        trigger.processDefinitionId,
        variables,
        { entityId: context.entityId },
      );

      execution.processInstanceId = instance.id;
      execution.status = 'success';

      // Обновить счётчик
      await this.triggerRepository.update(trigger.id, {
        lastTriggeredAt: new Date(),
        triggerCount: () => 'trigger_count + 1',
      });

    } catch (error) {
      execution.status = 'failed';
      execution.errorMessage = error.message;
    }

    await this.executionRepository.save(execution);
  }

  private mapVariables(
    mappings: Record<string, string>,
    context: Record<string, any>,
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, path] of Object.entries(mappings)) {
      // Простой JSONPath: $.entity.id -> context.entity.id
      const value = this.resolvePath(path, context);
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  private resolvePath(path: string, obj: Record<string, any>): any {
    if (!path.startsWith('$.')) return path; // literal value

    const parts = path.slice(2).split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }

    return current;
  }
}
```

#### entity-event.listener.ts

```typescript
@Injectable()
export class EntityEventListener {
  constructor(private triggersService: TriggersService) {}

  @OnEvent('entity.created')
  async handleEntityCreated(payload: {
    entity: Entity;
    userId: string;
  }) {
    await this.triggersService.evaluateTriggers(
      'entity_created',
      {
        entityId: payload.entity.id,
        workspaceId: payload.entity.workspaceId,
        title: payload.entity.title,
        status: payload.entity.status,
        priority: payload.entity.priority,
        createdById: payload.userId,
      },
      payload.entity.workspaceId,
    );
  }

  @OnEvent('entity.status_changed')
  async handleStatusChanged(payload: {
    entity: Entity;
    oldStatus: string;
    newStatus: string;
    userId: string;
  }) {
    await this.triggersService.evaluateTriggers(
      'status_changed',
      {
        entityId: payload.entity.id,
        workspaceId: payload.entity.workspaceId,
        oldStatus: payload.oldStatus,
        newStatus: payload.newStatus,
        changedById: payload.userId,
      },
      payload.entity.workspaceId,
    );
  }

  @OnEvent('entity.assignee_changed')
  async handleAssigneeChanged(payload: {
    entity: Entity;
    oldAssigneeId: string | null;
    newAssigneeId: string | null;
    userId: string;
  }) {
    await this.triggersService.evaluateTriggers(
      'assignee_changed',
      {
        entityId: payload.entity.id,
        workspaceId: payload.entity.workspaceId,
        oldAssigneeId: payload.oldAssigneeId,
        newAssigneeId: payload.newAssigneeId,
        assignedById: payload.userId,
      },
      payload.entity.workspaceId,
    );
  }
}
```

#### cron-trigger.scheduler.ts

```typescript
@Injectable()
export class CronTriggerScheduler implements OnModuleInit {
  private scheduledJobs: Map<string, ScheduledTask> = new Map();

  constructor(
    @InjectRepository(ProcessTrigger)
    private triggerRepository: Repository<ProcessTrigger>,
    private triggersService: TriggersService,
  ) {}

  async onModuleInit() {
    await this.loadCronTriggers();
  }

  async loadCronTriggers() {
    const cronTriggers = await this.triggerRepository.find({
      where: { triggerType: 'cron', isActive: true },
    });

    for (const trigger of cronTriggers) {
      this.scheduleTrigger(trigger);
    }
  }

  scheduleTrigger(trigger: ProcessTrigger) {
    const cronExpression = trigger.conditions.expression;
    const timezone = trigger.conditions.timezone || 'Europe/Moscow';

    // Отменить существующий job если есть
    this.unscheduleTrigger(trigger.id);

    const job = cron.schedule(cronExpression, async () => {
      await this.triggersService.evaluateTriggers(
        'cron',
        {
          triggerId: trigger.id,
          scheduledAt: new Date().toISOString(),
        },
        trigger.workspaceId,
      );
    }, { timezone });

    this.scheduledJobs.set(trigger.id, job);
  }

  unscheduleTrigger(triggerId: string) {
    const job = this.scheduledJobs.get(triggerId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(triggerId);
    }
  }
}
```

### 2.4 API Endpoints

```typescript
@Controller('bpmn/triggers')
@UseGuards(JwtAuthGuard)
export class TriggersController {
  constructor(private triggersService: TriggersService) {}

  @Get('workspace/:workspaceId')
  async findByWorkspace(@Param('workspaceId') workspaceId: string) {
    return this.triggersService.findByWorkspace(workspaceId);
  }

  @Post()
  async create(
    @Body() dto: CreateTriggerDto,
    @CurrentUser() user: User,
  ) {
    return this.triggersService.create(dto, user.id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTriggerDto,
  ) {
    return this.triggersService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.triggersService.delete(id);
  }

  @Post(':id/toggle')
  async toggle(@Param('id') id: string) {
    return this.triggersService.toggle(id);
  }

  @Get(':id/executions')
  async getExecutions(
    @Param('id') id: string,
    @Query('limit') limit = 50,
  ) {
    return this.triggersService.getExecutions(id, limit);
  }

  // Webhook endpoint
  @Post('webhook/:triggerId')
  async handleWebhook(
    @Param('triggerId') triggerId: string,
    @Body() body: any,
    @Headers('x-webhook-secret') secret: string,
  ) {
    return this.triggersService.handleWebhook(triggerId, body, secret);
  }
}
```

### 2.5 Frontend: UI компоненты

```
apps/frontend/src/components/bpmn/triggers/
├── TriggersList.tsx           # Список триггеров
├── TriggerForm.tsx            # Форма создания/редактирования
├── TriggerConditionsEditor.tsx # Редактор условий
├── TriggerExecutionLog.tsx    # Лог срабатываний
└── CronExpressionBuilder.tsx  # Визуальный построитель cron
```

---

## 3. Human Tasks (Пользовательские задачи)

### 3.1 Концепция

Human Tasks — задачи, требующие действия человека. В отличие от Service Tasks (автоматических), они:
- Появляются в "Inbox" пользователя
- Имеют формы для ввода данных
- Поддерживают назначение и делегирование
- Имеют сроки и напоминания

### 3.2 Модель данных

```sql
-- Пользовательские задачи
CREATE TABLE user_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Связь с процессом
  process_instance_id UUID NOT NULL REFERENCES process_instances(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  entity_id UUID REFERENCES entities(id),

  -- Zeebe данные
  job_key VARCHAR(255) NOT NULL UNIQUE,  -- Zeebe job key для complete
  element_id VARCHAR(255) NOT NULL,       -- ID элемента в BPMN
  element_name VARCHAR(255),              -- Название из BPMN

  -- Тип и форма
  task_type VARCHAR(100) NOT NULL,  -- 'approval', 'review', 'data-entry', 'custom'
  form_key VARCHAR(255),            -- Ссылка на форму
  form_schema JSONB,                -- JSON Schema формы (если inline)
  form_data JSONB DEFAULT '{}',     -- Заполненные данные

  -- Назначение
  assignee_id UUID REFERENCES users(id),
  assignee_email VARCHAR(255),
  candidate_groups TEXT[],          -- ['managers', 'finance-team']
  candidate_users UUID[],           -- Конкретные пользователи-кандидаты

  -- Сроки
  due_date TIMESTAMPTZ,
  follow_up_date TIMESTAMPTZ,
  priority INT DEFAULT 50,          -- 0-100, выше = важнее

  -- Статус
  status VARCHAR(50) NOT NULL DEFAULT 'created',
  -- 'created' -> 'claimed' -> 'completed'
  -- 'created' -> 'claimed' -> 'delegated' -> 'claimed' -> 'completed'
  -- 'created' -> 'expired'

  claimed_at TIMESTAMPTZ,
  claimed_by_id UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  completed_by_id UUID REFERENCES users(id),

  -- Результат
  completion_result JSONB,  -- Данные формы при завершении

  -- История (для аудита)
  history JSONB DEFAULT '[]',

  -- Переменные процесса (snapshot)
  process_variables JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрого поиска задач
CREATE INDEX idx_user_tasks_assignee ON user_tasks(assignee_id) WHERE status IN ('created', 'claimed');
CREATE INDEX idx_user_tasks_workspace ON user_tasks(workspace_id);
CREATE INDEX idx_user_tasks_status ON user_tasks(status);
CREATE INDEX idx_user_tasks_due_date ON user_tasks(due_date) WHERE status IN ('created', 'claimed');
CREATE INDEX idx_user_tasks_candidate_groups ON user_tasks USING GIN(candidate_groups);
CREATE INDEX idx_user_tasks_candidate_users ON user_tasks USING GIN(candidate_users);
CREATE INDEX idx_user_tasks_job_key ON user_tasks(job_key);

-- Комментарии к задачам
CREATE TABLE user_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES user_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_task_comments_task ON user_task_comments(task_id);
```

### 3.3 Backend: UserTasksModule

```
apps/backend/src/modules/bpmn/user-tasks/
├── user-tasks.module.ts
├── user-tasks.service.ts
├── user-tasks.controller.ts
├── user-tasks.worker.ts         # Zeebe worker для user tasks
├── dto/
│   ├── claim-task.dto.ts
│   ├── complete-task.dto.ts
│   ├── delegate-task.dto.ts
│   └── task-query.dto.ts
└── interfaces/
    └── user-task.interface.ts
```

#### user-tasks.worker.ts

```typescript
@Injectable()
export class UserTasksWorker implements OnModuleInit {
  constructor(
    private bpmnService: BpmnService,
    private userTasksService: UserTasksService,
  ) {}

  onModuleInit() {
    this.registerWorker();
  }

  private registerWorker() {
    const zeebeClient = this.bpmnService.getZeebeClient();
    if (!zeebeClient) return;

    // Worker для создания user tasks
    zeebeClient.createWorker({
      taskType: 'user-task',
      taskHandler: async (job) => {
        const {
          taskType,
          formKey,
          formSchema,
          assignee,
          candidateGroups,
          candidateUsers,
          dueDate,
          priority,
          ...variables
        } = job.variables as any;

        // Создаём задачу в нашей БД
        await this.userTasksService.createFromJob({
          jobKey: String(job.key),
          processInstanceKey: String(job.processInstanceKey),
          elementId: job.elementId,
          elementName: job.customHeaders?.name || job.elementId,
          taskType: taskType || 'custom',
          formKey,
          formSchema,
          assignee,
          candidateGroups: candidateGroups?.split(',') || [],
          candidateUsers: candidateUsers?.split(',') || [],
          dueDate: dueDate ? new Date(dueDate) : null,
          priority: priority || 50,
          processVariables: variables,
        });

        // НЕ завершаем job - он будет завершён когда пользователь выполнит задачу
        // Возвращаем job без complete для "заморозки" процесса
        return job.forward();
      },
      // Длительный timeout для user tasks
      timeout: Duration.days.of(30),
    });
  }
}
```

#### user-tasks.service.ts

```typescript
@Injectable()
export class UserTasksService {
  constructor(
    @InjectRepository(UserTask)
    private taskRepository: Repository<UserTask>,
    private bpmnService: BpmnService,
    private eventsGateway: EventsGateway,
    private emailService: EmailService,
  ) {}

  // ==================== Queries ====================

  /**
   * Получить задачи для пользователя (inbox)
   */
  async findForUser(
    userId: string,
    userGroups: string[],
    filters: TaskQueryDto,
  ): Promise<{ tasks: UserTask[]; total: number }> {
    const qb = this.taskRepository.createQueryBuilder('task')
      .leftJoinAndSelect('task.processInstance', 'instance')
      .leftJoinAndSelect('instance.processDefinition', 'definition')
      .where('task.status IN (:...statuses)', {
        statuses: ['created', 'claimed']
      });

    // Задачи назначенные мне ИЛИ я в кандидатах
    qb.andWhere(
      new Brackets((sub) => {
        sub.where('task.assignee_id = :userId', { userId })
           .orWhere('task.candidate_users @> ARRAY[:userId]::uuid[]', { userId })
           .orWhere('task.candidate_groups && ARRAY[:...groups]::text[]', { groups: userGroups });
      }),
    );

    // Фильтры
    if (filters.workspaceId) {
      qb.andWhere('task.workspace_id = :workspaceId', { workspaceId: filters.workspaceId });
    }
    if (filters.taskType) {
      qb.andWhere('task.task_type = :taskType', { taskType: filters.taskType });
    }
    if (filters.priority) {
      qb.andWhere('task.priority >= :priority', { priority: filters.priority });
    }
    if (filters.dueBefore) {
      qb.andWhere('task.due_date <= :dueBefore', { dueBefore: filters.dueBefore });
    }

    // Сортировка
    switch (filters.sortBy) {
      case 'dueDate':
        qb.orderBy('task.due_date', 'ASC', 'NULLS LAST');
        break;
      case 'priority':
        qb.orderBy('task.priority', 'DESC');
        break;
      case 'created':
      default:
        qb.orderBy('task.created_at', 'DESC');
    }

    const [tasks, total] = await qb
      .skip(filters.offset || 0)
      .take(filters.limit || 20)
      .getManyAndCount();

    return { tasks, total };
  }

  /**
   * Получить количество задач по статусам
   */
  async getTaskCounts(userId: string, userGroups: string[]): Promise<{
    assigned: number;
    candidate: number;
    overdue: number;
  }> {
    const baseQuery = this.taskRepository.createQueryBuilder('task')
      .where('task.status IN (:...statuses)', { statuses: ['created', 'claimed'] });

    const [assigned, candidate, overdue] = await Promise.all([
      // Назначенные мне
      baseQuery.clone()
        .andWhere('task.assignee_id = :userId', { userId })
        .getCount(),

      // Я в кандидатах (но не назначено)
      baseQuery.clone()
        .andWhere('task.assignee_id IS NULL')
        .andWhere(
          new Brackets((sub) => {
            sub.where('task.candidate_users @> ARRAY[:userId]::uuid[]', { userId })
               .orWhere('task.candidate_groups && ARRAY[:...groups]::text[]', { groups: userGroups });
          }),
        )
        .getCount(),

      // Просроченные
      baseQuery.clone()
        .andWhere('task.assignee_id = :userId', { userId })
        .andWhere('task.due_date < NOW()')
        .getCount(),
    ]);

    return { assigned, candidate, overdue };
  }

  // ==================== Actions ====================

  /**
   * Взять задачу в работу
   */
  async claim(taskId: string, userId: string): Promise<UserTask> {
    const task = await this.findOneOrFail(taskId);

    if (task.status !== 'created') {
      throw new BadRequestException('Task is already claimed');
    }

    // Проверить что пользователь может взять задачу
    await this.validateCanClaim(task, userId);

    task.status = 'claimed';
    task.claimedAt = new Date();
    task.claimedById = userId;
    task.assigneeId = userId;

    this.addHistory(task, 'claimed', userId);

    const saved = await this.taskRepository.save(task);

    // Уведомить через WebSocket
    this.eventsGateway.emitToUser(userId, 'task:claimed', { taskId });

    return saved;
  }

  /**
   * Вернуть задачу в очередь
   */
  async unclaim(taskId: string, userId: string): Promise<UserTask> {
    const task = await this.findOneOrFail(taskId);

    if (task.claimedById !== userId) {
      throw new ForbiddenException('You can only unclaim your own tasks');
    }

    task.status = 'created';
    task.claimedAt = null;
    task.claimedById = null;
    task.assigneeId = null;

    this.addHistory(task, 'unclaimed', userId);

    return this.taskRepository.save(task);
  }

  /**
   * Делегировать задачу другому пользователю
   */
  async delegate(
    taskId: string,
    fromUserId: string,
    toUserId: string,
    comment?: string,
  ): Promise<UserTask> {
    const task = await this.findOneOrFail(taskId);

    if (task.assigneeId !== fromUserId) {
      throw new ForbiddenException('You can only delegate your own tasks');
    }

    task.assigneeId = toUserId;
    task.status = 'created'; // Сбрасываем чтобы новый assignee должен claim

    this.addHistory(task, 'delegated', fromUserId, {
      toUserId,
      comment
    });

    const saved = await this.taskRepository.save(task);

    // Уведомить нового assignee
    this.eventsGateway.emitToUser(toUserId, 'task:delegated', {
      taskId,
      fromUserId,
      comment,
    });

    return saved;
  }

  /**
   * Завершить задачу
   */
  async complete(
    taskId: string,
    userId: string,
    formData: Record<string, any>,
  ): Promise<UserTask> {
    const task = await this.findOneOrFail(taskId);

    if (task.assigneeId !== userId) {
      throw new ForbiddenException('You can only complete your own tasks');
    }

    // Валидация формы
    if (task.formSchema) {
      this.validateFormData(task.formSchema, formData);
    }

    // Завершить job в Zeebe
    await this.bpmnService.completeJob(task.jobKey, formData);

    // Обновить задачу
    task.status = 'completed';
    task.completedAt = new Date();
    task.completedById = userId;
    task.completionResult = formData;
    task.formData = formData;

    this.addHistory(task, 'completed', userId, { formData });

    return this.taskRepository.save(task);
  }

  // ==================== Helpers ====================

  private addHistory(
    task: UserTask,
    action: string,
    userId: string,
    data?: Record<string, any>,
  ) {
    const history = task.history || [];
    history.push({
      action,
      userId,
      timestamp: new Date().toISOString(),
      data,
    });
    task.history = history;
  }

  private validateFormData(schema: any, data: Record<string, any>) {
    // TODO: Использовать ajv для валидации JSON Schema
  }

  private async validateCanClaim(task: UserTask, userId: string) {
    // Проверить что пользователь в кандидатах или уже assignee
    // TODO: Проверить группы пользователя
  }
}
```

### 3.4 API Endpoints

```typescript
@Controller('bpmn/tasks')
@UseGuards(JwtAuthGuard)
export class UserTasksController {
  constructor(private userTasksService: UserTasksService) {}

  // Inbox
  @Get('inbox')
  async getInbox(
    @CurrentUser() user: User,
    @Query() query: TaskQueryDto,
  ) {
    const userGroups = await this.getUserGroups(user.id);
    return this.userTasksService.findForUser(user.id, userGroups, query);
  }

  // Счётчики
  @Get('counts')
  async getCounts(@CurrentUser() user: User) {
    const userGroups = await this.getUserGroups(user.id);
    return this.userTasksService.getTaskCounts(user.id, userGroups);
  }

  // Детали задачи
  @Get(':id')
  async getTask(@Param('id') id: string) {
    return this.userTasksService.findOne(id);
  }

  // Взять в работу
  @Post(':id/claim')
  async claim(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.userTasksService.claim(id, user.id);
  }

  // Вернуть в очередь
  @Post(':id/unclaim')
  async unclaim(
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    return this.userTasksService.unclaim(id, user.id);
  }

  // Делегировать
  @Post(':id/delegate')
  async delegate(
    @Param('id') id: string,
    @Body() dto: DelegateTaskDto,
    @CurrentUser() user: User,
  ) {
    return this.userTasksService.delegate(id, user.id, dto.toUserId, dto.comment);
  }

  // Завершить
  @Post(':id/complete')
  async complete(
    @Param('id') id: string,
    @Body() dto: CompleteTaskDto,
    @CurrentUser() user: User,
  ) {
    return this.userTasksService.complete(id, user.id, dto.formData);
  }

  // Комментарии
  @Get(':id/comments')
  async getComments(@Param('id') id: string) {
    return this.userTasksService.getComments(id);
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body('content') content: string,
    @CurrentUser() user: User,
  ) {
    return this.userTasksService.addComment(id, user.id, content);
  }
}
```

### 3.5 Frontend: UI компоненты

```
apps/frontend/src/components/bpmn/tasks/
├── TaskInbox.tsx              # Главный inbox с фильтрами
├── TaskCard.tsx               # Карточка задачи в списке
├── TaskDetail.tsx             # Детальный просмотр задачи
├── TaskForm.tsx               # Динамическая форма задачи
├── TaskActions.tsx            # Кнопки действий (claim, complete, delegate)
├── TaskComments.tsx           # Комментарии к задаче
├── TaskHistory.tsx            # История изменений
├── DelegateModal.tsx          # Модал делегирования
└── hooks/
    ├── useTaskInbox.ts
    └── useTaskActions.ts
```

---

## 4. Формы и UI для задач

### 4.1 JSON Schema для форм

```typescript
interface FormSchema {
  $id: string;
  type: 'object';
  title: string;
  description?: string;
  required?: string[];
  properties: Record<string, FormFieldSchema>;
  ui?: FormUISchema;
}

interface FormFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  title: string;
  description?: string;
  default?: any;

  // String specifics
  format?: 'date' | 'date-time' | 'email' | 'uri' | 'textarea' | 'richtext';
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // Number specifics
  minimum?: number;
  maximum?: number;

  // Enum (select/radio)
  enum?: any[];
  enumNames?: string[];

  // Array specifics
  items?: FormFieldSchema;
  minItems?: number;
  maxItems?: number;

  // Custom extensions
  'x-component'?: string;  // 'user-picker', 'file-upload', 'entity-select'
  'x-options'?: Record<string, any>;
}

interface FormUISchema {
  'ui:order'?: string[];
  [fieldName: string]: {
    'ui:widget'?: string;
    'ui:placeholder'?: string;
    'ui:help'?: string;
    'ui:disabled'?: boolean;
    'ui:hidden'?: boolean;
    'ui:options'?: Record<string, any>;
  };
}
```

### 4.2 Примеры форм

#### Форма согласования

```json
{
  "$id": "approval-form",
  "type": "object",
  "title": "Согласование заявки",
  "required": ["decision"],
  "properties": {
    "decision": {
      "type": "string",
      "title": "Решение",
      "enum": ["approved", "rejected", "needs_clarification"],
      "enumNames": ["Согласовано", "Отклонено", "Требует уточнения"]
    },
    "comment": {
      "type": "string",
      "title": "Комментарий",
      "format": "textarea",
      "maxLength": 1000
    },
    "attachments": {
      "type": "array",
      "title": "Вложения",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "x-component": "file-upload",
      "x-options": {
        "accept": ".pdf,.doc,.docx",
        "maxSize": 10485760
      }
    }
  },
  "ui": {
    "ui:order": ["decision", "comment", "attachments"],
    "comment": {
      "ui:widget": "textarea",
      "ui:options": { "rows": 4 }
    }
  }
}
```

#### Форма ввода данных

```json
{
  "$id": "purchase-request-form",
  "type": "object",
  "title": "Заявка на закупку",
  "required": ["items", "justification", "budget"],
  "properties": {
    "items": {
      "type": "array",
      "title": "Позиции",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["name", "quantity", "estimatedPrice"],
        "properties": {
          "name": { "type": "string", "title": "Наименование" },
          "quantity": { "type": "number", "title": "Количество", "minimum": 1 },
          "unit": { "type": "string", "title": "Ед. изм.", "default": "шт" },
          "estimatedPrice": { "type": "number", "title": "Ориентировочная цена" },
          "supplier": { "type": "string", "title": "Предпочтительный поставщик" }
        }
      }
    },
    "justification": {
      "type": "string",
      "title": "Обоснование закупки",
      "format": "textarea"
    },
    "budget": {
      "type": "string",
      "title": "Статья бюджета",
      "enum": ["opex", "capex", "project"],
      "enumNames": ["OPEX", "CAPEX", "Проектный бюджет"]
    },
    "urgency": {
      "type": "string",
      "title": "Срочность",
      "enum": ["normal", "urgent", "critical"],
      "enumNames": ["Обычная", "Срочная", "Критическая"],
      "default": "normal"
    },
    "desiredDeliveryDate": {
      "type": "string",
      "title": "Желаемая дата поставки",
      "format": "date"
    }
  }
}
```

### 4.3 Хранение форм

```sql
-- Библиотека форм
CREATE TABLE form_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),  -- NULL = глобальная форма

  key VARCHAR(255) NOT NULL,  -- уникальный ключ формы
  name VARCHAR(255) NOT NULL,
  description TEXT,

  schema JSONB NOT NULL,      -- JSON Schema
  ui_schema JSONB,            -- UI настройки

  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,

  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, key)
);

CREATE INDEX idx_form_definitions_workspace ON form_definitions(workspace_id);
CREATE INDEX idx_form_definitions_key ON form_definitions(key);
```

### 4.4 Frontend: DynamicForm компонент

```typescript
// apps/frontend/src/components/bpmn/forms/DynamicForm.tsx

interface DynamicFormProps {
  schema: FormSchema;
  uiSchema?: FormUISchema;
  initialData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => void;
  onCancel?: () => void;
  readOnly?: boolean;
}

export function DynamicForm({
  schema,
  uiSchema,
  initialData,
  onSubmit,
  onCancel,
  readOnly,
}: DynamicFormProps) {
  const [formData, setFormData] = useState(initialData || {});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Валидация
    const validationErrors = validateFormData(schema, formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    onSubmit(formData);
  };

  const renderField = (fieldName: string, fieldSchema: FormFieldSchema) => {
    const fieldUI = uiSchema?.[fieldName] || {};
    const value = formData[fieldName];
    const error = errors[fieldName];
    const isRequired = schema.required?.includes(fieldName);

    // Кастомные компоненты
    if (fieldSchema['x-component']) {
      return renderCustomComponent(
        fieldSchema['x-component'],
        { fieldName, fieldSchema, value, onChange: handleFieldChange, ...fieldSchema['x-options'] }
      );
    }

    // Стандартные типы
    switch (fieldSchema.type) {
      case 'string':
        if (fieldSchema.enum) {
          return (
            <SelectField
              name={fieldName}
              label={fieldSchema.title}
              options={fieldSchema.enum.map((v, i) => ({
                value: v,
                label: fieldSchema.enumNames?.[i] || v,
              }))}
              value={value}
              onChange={(v) => handleFieldChange(fieldName, v)}
              error={error}
              required={isRequired}
              disabled={readOnly}
            />
          );
        }
        if (fieldSchema.format === 'textarea' || fieldSchema.format === 'richtext') {
          return (
            <TextareaField
              name={fieldName}
              label={fieldSchema.title}
              value={value || ''}
              onChange={(v) => handleFieldChange(fieldName, v)}
              error={error}
              required={isRequired}
              disabled={readOnly}
              rows={fieldUI['ui:options']?.rows || 3}
            />
          );
        }
        if (fieldSchema.format === 'date' || fieldSchema.format === 'date-time') {
          return (
            <DateField
              name={fieldName}
              label={fieldSchema.title}
              value={value}
              onChange={(v) => handleFieldChange(fieldName, v)}
              showTime={fieldSchema.format === 'date-time'}
              error={error}
              required={isRequired}
              disabled={readOnly}
            />
          );
        }
        return (
          <TextField
            name={fieldName}
            label={fieldSchema.title}
            value={value || ''}
            onChange={(v) => handleFieldChange(fieldName, v)}
            error={error}
            required={isRequired}
            disabled={readOnly}
            placeholder={fieldUI['ui:placeholder']}
          />
        );

      case 'number':
        return (
          <NumberField
            name={fieldName}
            label={fieldSchema.title}
            value={value}
            onChange={(v) => handleFieldChange(fieldName, v)}
            min={fieldSchema.minimum}
            max={fieldSchema.maximum}
            error={error}
            required={isRequired}
            disabled={readOnly}
          />
        );

      case 'boolean':
        return (
          <CheckboxField
            name={fieldName}
            label={fieldSchema.title}
            checked={!!value}
            onChange={(v) => handleFieldChange(fieldName, v)}
            disabled={readOnly}
          />
        );

      case 'array':
        return (
          <ArrayField
            name={fieldName}
            label={fieldSchema.title}
            itemSchema={fieldSchema.items!}
            value={value || []}
            onChange={(v) => handleFieldChange(fieldName, v)}
            minItems={fieldSchema.minItems}
            maxItems={fieldSchema.maxItems}
            error={error}
            disabled={readOnly}
          />
        );

      default:
        return null;
    }
  };

  const fieldOrder = uiSchema?.['ui:order'] || Object.keys(schema.properties);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fieldOrder.map((fieldName) => {
        const fieldSchema = schema.properties[fieldName];
        if (!fieldSchema) return null;

        const fieldUI = uiSchema?.[fieldName];
        if (fieldUI?.['ui:hidden']) return null;

        return (
          <div key={fieldName}>
            {renderField(fieldName, fieldSchema)}
            {fieldUI?.['ui:help'] && (
              <p className="mt-1 text-sm text-gray-500">{fieldUI['ui:help']}</p>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <div className="flex gap-2 pt-4">
          <button
            type="submit"
            className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700"
          >
            Отправить
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Отмена
            </button>
          )}
        </div>
      )}
    </form>
  );
}
```

---

## 5. SLA и дедлайны

### 5.1 Концепция

SLA (Service Level Agreement) определяет временные рамки для выполнения задач и процессов. Система должна:
- Отслеживать сроки
- Отправлять напоминания
- Эскалировать при нарушении
- Собирать статистику выполнения

### 5.2 Модель данных

```sql
-- Определения SLA
CREATE TABLE sla_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Условия применения
  applies_to VARCHAR(50) NOT NULL,  -- 'entity', 'task', 'process'
  conditions JSONB DEFAULT '{}',     -- {"priority": "high", "category": "support"}

  -- Временные параметры (в минутах)
  response_time INT,        -- Время первого ответа
  resolution_time INT,      -- Время решения
  warning_threshold INT,    -- % от времени для предупреждения (например, 80)

  -- Рабочие часы
  business_hours_only BOOLEAN DEFAULT true,
  business_hours JSONB DEFAULT '{"start": "09:00", "end": "18:00", "timezone": "Europe/Moscow", "workdays": [1,2,3,4,5]}',

  -- Эскалация
  escalation_rules JSONB DEFAULT '[]',
  -- [
  --   {"threshold": 80, "action": "notify", "targets": ["assignee"]},
  --   {"threshold": 100, "action": "escalate", "targets": ["manager"]},
  --   {"threshold": 150, "action": "escalate", "targets": ["director"]}
  -- ]

  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,  -- Приоритет правила (выше = важнее)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sla_definitions_workspace ON sla_definitions(workspace_id);

-- Экземпляры SLA (привязка к конкретным сущностям)
CREATE TABLE sla_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_definition_id UUID NOT NULL REFERENCES sla_definitions(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),

  -- Связь с объектом
  target_type VARCHAR(50) NOT NULL,  -- 'entity', 'task', 'process_instance'
  target_id UUID NOT NULL,

  -- Рассчитанные сроки
  response_due_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,

  -- Фактические времена
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Статус
  response_status VARCHAR(50),   -- 'pending', 'met', 'breached'
  resolution_status VARCHAR(50), -- 'pending', 'met', 'breached'

  -- Пауза SLA (например, ожидание ответа клиента)
  is_paused BOOLEAN DEFAULT false,
  paused_at TIMESTAMPTZ,
  total_paused_minutes INT DEFAULT 0,

  -- Эскалация
  current_escalation_level INT DEFAULT 0,
  last_escalation_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sla_instances_target ON sla_instances(target_type, target_id);
CREATE INDEX idx_sla_instances_due ON sla_instances(resolution_due_at)
  WHERE resolution_status = 'pending';

-- Лог событий SLA
CREATE TABLE sla_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_instance_id UUID NOT NULL REFERENCES sla_instances(id) ON DELETE CASCADE,

  event_type VARCHAR(50) NOT NULL,
  -- 'created', 'response_recorded', 'resolved', 'breached',
  -- 'warning_sent', 'escalated', 'paused', 'resumed'

  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sla_events_instance ON sla_events(sla_instance_id);
```

### 5.3 Backend: SlaModule

```
apps/backend/src/modules/sla/
├── sla.module.ts
├── sla.service.ts
├── sla-calculator.service.ts   # Расчёт сроков с учётом рабочих часов
├── sla-monitor.service.ts      # Мониторинг и эскалация
├── sla.controller.ts
├── entities/
│   ├── sla-definition.entity.ts
│   └── sla-instance.entity.ts
└── dto/
    └── create-sla.dto.ts
```

#### sla-calculator.service.ts

```typescript
@Injectable()
export class SlaCalculatorService {
  /**
   * Рассчитать дедлайн с учётом рабочих часов
   */
  calculateDeadline(
    startTime: Date,
    durationMinutes: number,
    businessHours: BusinessHours,
    businessHoursOnly: boolean,
  ): Date {
    if (!businessHoursOnly) {
      return addMinutes(startTime, durationMinutes);
    }

    let remainingMinutes = durationMinutes;
    let currentTime = new Date(startTime);

    while (remainingMinutes > 0) {
      // Проверить, рабочий ли день
      const dayOfWeek = getDay(currentTime); // 0 = Sunday
      if (!businessHours.workdays.includes(dayOfWeek)) {
        // Перейти к следующему рабочему дню
        currentTime = this.getNextWorkdayStart(currentTime, businessHours);
        continue;
      }

      // Получить рабочие часы текущего дня
      const workStart = this.parseTime(businessHours.start, currentTime, businessHours.timezone);
      const workEnd = this.parseTime(businessHours.end, currentTime, businessHours.timezone);

      // Если текущее время до начала рабочего дня
      if (currentTime < workStart) {
        currentTime = workStart;
      }

      // Если текущее время после конца рабочего дня
      if (currentTime >= workEnd) {
        currentTime = this.getNextWorkdayStart(currentTime, businessHours);
        continue;
      }

      // Сколько минут осталось до конца рабочего дня
      const minutesToEndOfDay = differenceInMinutes(workEnd, currentTime);

      if (remainingMinutes <= minutesToEndOfDay) {
        // Укладываемся в текущий день
        return addMinutes(currentTime, remainingMinutes);
      } else {
        // Не укладываемся - вычитаем и переходим на следующий день
        remainingMinutes -= minutesToEndOfDay;
        currentTime = this.getNextWorkdayStart(workEnd, businessHours);
      }
    }

    return currentTime;
  }

  /**
   * Рассчитать оставшееся время SLA в минутах
   */
  calculateRemainingMinutes(
    deadline: Date,
    currentTime: Date,
    businessHours: BusinessHours,
    businessHoursOnly: boolean,
    pausedMinutes: number = 0,
  ): number {
    if (!businessHoursOnly) {
      return differenceInMinutes(deadline, currentTime) + pausedMinutes;
    }

    // Рассчитать рабочие минуты между currentTime и deadline
    let totalMinutes = 0;
    let iterTime = new Date(currentTime);

    while (iterTime < deadline) {
      const dayOfWeek = getDay(iterTime);
      if (!businessHours.workdays.includes(dayOfWeek)) {
        iterTime = this.getNextWorkdayStart(iterTime, businessHours);
        continue;
      }

      const workStart = this.parseTime(businessHours.start, iterTime, businessHours.timezone);
      const workEnd = this.parseTime(businessHours.end, iterTime, businessHours.timezone);

      const effectiveStart = iterTime < workStart ? workStart : iterTime;
      const effectiveEnd = deadline < workEnd ? deadline : workEnd;

      if (effectiveStart < effectiveEnd) {
        totalMinutes += differenceInMinutes(effectiveEnd, effectiveStart);
      }

      iterTime = this.getNextWorkdayStart(workEnd, businessHours);
    }

    return totalMinutes + pausedMinutes;
  }

  private getNextWorkdayStart(from: Date, bh: BusinessHours): Date {
    let next = addDays(startOfDay(from), 1);
    while (!bh.workdays.includes(getDay(next))) {
      next = addDays(next, 1);
    }
    return this.parseTime(bh.start, next, bh.timezone);
  }

  private parseTime(timeStr: string, date: Date, timezone: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return zonedTimeToUtc(
      set(date, { hours, minutes, seconds: 0, milliseconds: 0 }),
      timezone,
    );
  }
}
```

#### sla-monitor.service.ts

```typescript
@Injectable()
export class SlaMonitorService implements OnModuleInit {
  private readonly logger = new Logger(SlaMonitorService.name);

  constructor(
    @InjectRepository(SlaInstance)
    private slaInstanceRepository: Repository<SlaInstance>,
    private slaCalculator: SlaCalculatorService,
    private eventsGateway: EventsGateway,
    private emailService: EmailService,
  ) {}

  onModuleInit() {
    // Запускать проверку каждую минуту
    this.startMonitoring();
  }

  private startMonitoring() {
    setInterval(() => this.checkSlaViolations(), 60000);
  }

  async checkSlaViolations() {
    const now = new Date();

    // Найти SLA, которые скоро истекут или уже истекли
    const pendingInstances = await this.slaInstanceRepository.find({
      where: [
        { responseStatus: 'pending' },
        { resolutionStatus: 'pending' },
      ],
      relations: ['slaDefinition'],
    });

    for (const instance of pendingInstances) {
      await this.checkInstance(instance, now);
    }
  }

  private async checkInstance(instance: SlaInstance, now: Date) {
    const definition = instance.slaDefinition;
    const warningThreshold = definition.warningThreshold || 80;

    // Проверка Response SLA
    if (instance.responseStatus === 'pending' && instance.responseDueAt) {
      const remainingMinutes = this.slaCalculator.calculateRemainingMinutes(
        instance.responseDueAt,
        now,
        definition.businessHours,
        definition.businessHoursOnly,
        instance.totalPausedMinutes,
      );

      const totalMinutes = definition.responseTime;
      const usedPercent = ((totalMinutes - remainingMinutes) / totalMinutes) * 100;

      if (remainingMinutes <= 0) {
        await this.handleBreach(instance, 'response');
      } else if (usedPercent >= warningThreshold) {
        await this.handleWarning(instance, 'response', usedPercent);
      }
    }

    // Проверка Resolution SLA
    if (instance.resolutionStatus === 'pending' && instance.resolutionDueAt) {
      const remainingMinutes = this.slaCalculator.calculateRemainingMinutes(
        instance.resolutionDueAt,
        now,
        definition.businessHours,
        definition.businessHoursOnly,
        instance.totalPausedMinutes,
      );

      const totalMinutes = definition.resolutionTime;
      const usedPercent = ((totalMinutes - remainingMinutes) / totalMinutes) * 100;

      if (remainingMinutes <= 0) {
        await this.handleBreach(instance, 'resolution');
      } else if (usedPercent >= warningThreshold) {
        await this.handleWarning(instance, 'resolution', usedPercent);
      }
    }
  }

  private async handleWarning(
    instance: SlaInstance,
    type: 'response' | 'resolution',
    usedPercent: number,
  ) {
    const rules = instance.slaDefinition.escalationRules || [];
    const applicableRule = rules.find(r =>
      r.threshold <= usedPercent &&
      r.threshold > (instance.currentEscalationLevel || 0)
    );

    if (!applicableRule) return;

    // Обновить уровень эскалации
    await this.slaInstanceRepository.update(instance.id, {
      currentEscalationLevel: applicableRule.threshold,
      lastEscalationAt: new Date(),
    });

    // Выполнить действие
    if (applicableRule.action === 'notify') {
      await this.sendNotifications(instance, applicableRule.targets, 'warning', usedPercent);
    } else if (applicableRule.action === 'escalate') {
      await this.sendNotifications(instance, applicableRule.targets, 'escalation', usedPercent);
    }

    // Записать событие
    await this.logEvent(instance.id, 'warning_sent', {
      type,
      usedPercent,
      rule: applicableRule,
    });
  }

  private async handleBreach(
    instance: SlaInstance,
    type: 'response' | 'resolution',
  ) {
    const updateData = type === 'response'
      ? { responseStatus: 'breached' }
      : { resolutionStatus: 'breached' };

    await this.slaInstanceRepository.update(instance.id, updateData);

    // Уведомить о нарушении
    const rules = instance.slaDefinition.escalationRules || [];
    const breachRule = rules.find(r => r.threshold >= 100);

    if (breachRule) {
      await this.sendNotifications(instance, breachRule.targets, 'breach', 100);
    }

    await this.logEvent(instance.id, 'breached', { type });
  }

  private async sendNotifications(
    instance: SlaInstance,
    targets: string[],
    notificationType: 'warning' | 'escalation' | 'breach',
    percent: number,
  ) {
    // Получить email адреса получателей
    const recipients = await this.resolveTargets(instance, targets);

    for (const recipient of recipients) {
      // WebSocket уведомление
      this.eventsGateway.emitToUser(recipient.userId, 'sla:alert', {
        instanceId: instance.id,
        type: notificationType,
        percent,
      });

      // Email
      await this.emailService.send({
        to: recipient.email,
        subject: this.getEmailSubject(instance, notificationType),
        html: this.getEmailBody(instance, notificationType, percent),
      });
    }
  }
}
```

### 5.4 API Endpoints

```typescript
@Controller('sla')
@UseGuards(JwtAuthGuard)
export class SlaController {
  // Определения SLA
  @Get('definitions')
  async getDefinitions(@Query('workspaceId') workspaceId: string) {}

  @Post('definitions')
  async createDefinition(@Body() dto: CreateSlaDefinitionDto) {}

  @Put('definitions/:id')
  async updateDefinition(@Param('id') id: string, @Body() dto: UpdateSlaDefinitionDto) {}

  @Delete('definitions/:id')
  async deleteDefinition(@Param('id') id: string) {}

  // Статус SLA для сущности
  @Get('status/:targetType/:targetId')
  async getSlaStatus(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
  ) {}

  // Поставить SLA на паузу
  @Post('instances/:id/pause')
  async pauseSla(@Param('id') id: string, @Body('reason') reason: string) {}

  // Снять с паузы
  @Post('instances/:id/resume')
  async resumeSla(@Param('id') id: string) {}

  // Dashboard
  @Get('dashboard')
  async getDashboard(@Query('workspaceId') workspaceId: string) {}

  // Отчёт по выполнению SLA
  @Get('report')
  async getReport(
    @Query('workspaceId') workspaceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {}
}
```

### 5.5 Frontend: UI компоненты

```
apps/frontend/src/components/sla/
├── SlaIndicator.tsx        # Индикатор SLA на карточке заявки
├── SlaTimer.tsx            # Обратный отсчёт до дедлайна
├── SlaDashboard.tsx        # Dashboard с метриками
├── SlaDefinitionForm.tsx   # Форма настройки SLA
├── SlaReport.tsx           # Отчёт по выполнению
└── hooks/
    └── useSlaStatus.ts
```

#### SlaIndicator.tsx

```tsx
interface SlaIndicatorProps {
  targetType: 'entity' | 'task';
  targetId: string;
}

export function SlaIndicator({ targetType, targetId }: SlaIndicatorProps) {
  const { data: sla, isLoading } = useSlaStatus(targetType, targetId);

  if (isLoading || !sla) return null;

  const getStatusColor = (status: string, remainingPercent: number) => {
    if (status === 'breached') return 'bg-red-500';
    if (status === 'met') return 'bg-green-500';
    if (remainingPercent < 20) return 'bg-red-400';
    if (remainingPercent < 50) return 'bg-yellow-400';
    return 'bg-green-400';
  };

  const remainingPercent = (sla.remainingMinutes / sla.totalMinutes) * 100;

  return (
    <div className="flex items-center gap-2">
      {/* Progress bar */}
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getStatusColor(sla.status, remainingPercent)}`}
          style={{ width: `${Math.max(0, remainingPercent)}%` }}
        />
      </div>

      {/* Time remaining */}
      <span className={`text-xs ${remainingPercent < 20 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
        {sla.status === 'breached' ? (
          <span className="text-red-600">Просрочено</span>
        ) : sla.status === 'met' ? (
          <span className="text-green-600">Выполнено</span>
        ) : sla.isPaused ? (
          <span className="text-blue-600">На паузе</span>
        ) : (
          formatDuration(sla.remainingMinutes)
        )}
      </span>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}м`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`;
  return `${Math.floor(minutes / 1440)}д ${Math.floor((minutes % 1440) / 60)}ч`;
}
```

---

## 6. Business Rules Engine (DMN)

### 6.1 Концепция

DMN (Decision Model and Notation) — стандарт для описания бизнес-правил в виде таблиц решений. Позволяет:
- Вынести бизнес-логику из кода
- Редактировать правила без разработчиков
- Тестировать правила изолированно
- Версионировать правила

### 6.2 Модель данных

```sql
-- Таблицы решений
CREATE TABLE decision_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  key VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- DMN XML
  dmn_xml TEXT NOT NULL,

  -- Для быстрого доступа: структурированное представление
  inputs JSONB NOT NULL,   -- [{"id": "priority", "label": "Приоритет", "type": "string"}]
  outputs JSONB NOT NULL,  -- [{"id": "route", "label": "Маршрут", "type": "string"}]
  rules JSONB NOT NULL,    -- Правила в JSON формате

  -- Hit policy: UNIQUE, FIRST, PRIORITY, ANY, COLLECT, RULE ORDER
  hit_policy VARCHAR(50) DEFAULT 'FIRST',

  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,

  deployed_key VARCHAR(255),  -- Ключ в Camunda если задеплоено
  deployed_at TIMESTAMPTZ,

  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, key)
);

CREATE INDEX idx_decision_tables_workspace ON decision_tables(workspace_id);
CREATE INDEX idx_decision_tables_key ON decision_tables(key);

-- Лог выполнения правил (для аудита и аналитики)
CREATE TABLE decision_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_table_id UUID NOT NULL REFERENCES decision_tables(id),

  -- Контекст
  process_instance_id UUID REFERENCES process_instances(id),
  entity_id UUID REFERENCES entities(id),

  -- Входные данные
  input_values JSONB NOT NULL,

  -- Результат
  output_values JSONB NOT NULL,
  matched_rules INT[],  -- Индексы сработавших правил

  evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_decision_evaluations_table ON decision_evaluations(decision_table_id);
CREATE INDEX idx_decision_evaluations_date ON decision_evaluations(evaluated_at);
```

### 6.3 Backend: DmnModule

```
apps/backend/src/modules/dmn/
├── dmn.module.ts
├── dmn.service.ts
├── dmn-evaluator.service.ts    # Локальный evaluator (без Camunda)
├── dmn.controller.ts
├── entities/
│   └── decision-table.entity.ts
└── dto/
    ├── create-decision.dto.ts
    └── evaluate-decision.dto.ts
```

#### dmn-evaluator.service.ts

```typescript
@Injectable()
export class DmnEvaluatorService {
  /**
   * Оценить таблицу решений локально (без Camunda)
   */
  evaluate(
    table: DecisionTable,
    inputs: Record<string, any>,
  ): { outputs: Record<string, any>[]; matchedRules: number[] } {
    const matchedRules: number[] = [];
    const outputs: Record<string, any>[] = [];

    for (let i = 0; i < table.rules.length; i++) {
      const rule = table.rules[i];

      if (this.matchesRule(rule.inputs, inputs, table.inputs)) {
        matchedRules.push(i);
        outputs.push(this.extractOutputs(rule.outputs, table.outputs));

        // Применить hit policy
        if (table.hitPolicy === 'FIRST' || table.hitPolicy === 'UNIQUE') {
          break;
        }
      }
    }

    // Для COLLECT - объединить результаты
    if (table.hitPolicy === 'COLLECT' && outputs.length > 1) {
      return {
        outputs: [this.collectOutputs(outputs, table.outputs)],
        matchedRules,
      };
    }

    return { outputs, matchedRules };
  }

  private matchesRule(
    ruleInputs: Record<string, any>,
    actualInputs: Record<string, any>,
    inputDefinitions: InputDefinition[],
  ): boolean {
    for (const inputDef of inputDefinitions) {
      const ruleValue = ruleInputs[inputDef.id];
      const actualValue = actualInputs[inputDef.id];

      // Пустое условие = любое значение
      if (ruleValue === null || ruleValue === undefined || ruleValue === '') {
        continue;
      }

      if (!this.matchesCondition(ruleValue, actualValue, inputDef.type)) {
        return false;
      }
    }
    return true;
  }

  private matchesCondition(
    condition: any,
    value: any,
    type: string,
  ): boolean {
    // Строковое условие - может быть выражением
    if (typeof condition === 'string') {
      // Точное совпадение
      if (!condition.startsWith('[') && !condition.startsWith('<') && !condition.startsWith('>')) {
        return String(value) === condition;
      }

      // Диапазон [1..10]
      const rangeMatch = condition.match(/^\[(\d+)\.\.(\d+)\]$/);
      if (rangeMatch) {
        const [, min, max] = rangeMatch;
        return Number(value) >= Number(min) && Number(value) <= Number(max);
      }

      // Сравнение < > <= >=
      const compareMatch = condition.match(/^([<>]=?)\s*(.+)$/);
      if (compareMatch) {
        const [, op, compareValue] = compareMatch;
        const numValue = Number(value);
        const numCompare = Number(compareValue);
        switch (op) {
          case '<': return numValue < numCompare;
          case '>': return numValue > numCompare;
          case '<=': return numValue <= numCompare;
          case '>=': return numValue >= numCompare;
        }
      }

      // Список значений через запятую
      if (condition.includes(',')) {
        const allowedValues = condition.split(',').map(v => v.trim());
        return allowedValues.includes(String(value));
      }
    }

    return condition === value;
  }

  private extractOutputs(
    ruleOutputs: Record<string, any>,
    outputDefinitions: OutputDefinition[],
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const outputDef of outputDefinitions) {
      result[outputDef.id] = ruleOutputs[outputDef.id];
    }
    return result;
  }

  private collectOutputs(
    outputs: Record<string, any>[],
    outputDefinitions: OutputDefinition[],
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const outputDef of outputDefinitions) {
      result[outputDef.id] = outputs.map(o => o[outputDef.id]);
    }
    return result;
  }
}
```

### 6.4 Пример таблицы решений

```json
{
  "key": "ticket-routing",
  "name": "Маршрутизация заявок",
  "hitPolicy": "FIRST",
  "inputs": [
    { "id": "priority", "label": "Приоритет", "type": "string" },
    { "id": "category", "label": "Категория", "type": "string" },
    { "id": "amount", "label": "Сумма", "type": "number" }
  ],
  "outputs": [
    { "id": "assigneeGroup", "label": "Группа исполнителей", "type": "string" },
    { "id": "slaMinutes", "label": "SLA (минуты)", "type": "number" },
    { "id": "requiresApproval", "label": "Требует согласования", "type": "boolean" }
  ],
  "rules": [
    {
      "inputs": { "priority": "critical", "category": "", "amount": "" },
      "outputs": { "assigneeGroup": "tier3", "slaMinutes": 60, "requiresApproval": false }
    },
    {
      "inputs": { "priority": "high", "category": "", "amount": ">100000" },
      "outputs": { "assigneeGroup": "tier2", "slaMinutes": 240, "requiresApproval": true }
    },
    {
      "inputs": { "priority": "high", "category": "", "amount": "" },
      "outputs": { "assigneeGroup": "tier2", "slaMinutes": 240, "requiresApproval": false }
    },
    {
      "inputs": { "priority": "medium,low", "category": "hardware", "amount": "" },
      "outputs": { "assigneeGroup": "hardware-team", "slaMinutes": 480, "requiresApproval": false }
    },
    {
      "inputs": { "priority": "", "category": "", "amount": "" },
      "outputs": { "assigneeGroup": "tier1", "slaMinutes": 1440, "requiresApproval": false }
    }
  ]
}
```

### 6.5 Frontend: DMN Editor

```
apps/frontend/src/components/dmn/
├── DmnEditor.tsx           # Редактор таблицы решений
├── DecisionTableGrid.tsx   # Табличный редактор правил
├── DmnTester.tsx           # Тестирование правил
├── DmnDeployButton.tsx     # Кнопка деплоя
└── hooks/
    └── useDmnEvaluate.ts
```

---

## 7. Интеграции с внешними системами

### 7.1 Архитектура коннекторов

```
┌─────────────────────────────────────────────────────────────────┐
│                    Connector Framework                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Email     │  │  Telegram   │  │    REST     │              │
│  │  Connector  │  │  Connector  │  │  Connector  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          ▼                                       │
│              ┌─────────────────────┐                             │
│              │  Connector Registry │                             │
│              │  (discovers & loads │                             │
│              │   connectors)       │                             │
│              └──────────┬──────────┘                             │
│                         │                                        │
│                         ▼                                        │
│              ┌─────────────────────┐                             │
│              │   Zeebe Workers     │                             │
│              │   (one per type)    │                             │
│              └─────────────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Модель данных

```sql
-- Конфигурации коннекторов (credentials, endpoints)
CREATE TABLE connector_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  connector_type VARCHAR(100) NOT NULL,  -- 'email', 'telegram', 'rest', '1c'
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Настройки (зашифрованы)
  config JSONB NOT NULL,
  -- email: { host, port, user, password, from }
  -- telegram: { botToken, defaultChatId }
  -- rest: { baseUrl, headers, auth }
  -- 1c: { baseUrl, user, password }

  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Для проверки подключения
  last_health_check TIMESTAMPTZ,
  health_status VARCHAR(50),

  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_connector_configs_workspace ON connector_configs(workspace_id);
CREATE INDEX idx_connector_configs_type ON connector_configs(connector_type);

-- Лог вызовов коннекторов
CREATE TABLE connector_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_config_id UUID NOT NULL REFERENCES connector_configs(id),
  process_instance_id UUID REFERENCES process_instances(id),

  action VARCHAR(100) NOT NULL,   -- 'send-email', 'send-message', 'http-request'
  request_data JSONB,
  response_data JSONB,

  status VARCHAR(50) NOT NULL,    -- 'success', 'failed', 'timeout'
  error_message TEXT,
  duration_ms INT,

  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_connector_executions_config ON connector_executions(connector_config_id);
CREATE INDEX idx_connector_executions_date ON connector_executions(executed_at);
```

### 7.3 Backend: ConnectorsModule

```
apps/backend/src/modules/connectors/
├── connectors.module.ts
├── connectors.service.ts           # Управление конфигами
├── connector-registry.service.ts   # Реестр и загрузка коннекторов
├── connectors.controller.ts
├── types/
│   ├── email/
│   │   ├── email.connector.ts
│   │   ├── email.schema.ts         # JSON Schema конфигурации
│   │   └── email.worker.ts
│   ├── telegram/
│   │   ├── telegram.connector.ts
│   │   ├── telegram.schema.ts
│   │   └── telegram.worker.ts
│   ├── rest/
│   │   ├── rest.connector.ts
│   │   ├── rest.schema.ts
│   │   └── rest.worker.ts
│   └── 1c/
│       ├── 1c.connector.ts
│       ├── 1c.schema.ts
│       └── 1c.worker.ts
└── dto/
    └── create-connector.dto.ts
```

#### Базовый интерфейс коннектора

```typescript
// connector.interface.ts
export interface Connector {
  type: string;
  name: string;
  description: string;

  // JSON Schema для формы конфигурации
  configSchema: object;

  // Доступные действия
  actions: ConnectorAction[];

  // Проверка подключения
  testConnection(config: Record<string, any>): Promise<{ success: boolean; message?: string }>;

  // Выполнение действия
  execute(
    action: string,
    config: Record<string, any>,
    params: Record<string, any>,
  ): Promise<ConnectorResult>;
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  inputSchema: object;   // JSON Schema входных параметров
  outputSchema: object;  // JSON Schema результата
}

export interface ConnectorResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}
```

#### Telegram Connector

```typescript
// telegram.connector.ts
@Injectable()
export class TelegramConnector implements Connector {
  type = 'telegram';
  name = 'Telegram';
  description = 'Отправка сообщений через Telegram Bot API';

  configSchema = {
    type: 'object',
    required: ['botToken'],
    properties: {
      botToken: {
        type: 'string',
        title: 'Bot Token',
        description: 'Токен от @BotFather',
      },
      defaultChatId: {
        type: 'string',
        title: 'Chat ID по умолчанию',
      },
    },
  };

  actions: ConnectorAction[] = [
    {
      id: 'send-message',
      name: 'Отправить сообщение',
      description: 'Отправить текстовое сообщение в чат',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          chatId: { type: 'string', title: 'Chat ID' },
          text: { type: 'string', title: 'Текст сообщения' },
          parseMode: {
            type: 'string',
            enum: ['HTML', 'Markdown', 'MarkdownV2'],
            title: 'Формат',
          },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'number' },
          chatId: { type: 'number' },
        },
      },
    },
    {
      id: 'send-document',
      name: 'Отправить файл',
      description: 'Отправить документ в чат',
      inputSchema: {
        type: 'object',
        required: ['fileUrl'],
        properties: {
          chatId: { type: 'string' },
          fileUrl: { type: 'string', format: 'uri' },
          caption: { type: 'string' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          messageId: { type: 'number' },
        },
      },
    },
  ];

  async testConnection(config: Record<string, any>): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.botToken}/getMe`);
      const data = await response.json();

      if (data.ok) {
        return { success: true, message: `Подключено как @${data.result.username}` };
      } else {
        return { success: false, message: data.description };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async execute(
    action: string,
    config: Record<string, any>,
    params: Record<string, any>,
  ): Promise<ConnectorResult> {
    const chatId = params.chatId || config.defaultChatId;

    switch (action) {
      case 'send-message':
        return this.sendMessage(config.botToken, chatId, params.text, params.parseMode);

      case 'send-document':
        return this.sendDocument(config.botToken, chatId, params.fileUrl, params.caption);

      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private async sendMessage(
    botToken: string,
    chatId: string,
    text: string,
    parseMode?: string,
  ): Promise<ConnectorResult> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        return {
          success: true,
          data: {
            messageId: data.result.message_id,
            chatId: data.result.chat.id,
          },
        };
      } else {
        return { success: false, error: data.description };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  private async sendDocument(
    botToken: string,
    chatId: string,
    fileUrl: string,
    caption?: string,
  ): Promise<ConnectorResult> {
    // Implementation
  }
}
```

### 7.4 Zeebe Workers для коннекторов

```typescript
// connector-workers.service.ts
@Injectable()
export class ConnectorWorkersService implements OnModuleInit {
  constructor(
    private bpmnService: BpmnService,
    private connectorRegistry: ConnectorRegistryService,
    private connectorsService: ConnectorsService,
  ) {}

  onModuleInit() {
    this.registerWorkers();
  }

  private registerWorkers() {
    const zeebeClient = this.bpmnService.getZeebeClient();
    if (!zeebeClient) return;

    // Регистрируем worker для каждого типа коннектора
    const connectorTypes = this.connectorRegistry.getTypes();

    for (const type of connectorTypes) {
      const connector = this.connectorRegistry.get(type);

      for (const action of connector.actions) {
        const taskType = `${type}:${action.id}`;

        zeebeClient.createWorker({
          taskType,
          taskHandler: async (job) => {
            const { connectorConfigId, ...params } = job.variables as any;

            try {
              // Получить конфигурацию
              const config = await this.connectorsService.getConfig(connectorConfigId);

              if (!config || !config.isActive) {
                return job.fail({
                  errorMessage: 'Connector config not found or inactive',
                  retries: 0,
                });
              }

              // Выполнить действие
              const result = await connector.execute(action.id, config.config, params);

              if (result.success) {
                // Логируем успешное выполнение
                await this.connectorsService.logExecution(config.id, job.processInstanceKey, {
                  action: action.id,
                  request: params,
                  response: result.data,
                  status: 'success',
                });

                return job.complete(result.data || {});
              } else {
                await this.connectorsService.logExecution(config.id, job.processInstanceKey, {
                  action: action.id,
                  request: params,
                  error: result.error,
                  status: 'failed',
                });

                return job.fail({
                  errorMessage: result.error,
                  retries: job.retries - 1,
                });
              }
            } catch (error) {
              return job.fail({
                errorMessage: error.message,
                retries: job.retries - 1,
              });
            }
          },
        });
      }
    }
  }
}
```

### 7.5 API Endpoints

```typescript
@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class ConnectorsController {
  // Доступные типы коннекторов
  @Get('types')
  async getTypes() {
    return this.connectorRegistry.getTypesWithSchemas();
  }

  // Конфигурации workspace
  @Get('configs')
  async getConfigs(@Query('workspaceId') workspaceId: string) {}

  @Post('configs')
  async createConfig(@Body() dto: CreateConnectorConfigDto) {}

  @Put('configs/:id')
  async updateConfig(@Param('id') id: string, @Body() dto: UpdateConnectorConfigDto) {}

  @Delete('configs/:id')
  async deleteConfig(@Param('id') id: string) {}

  // Тест подключения
  @Post('configs/:id/test')
  async testConnection(@Param('id') id: string) {}

  // Лог выполнений
  @Get('configs/:id/executions')
  async getExecutions(
    @Param('id') id: string,
    @Query('limit') limit = 50,
  ) {}
}
```

---

## 8. Версионирование и миграция процессов

### 8.1 Концепция

При обновлении BPMN-процесса нужно решить, что делать с активными экземплярами:
- **Оставить на старой версии** — завершатся по старой логике
- **Мигрировать** — перенести на новую версию
- **Отменить** — прервать выполнение

### 8.2 Модель данных

```sql
-- История версий процессов
CREATE TABLE process_definition_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_definition_id UUID NOT NULL REFERENCES process_definitions(id) ON DELETE CASCADE,

  version INT NOT NULL,
  bpmn_xml TEXT NOT NULL,
  deployed_key VARCHAR(255),

  -- Diff от предыдущей версии
  changes_summary JSONB,
  -- { "added": ["task1"], "removed": ["task2"], "modified": ["gateway1"] }

  deployed_at TIMESTAMPTZ,
  deployed_by_id UUID REFERENCES users(id),

  UNIQUE(process_definition_id, version)
);

CREATE INDEX idx_process_versions_definition ON process_definition_versions(process_definition_id);

-- Планы миграции
CREATE TABLE migration_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_definition_key VARCHAR(255) NOT NULL,
  source_version INT NOT NULL,
  target_definition_key VARCHAR(255) NOT NULL,
  target_version INT NOT NULL,

  -- Маппинг элементов
  element_mappings JSONB NOT NULL,
  -- [{ "source": "oldTaskId", "target": "newTaskId" }]

  -- Обновление переменных
  variable_updates JSONB,
  -- { "set": { "newVar": "value" }, "rename": { "oldVar": "newVar" }, "delete": ["obsoleteVar"] }

  -- Статус
  status VARCHAR(50) DEFAULT 'draft',  -- 'draft', 'ready', 'in_progress', 'completed', 'failed'

  -- Статистика выполнения
  total_instances INT DEFAULT 0,
  migrated_instances INT DEFAULT 0,
  failed_instances INT DEFAULT 0,

  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Лог миграции отдельных экземпляров
CREATE TABLE migration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_plan_id UUID NOT NULL REFERENCES migration_plans(id) ON DELETE CASCADE,
  process_instance_key VARCHAR(255) NOT NULL,

  status VARCHAR(50) NOT NULL,  -- 'success', 'failed', 'skipped'
  error_message TEXT,
  migrated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_migration_logs_plan ON migration_logs(migration_plan_id);
```

### 8.3 Backend: MigrationService

```typescript
@Injectable()
export class ProcessMigrationService {
  constructor(
    private bpmnService: BpmnService,
    @InjectRepository(MigrationPlan)
    private migrationPlanRepository: Repository<MigrationPlan>,
  ) {}

  /**
   * Создать план миграции с автоматическим определением маппинга
   */
  async createMigrationPlan(
    sourceDefinitionKey: string,
    sourceVersion: number,
    targetDefinitionKey: string,
    targetVersion: number,
  ): Promise<MigrationPlan> {
    // Получить XML обеих версий
    const [sourceXml, targetXml] = await Promise.all([
      this.getVersionXml(sourceDefinitionKey, sourceVersion),
      this.getVersionXml(targetDefinitionKey, targetVersion),
    ]);

    // Автоматически определить маппинг элементов
    const elementMappings = this.detectElementMappings(sourceXml, targetXml);

    // Найти элементы без маппинга (требуют ручного вмешательства)
    const unmappedElements = this.findUnmappedElements(sourceXml, elementMappings);

    const plan = this.migrationPlanRepository.create({
      sourceDefinitionKey,
      sourceVersion,
      targetDefinitionKey,
      targetVersion,
      elementMappings,
      status: unmappedElements.length > 0 ? 'draft' : 'ready',
    });

    return this.migrationPlanRepository.save(plan);
  }

  /**
   * Выполнить миграцию
   */
  async executeMigration(planId: string): Promise<void> {
    const plan = await this.migrationPlanRepository.findOneOrFail({
      where: { id: planId },
    });

    if (plan.status !== 'ready') {
      throw new BadRequestException('Migration plan is not ready');
    }

    await this.migrationPlanRepository.update(planId, {
      status: 'in_progress',
      executedAt: new Date(),
    });

    try {
      // Получить все активные экземпляры исходной версии
      const instances = await this.bpmnService.findActiveInstances(
        plan.sourceDefinitionKey,
        plan.sourceVersion,
      );

      plan.totalInstances = instances.length;

      for (const instance of instances) {
        try {
          await this.migrateInstance(instance, plan);
          plan.migratedInstances++;
        } catch (error) {
          plan.failedInstances++;
          await this.logMigrationError(plan.id, instance.key, error.message);
        }
      }

      await this.migrationPlanRepository.update(planId, {
        status: plan.failedInstances > 0 ? 'completed_with_errors' : 'completed',
        completedAt: new Date(),
        totalInstances: plan.totalInstances,
        migratedInstances: plan.migratedInstances,
        failedInstances: plan.failedInstances,
      });
    } catch (error) {
      await this.migrationPlanRepository.update(planId, {
        status: 'failed',
      });
      throw error;
    }
  }

  private async migrateInstance(
    instance: ProcessInstance,
    plan: MigrationPlan,
  ): Promise<void> {
    const zeebeClient = this.bpmnService.getZeebeClient();

    // Camunda 8 поддерживает миграцию через API
    await zeebeClient.migrateProcessInstance({
      processInstanceKey: instance.processInstanceKey,
      migrationPlan: {
        targetProcessDefinitionKey: plan.targetDefinitionKey,
        mappingInstructions: plan.elementMappings.map(m => ({
          sourceElementId: m.source,
          targetElementId: m.target,
        })),
      },
    });

    // Обновить переменные если нужно
    if (plan.variableUpdates) {
      await this.updateInstanceVariables(instance.processInstanceKey, plan.variableUpdates);
    }

    await this.logMigrationSuccess(plan.id, instance.processInstanceKey);
  }

  /**
   * Автоматическое определение маппинга элементов
   */
  private detectElementMappings(
    sourceXml: string,
    targetXml: string,
  ): ElementMapping[] {
    const sourceElements = this.parseElements(sourceXml);
    const targetElements = this.parseElements(targetXml);

    const mappings: ElementMapping[] = [];

    for (const sourceEl of sourceElements) {
      // Точное совпадение по ID
      const exactMatch = targetElements.find(t => t.id === sourceEl.id);
      if (exactMatch) {
        mappings.push({ source: sourceEl.id, target: exactMatch.id, confidence: 1 });
        continue;
      }

      // Похожее имя
      const nameMatch = targetElements.find(t =>
        t.name && sourceEl.name &&
        this.similarity(t.name, sourceEl.name) > 0.8
      );
      if (nameMatch) {
        mappings.push({
          source: sourceEl.id,
          target: nameMatch.id,
          confidence: 0.8,
        });
      }
    }

    return mappings;
  }

  private similarity(a: string, b: string): number {
    // Levenshtein distance normalized
    // Simplified implementation
    if (a === b) return 1;
    if (a.toLowerCase() === b.toLowerCase()) return 0.95;
    return 0;
  }
}
```

---

## 9. Компенсации и откат

### 9.1 Концепция

Компенсация — это отмена эффектов уже выполненных действий при возникновении ошибки. Например:
- Списали деньги → Ошибка доставки → Вернуть деньги
- Забронировали номер → Отмена рейса → Отменить бронь

### 9.2 BPMN Compensation Events

```xml
<!-- Пример процесса с компенсацией -->
<bpmn:process id="order-with-compensation">
  <bpmn:startEvent id="start" />

  <!-- Шаг 1: Списание оплаты -->
  <bpmn:serviceTask id="chargePayment" name="Списать оплату">
    <bpmn:extensionElements>
      <zeebe:taskDefinition type="payment:charge" />
    </bpmn:extensionElements>
  </bpmn:serviceTask>

  <!-- Компенсирующее событие для оплаты -->
  <bpmn:boundaryEvent id="compensatePayment" attachedToRef="chargePayment">
    <bpmn:compensateEventDefinition />
  </bpmn:boundaryEvent>

  <!-- Компенсирующая задача -->
  <bpmn:serviceTask id="refundPayment" name="Вернуть оплату" isForCompensation="true">
    <bpmn:extensionElements>
      <zeebe:taskDefinition type="payment:refund" />
    </bpmn:extensionElements>
  </bpmn:serviceTask>

  <bpmn:association associationDirection="One" sourceRef="compensatePayment" targetRef="refundPayment" />

  <!-- Шаг 2: Создание заказа -->
  <bpmn:serviceTask id="createOrder" name="Создать заказ">
    <bpmn:extensionElements>
      <zeebe:taskDefinition type="order:create" />
    </bpmn:extensionElements>
  </bpmn:serviceTask>

  <!-- Шаг 3: Доставка (может упасть) -->
  <bpmn:serviceTask id="shipOrder" name="Отправить заказ">
    <bpmn:extensionElements>
      <zeebe:taskDefinition type="shipping:send" />
    </bpmn:extensionElements>
  </bpmn:serviceTask>

  <!-- Обработка ошибки доставки -->
  <bpmn:boundaryEvent id="shippingError" attachedToRef="shipOrder">
    <bpmn:errorEventDefinition errorRef="ShippingFailed" />
  </bpmn:boundaryEvent>

  <!-- При ошибке - запустить компенсацию -->
  <bpmn:intermediateThrowEvent id="triggerCompensation" name="Откатить">
    <bpmn:compensateEventDefinition />
  </bpmn:intermediateThrowEvent>

  <bpmn:endEvent id="endSuccess" />
  <bpmn:endEvent id="endFailed" />

  <!-- Flows -->
  <bpmn:sequenceFlow sourceRef="start" targetRef="chargePayment" />
  <bpmn:sequenceFlow sourceRef="chargePayment" targetRef="createOrder" />
  <bpmn:sequenceFlow sourceRef="createOrder" targetRef="shipOrder" />
  <bpmn:sequenceFlow sourceRef="shipOrder" targetRef="endSuccess" />
  <bpmn:sequenceFlow sourceRef="shippingError" targetRef="triggerCompensation" />
  <bpmn:sequenceFlow sourceRef="triggerCompensation" targetRef="endFailed" />
</bpmn:process>

<bpmn:error id="ShippingFailed" name="Shipping Failed" errorCode="SHIPPING_FAILED" />
```

### 9.3 Workers для компенсации

```typescript
// Основной worker: списание оплаты
zeebeClient.createWorker({
  taskType: 'payment:charge',
  taskHandler: async (job) => {
    const { orderId, amount, customerId } = job.variables;

    const transaction = await this.paymentService.charge(customerId, amount);

    // Сохраняем transactionId для возможной компенсации
    return job.complete({
      transactionId: transaction.id,
      chargedAmount: amount,
    });
  },
});

// Компенсирующий worker: возврат оплаты
zeebeClient.createWorker({
  taskType: 'payment:refund',
  taskHandler: async (job) => {
    const { transactionId, chargedAmount } = job.variables;

    // Используем данные из основной задачи для отката
    await this.paymentService.refund(transactionId, chargedAmount);

    return job.complete({ refunded: true });
  },
});
```

### 9.4 Saga Pattern для распределённых транзакций

```typescript
interface SagaStep {
  name: string;
  execute: (context: Record<string, any>) => Promise<Record<string, any>>;
  compensate: (context: Record<string, any>) => Promise<void>;
}

class SagaOrchestrator {
  private steps: SagaStep[] = [];
  private completedSteps: SagaStep[] = [];

  addStep(step: SagaStep) {
    this.steps.push(step);
    return this;
  }

  async execute(initialContext: Record<string, any>): Promise<Record<string, any>> {
    let context = { ...initialContext };

    for (const step of this.steps) {
      try {
        const result = await step.execute(context);
        context = { ...context, ...result };
        this.completedSteps.push(step);
      } catch (error) {
        // Откатить все выполненные шаги в обратном порядке
        await this.compensate(context);
        throw error;
      }
    }

    return context;
  }

  private async compensate(context: Record<string, any>): Promise<void> {
    for (const step of this.completedSteps.reverse()) {
      try {
        await step.compensate(context);
      } catch (error) {
        // Логировать ошибку компенсации, но продолжать
        console.error(`Compensation failed for ${step.name}:`, error);
      }
    }
  }
}

// Использование
const orderSaga = new SagaOrchestrator()
  .addStep({
    name: 'reserve-inventory',
    execute: async (ctx) => {
      const reservation = await inventoryService.reserve(ctx.items);
      return { reservationId: reservation.id };
    },
    compensate: async (ctx) => {
      await inventoryService.cancelReservation(ctx.reservationId);
    },
  })
  .addStep({
    name: 'charge-payment',
    execute: async (ctx) => {
      const payment = await paymentService.charge(ctx.customerId, ctx.total);
      return { paymentId: payment.id };
    },
    compensate: async (ctx) => {
      await paymentService.refund(ctx.paymentId);
    },
  })
  .addStep({
    name: 'create-shipment',
    execute: async (ctx) => {
      const shipment = await shippingService.create(ctx.address, ctx.items);
      return { shipmentId: shipment.id };
    },
    compensate: async (ctx) => {
      await shippingService.cancel(ctx.shipmentId);
    },
  });

// Выполнение
try {
  const result = await orderSaga.execute({
    customerId: '123',
    items: [{ sku: 'ABC', qty: 2 }],
    total: 100,
    address: '...',
  });
} catch (error) {
  // Saga автоматически откатит все шаги
}
```

---

## 10. Аналитика и отчёты

### 10.1 Метрики процессов

| Метрика | Описание | Формула |
|---------|----------|---------|
| **Throughput** | Количество завершённых процессов | COUNT(completed) / period |
| **Cycle Time** | Время от старта до завершения | AVG(completedAt - startedAt) |
| **Lead Time** | Время от создания заявки до завершения | AVG(process.completedAt - entity.createdAt) |
| **Wait Time** | Время ожидания в очередях | SUM(task.claimedAt - task.createdAt) |
| **Touch Time** | Фактическое время работы | SUM(task.completedAt - task.claimedAt) |
| **Efficiency** | Эффективность процесса | TouchTime / CycleTime * 100% |
| **First Pass Yield** | % процессов без возвратов | COUNT(no_rework) / COUNT(total) |
| **SLA Compliance** | % выполнения SLA | COUNT(sla_met) / COUNT(total) |

### 10.2 Модель данных для аналитики

```sql
-- Materialized view для статистики процессов
CREATE MATERIALIZED VIEW mv_process_statistics AS
SELECT
  pd.workspace_id,
  pd.id AS process_definition_id,
  pd.name AS process_name,

  -- Общие счётчики
  COUNT(pi.id) AS total_instances,
  COUNT(CASE WHEN pi.status = 'completed' THEN 1 END) AS completed_instances,
  COUNT(CASE WHEN pi.status = 'active' THEN 1 END) AS active_instances,
  COUNT(CASE WHEN pi.status = 'incident' THEN 1 END) AS incident_instances,

  -- Временные метрики (в минутах)
  AVG(EXTRACT(EPOCH FROM (pi.completed_at - pi.started_at)) / 60)
    FILTER (WHERE pi.status = 'completed') AS avg_cycle_time_minutes,

  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pi.completed_at - pi.started_at)) / 60
  ) FILTER (WHERE pi.status = 'completed') AS median_cycle_time_minutes,

  PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (pi.completed_at - pi.started_at)) / 60
  ) FILTER (WHERE pi.status = 'completed') AS p95_cycle_time_minutes,

  -- За период
  COUNT(pi.id) FILTER (WHERE pi.started_at > NOW() - INTERVAL '24 hours') AS instances_24h,
  COUNT(pi.id) FILTER (WHERE pi.started_at > NOW() - INTERVAL '7 days') AS instances_7d,
  COUNT(pi.id) FILTER (WHERE pi.started_at > NOW() - INTERVAL '30 days') AS instances_30d

FROM process_definitions pd
LEFT JOIN process_instances pi ON pi.process_definition_id = pd.id
GROUP BY pd.workspace_id, pd.id, pd.name;

CREATE UNIQUE INDEX idx_mv_process_stats_id ON mv_process_statistics(process_definition_id);

-- Статистика по элементам процесса (для тепловой карты)
CREATE MATERIALIZED VIEW mv_element_statistics AS
SELECT
  pi.process_definition_id,
  el.element_id,
  el.element_name,
  el.element_type,

  COUNT(*) AS execution_count,
  AVG(el.duration_ms) AS avg_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY el.duration_ms) AS p95_duration_ms,

  COUNT(CASE WHEN el.status = 'incident' THEN 1 END) AS incident_count

FROM process_instances pi
CROSS JOIN LATERAL jsonb_to_recordset(pi.element_history) AS el(
  element_id TEXT,
  element_name TEXT,
  element_type TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  status TEXT
)
WHERE pi.completed_at > NOW() - INTERVAL '30 days'
GROUP BY pi.process_definition_id, el.element_id, el.element_name, el.element_type;

CREATE INDEX idx_mv_element_stats ON mv_element_statistics(process_definition_id);

-- Ежедневная агрегация
CREATE TABLE daily_process_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  process_definition_id UUID REFERENCES process_definitions(id),

  -- Счётчики
  started_count INT DEFAULT 0,
  completed_count INT DEFAULT 0,
  incident_count INT DEFAULT 0,

  -- Времена (в минутах)
  avg_cycle_time NUMERIC(10,2),
  min_cycle_time NUMERIC(10,2),
  max_cycle_time NUMERIC(10,2),

  -- SLA
  sla_met_count INT DEFAULT 0,
  sla_breached_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date, workspace_id, process_definition_id)
);

CREATE INDEX idx_daily_metrics_date ON daily_process_metrics(date);
CREATE INDEX idx_daily_metrics_workspace ON daily_process_metrics(workspace_id);
```

### 10.3 Backend: AnalyticsModule

```
apps/backend/src/modules/analytics/
├── analytics.module.ts
├── analytics.service.ts
├── process-mining.service.ts    # Process mining алгоритмы
├── analytics.controller.ts
├── jobs/
│   ├── refresh-views.job.ts     # Обновление materialized views
│   └── aggregate-daily.job.ts   # Ежедневная агрегация
└── dto/
    └── analytics-query.dto.ts
```

#### process-mining.service.ts

```typescript
@Injectable()
export class ProcessMiningService {
  /**
   * Построить граф фактического выполнения процессов
   */
  async discoverProcessModel(
    definitionId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<ProcessModel> {
    // Получить все завершённые экземпляры
    const instances = await this.processInstanceRepository.find({
      where: {
        processDefinitionId: definitionId,
        status: 'completed',
        completedAt: Between(dateFrom, dateTo),
      },
    });

    // Построить граф переходов
    const transitions: Map<string, Map<string, number>> = new Map();
    const elementCounts: Map<string, number> = new Map();

    for (const instance of instances) {
      const elements = instance.elementHistory || [];

      for (let i = 0; i < elements.length - 1; i++) {
        const from = elements[i].elementId;
        const to = elements[i + 1].elementId;

        // Счётчик элементов
        elementCounts.set(from, (elementCounts.get(from) || 0) + 1);

        // Счётчик переходов
        if (!transitions.has(from)) {
          transitions.set(from, new Map());
        }
        const fromTransitions = transitions.get(from)!;
        fromTransitions.set(to, (fromTransitions.get(to) || 0) + 1);
      }

      // Последний элемент
      const last = elements[elements.length - 1]?.elementId;
      if (last) {
        elementCounts.set(last, (elementCounts.get(last) || 0) + 1);
      }
    }

    return {
      elements: Array.from(elementCounts.entries()).map(([id, count]) => ({
        id,
        count,
        frequency: count / instances.length,
      })),
      transitions: Array.from(transitions.entries()).flatMap(([from, toMap]) =>
        Array.from(toMap.entries()).map(([to, count]) => ({
          from,
          to,
          count,
          frequency: count / instances.length,
        }))
      ),
      totalInstances: instances.length,
    };
  }

  /**
   * Найти узкие места (bottlenecks)
   */
  async findBottlenecks(
    definitionId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Bottleneck[]> {
    const stats = await this.getElementStatistics(definitionId, dateFrom, dateTo);

    // Сортируем по среднему времени выполнения
    const sorted = stats.sort((a, b) => b.avgDurationMs - a.avgDurationMs);

    // Берём топ-5 самых медленных
    return sorted.slice(0, 5).map((el, index) => ({
      elementId: el.elementId,
      elementName: el.elementName,
      avgDurationMs: el.avgDurationMs,
      p95DurationMs: el.p95DurationMs,
      executionCount: el.executionCount,
      impact: this.calculateImpact(el, stats),
      rank: index + 1,
      suggestions: this.generateSuggestions(el),
    }));
  }

  /**
   * Найти аномалии (outliers)
   */
  async findAnomalies(
    definitionId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Anomaly[]> {
    const instances = await this.processInstanceRepository.find({
      where: {
        processDefinitionId: definitionId,
        completedAt: Between(dateFrom, dateTo),
      },
    });

    // Рассчитать статистики
    const cycleTimes = instances
      .filter(i => i.completedAt && i.startedAt)
      .map(i => differenceInMinutes(i.completedAt!, i.startedAt!));

    const mean = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
    const std = Math.sqrt(
      cycleTimes.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / cycleTimes.length
    );

    // Найти выбросы (> 2 стандартных отклонения)
    const anomalies: Anomaly[] = [];
    for (const instance of instances) {
      if (!instance.completedAt || !instance.startedAt) continue;

      const cycleTime = differenceInMinutes(instance.completedAt, instance.startedAt);
      const zScore = (cycleTime - mean) / std;

      if (Math.abs(zScore) > 2) {
        anomalies.push({
          instanceId: instance.id,
          instanceKey: instance.processInstanceKey,
          cycleTimeMinutes: cycleTime,
          expectedMinutes: mean,
          deviation: zScore,
          type: zScore > 0 ? 'slow' : 'fast',
        });
      }
    }

    return anomalies.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  }

  private calculateImpact(element: ElementStats, allStats: ElementStats[]): number {
    const totalTime = allStats.reduce((sum, el) => sum + el.avgDurationMs * el.executionCount, 0);
    const elementTime = element.avgDurationMs * element.executionCount;
    return (elementTime / totalTime) * 100;
  }

  private generateSuggestions(element: ElementStats): string[] {
    const suggestions: string[] = [];

    if (element.avgDurationMs > 60000) {
      suggestions.push('Рассмотрите автоматизацию этого шага');
    }

    if (element.p95DurationMs / element.avgDurationMs > 3) {
      suggestions.push('Высокая вариативность — проверьте причины задержек');
    }

    if (element.elementType === 'userTask') {
      suggestions.push('Проверьте назначение и SLA для этой задачи');
    }

    return suggestions;
  }
}
```

### 10.4 API Endpoints

```typescript
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  // Dashboard метрики
  @Get('dashboard')
  async getDashboard(
    @Query('workspaceId') workspaceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {}

  // Статистика по процессу
  @Get('process/:definitionId')
  async getProcessStats(
    @Param('definitionId') definitionId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {}

  // Данные для тепловой карты
  @Get('process/:definitionId/heatmap')
  async getHeatmapData(@Param('definitionId') definitionId: string) {}

  // Process mining: обнаруженная модель
  @Get('process/:definitionId/discovered-model')
  async getDiscoveredModel(
    @Param('definitionId') definitionId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {}

  // Узкие места
  @Get('process/:definitionId/bottlenecks')
  async getBottlenecks(@Param('definitionId') definitionId: string) {}

  // Аномалии
  @Get('process/:definitionId/anomalies')
  async getAnomalies(@Param('definitionId') definitionId: string) {}

  // Тренды
  @Get('trends')
  async getTrends(
    @Query('workspaceId') workspaceId: string,
    @Query('metric') metric: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'week' | 'month',
  ) {}

  // Экспорт отчёта
  @Get('report/export')
  async exportReport(
    @Query('workspaceId') workspaceId: string,
    @Query('format') format: 'pdf' | 'xlsx' | 'csv',
  ) {}
}
```

### 10.5 Frontend: UI компоненты

```
apps/frontend/src/components/analytics/
├── AnalyticsDashboard.tsx       # Главный dashboard
├── ProcessMetricsCard.tsx       # Карточка с метриками процесса
├── TrendChart.tsx               # График трендов
├── BottlenecksTable.tsx         # Таблица узких мест
├── AnomaliesAlert.tsx           # Алерт об аномалиях
├── ProcessMiningView.tsx        # Визуализация process mining
├── SlaComplianceChart.tsx       # Диаграмма SLA compliance
├── CycleTimeDistribution.tsx    # Распределение cycle time
└── hooks/
    ├── useAnalytics.ts
    └── useProcessMining.ts
```

---

## 11. Шаблоны процессов

### 11.1 Концепция

Библиотека готовых BPMN-процессов для быстрого старта:
- Преднастроенные процессы для типовых сценариев
- Возможность кастомизации
- Версионирование шаблонов

### 11.2 Модель данных

```sql
-- Шаблоны процессов
CREATE TABLE process_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = глобальный шаблон, иначе шаблон workspace
  workspace_id UUID REFERENCES workspaces(id),

  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),  -- 'approval', 'support', 'hr', 'finance', 'custom'

  -- BPMN
  bpmn_xml TEXT NOT NULL,
  thumbnail_url TEXT,  -- Превью диаграммы

  -- Метаданные
  tags TEXT[],
  variables_schema JSONB,  -- JSON Schema переменных
  required_connectors TEXT[],  -- ['email', 'telegram']

  -- Статистика использования
  usage_count INT DEFAULT 0,
  rating NUMERIC(3,2),  -- Средний рейтинг 1-5

  is_public BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,

  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_process_templates_category ON process_templates(category);
CREATE INDEX idx_process_templates_tags ON process_templates USING GIN(tags);

-- Отзывы на шаблоны
CREATE TABLE template_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES process_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),

  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(template_id, user_id)
);
```

### 11.3 Предустановленные шаблоны

```typescript
const builtInTemplates: ProcessTemplate[] = [
  {
    id: 'approval-3-level',
    name: 'Согласование в 3 уровня',
    description: 'Последовательное согласование: исполнитель → руководитель → директор',
    category: 'approval',
    tags: ['согласование', 'approval', 'иерархия'],
    bpmnXml: `...`, // BPMN XML
    variablesSchema: {
      type: 'object',
      properties: {
        requestTitle: { type: 'string', title: 'Название заявки' },
        amount: { type: 'number', title: 'Сумма' },
        level1Approver: { type: 'string', title: 'Согласующий уровень 1' },
        level2Approver: { type: 'string', title: 'Согласующий уровень 2' },
        level3Approver: { type: 'string', title: 'Согласующий уровень 3' },
      },
    },
  },
  {
    id: 'support-ticket',
    name: 'Обработка обращения',
    description: 'Стандартный процесс обработки обращения в службу поддержки',
    category: 'support',
    tags: ['support', 'helpdesk', 'ticket'],
    bpmnXml: `...`,
  },
  {
    id: 'employee-onboarding',
    name: 'Онбординг сотрудника',
    description: 'Процесс адаптации нового сотрудника',
    category: 'hr',
    tags: ['hr', 'onboarding', 'hiring'],
    bpmnXml: `...`,
  },
  {
    id: 'purchase-request',
    name: 'Заявка на закупку',
    description: 'Процесс согласования и выполнения закупки',
    category: 'finance',
    tags: ['закупка', 'purchase', 'procurement'],
    bpmnXml: `...`,
  },
  {
    id: 'document-review',
    name: 'Согласование документа',
    description: 'Параллельное согласование документа несколькими участниками',
    category: 'approval',
    tags: ['документ', 'согласование', 'parallel'],
    bpmnXml: `...`,
  },
  {
    id: 'incident-management',
    name: 'Управление инцидентами',
    description: 'ITIL-совместимый процесс управления инцидентами',
    category: 'support',
    tags: ['itil', 'incident', 'sla'],
    bpmnXml: `...`,
  },
];
```

### 11.4 API Endpoints

```typescript
@Controller('templates')
export class TemplatesController {
  // Список шаблонов
  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string[],
  ) {}

  // Детали шаблона
  @Get(':id')
  async findOne(@Param('id') id: string) {}

  // Создать процесс из шаблона
  @Post(':id/instantiate')
  async instantiate(
    @Param('id') id: string,
    @Body() dto: InstantiateTemplateDto,
    @CurrentUser() user: User,
  ) {
    // Копирует BPMN из шаблона в новый ProcessDefinition
    // Позволяет настроить переменные
  }

  // Создать свой шаблон из процесса
  @Post('from-definition/:definitionId')
  async createFromDefinition(
    @Param('definitionId') definitionId: string,
    @Body() dto: CreateTemplateDto,
    @CurrentUser() user: User,
  ) {}

  // Оценить шаблон
  @Post(':id/review')
  async addReview(
    @Param('id') id: string,
    @Body() dto: AddReviewDto,
    @CurrentUser() user: User,
  ) {}
}
```

---

## 12. Права доступа

### 12.1 Роли в BPMN

| Роль | Описание | Права |
|------|----------|-------|
| **bpmn:admin** | Администратор процессов | Все права |
| **bpmn:designer** | Разработчик процессов | Создание, редактирование, деплой |
| **bpmn:manager** | Менеджер процессов | Просмотр, запуск, управление инстансами |
| **bpmn:user** | Пользователь | Выполнение назначенных задач |
| **bpmn:viewer** | Наблюдатель | Только просмотр |

### 12.2 Модель данных

```sql
-- Роли в BPMN модуле
CREATE TABLE bpmn_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role VARCHAR(50) NOT NULL,  -- 'admin', 'designer', 'manager', 'user', 'viewer'

  -- Ограничения (опционально)
  process_definition_ids UUID[],  -- Если указано, роль только для этих процессов

  granted_by_id UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, user_id, role)
);

CREATE INDEX idx_bpmn_roles_workspace_user ON bpmn_roles(workspace_id, user_id);

-- Группы пользователей (для candidate groups в задачах)
CREATE TABLE user_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  key VARCHAR(100) NOT NULL,  -- 'managers', 'finance-team'
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, key)
);

CREATE TABLE user_group_members (
  group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  added_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY(group_id, user_id)
);

CREATE INDEX idx_user_group_members_user ON user_group_members(user_id);
```

### 12.3 Backend: Guards

```typescript
// bpmn-roles.guard.ts
@Injectable()
export class BpmnRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private bpmnRolesService: BpmnRolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<string[]>('bpmn-roles', context.getHandler());
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const workspaceId = request.params.workspaceId || request.body.workspaceId || request.query.workspaceId;

    if (!workspaceId) {
      return false;
    }

    const userRoles = await this.bpmnRolesService.getUserRoles(user.id, workspaceId);

    return requiredRoles.some(role => userRoles.includes(role));
  }
}

// Декоратор
export const BpmnRoles = (...roles: string[]) => SetMetadata('bpmn-roles', roles);

// Использование
@Controller('bpmn/definitions')
@UseGuards(JwtAuthGuard, BpmnRolesGuard)
export class BpmnDefinitionsController {
  @Post()
  @BpmnRoles('admin', 'designer')
  async create(@Body() dto: CreateDefinitionDto) {}

  @Post(':id/deploy')
  @BpmnRoles('admin', 'designer')
  async deploy(@Param('id') id: string) {}

  @Get()
  @BpmnRoles('admin', 'designer', 'manager', 'viewer')
  async findAll(@Query('workspaceId') workspaceId: string) {}
}
```

### 12.4 Матрица прав

| Действие | admin | designer | manager | user | viewer |
|----------|-------|----------|---------|------|--------|
| Создать процесс | ✅ | ✅ | ❌ | ❌ | ❌ |
| Редактировать процесс | ✅ | ✅ | ❌ | ❌ | ❌ |
| Удалить процесс | ✅ | ❌ | ❌ | ❌ | ❌ |
| Деплой процесса | ✅ | ✅ | ❌ | ❌ | ❌ |
| Запустить инстанс | ✅ | ✅ | ✅ | ❌ | ❌ |
| Отменить инстанс | ✅ | ❌ | ✅ | ❌ | ❌ |
| Выполнить задачу | ✅ | ✅ | ✅ | ✅ | ❌ |
| Просмотр статистики | ✅ | ✅ | ✅ | ❌ | ✅ |
| Управление правами | ✅ | ❌ | ❌ | ❌ | ❌ |
| Настройка коннекторов | ✅ | ✅ | ❌ | ❌ | ❌ |
| Настройка SLA | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## 13. AI/ML интеграция

### 13.1 Сценарии использования

| Сценарий | Описание | Модель |
|----------|----------|--------|
| **Классификация** | Автоматическое определение категории заявки | Text Classification |
| **Маршрутизация** | Предсказание исполнителя | Recommendation |
| **Приоритизация** | Оценка приоритета | Regression |
| **SLA Prediction** | Предсказание времени решения | Time Series |
| **Anomaly Detection** | Выявление аномальных процессов | Anomaly Detection |
| **NLP Extraction** | Извлечение сущностей из текста | NER |

### 13.2 Архитектура ML Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                       ML Pipeline                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Feature    │    │   Model     │    │  Prediction │         │
│  │  Extraction │───►│   Storage   │───►│   Service   │         │
│  │             │    │  (MLflow)   │    │             │         │
│  └─────────────┘    └─────────────┘    └──────┬──────┘         │
│         ▲                                      │                 │
│         │                                      ▼                 │
│  ┌──────┴──────┐                      ┌─────────────┐           │
│  │  Training   │                      │   Zeebe     │           │
│  │   Data      │◄─────────────────────│   Worker    │           │
│  │  (history)  │     feedback loop    │  (ml-*)     │           │
│  └─────────────┘                      └─────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.3 Модель данных

```sql
-- ML модели
CREATE TABLE ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),  -- NULL = глобальная модель

  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,  -- 'classification', 'regression', 'recommendation'
  target VARCHAR(100) NOT NULL,  -- 'category', 'assignee', 'priority', 'resolution_time'

  -- Версионирование
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT false,

  -- Метрики качества
  metrics JSONB,  -- { "accuracy": 0.85, "f1": 0.82, "precision": 0.88 }

  -- Конфигурация
  feature_config JSONB,  -- Какие поля использовать
  model_config JSONB,    -- Параметры модели

  -- Хранение модели
  model_path TEXT,  -- S3 path или локальный путь
  model_size_bytes BIGINT,

  trained_at TIMESTAMPTZ,
  trained_on_samples INT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ml_models_workspace ON ml_models(workspace_id);
CREATE INDEX idx_ml_models_type ON ml_models(type, target);

-- Предсказания (для feedback loop)
CREATE TABLE ml_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES ml_models(id),
  entity_id UUID REFERENCES entities(id),

  -- Входные данные
  input_features JSONB NOT NULL,

  -- Результат
  prediction JSONB NOT NULL,  -- { "value": "support", "confidence": 0.92 }

  -- Feedback
  actual_value TEXT,  -- Реальное значение (для обучения)
  was_correct BOOLEAN,
  feedback_at TIMESTAMPTZ,

  predicted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ml_predictions_model ON ml_predictions(model_id);
CREATE INDEX idx_ml_predictions_entity ON ml_predictions(entity_id);
```

### 13.4 Backend: MlModule

```
apps/backend/src/modules/ml/
├── ml.module.ts
├── ml.service.ts              # Основной сервис
├── ml-training.service.ts     # Обучение моделей
├── ml-prediction.service.ts   # Предсказания
├── ml.controller.ts
├── workers/
│   ├── ml-classify.worker.ts
│   ├── ml-route.worker.ts
│   └── ml-predict-sla.worker.ts
└── models/
    ├── text-classifier.ts
    └── recommendation.ts
```

#### ml-prediction.service.ts

```typescript
@Injectable()
export class MlPredictionService {
  constructor(
    @InjectRepository(MlModel)
    private modelRepository: Repository<MlModel>,
    @InjectRepository(MlPrediction)
    private predictionRepository: Repository<MlPrediction>,
  ) {}

  /**
   * Классифицировать текст
   */
  async classify(
    workspaceId: string,
    target: string,
    text: string,
    additionalFeatures?: Record<string, any>,
  ): Promise<ClassificationResult> {
    // Найти активную модель
    const model = await this.findActiveModel(workspaceId, 'classification', target);
    if (!model) {
      return { value: null, confidence: 0, modelFound: false };
    }

    // Извлечь фичи
    const features = this.extractFeatures(text, additionalFeatures, model.featureConfig);

    // Предсказание
    const prediction = await this.runPrediction(model, features);

    // Сохранить для feedback loop
    await this.savePrediction(model.id, features, prediction);

    return {
      value: prediction.label,
      confidence: prediction.probability,
      modelFound: true,
      modelVersion: model.version,
    };
  }

  /**
   * Рекомендовать исполнителя
   */
  async recommendAssignee(
    workspaceId: string,
    entityData: {
      title: string;
      description: string;
      category?: string;
      priority?: string;
    },
  ): Promise<AssigneeRecommendation[]> {
    const model = await this.findActiveModel(workspaceId, 'recommendation', 'assignee');
    if (!model) {
      return [];
    }

    const features = this.extractFeatures(
      `${entityData.title} ${entityData.description}`,
      entityData,
      model.featureConfig,
    );

    const predictions = await this.runPrediction(model, features);

    return predictions.recommendations.map((rec: any) => ({
      userId: rec.userId,
      score: rec.score,
      reasons: rec.reasons,
    }));
  }

  /**
   * Предсказать время решения
   */
  async predictResolutionTime(
    workspaceId: string,
    entityData: {
      category?: string;
      priority?: string;
      wordCount: number;
      hasAttachments: boolean;
    },
  ): Promise<ResolutionTimePrediction> {
    const model = await this.findActiveModel(workspaceId, 'regression', 'resolution_time');
    if (!model) {
      return { estimatedMinutes: null, confidence: 0, modelFound: false };
    }

    const features = {
      ...entityData,
      dayOfWeek: new Date().getDay(),
      hourOfDay: new Date().getHours(),
    };

    const prediction = await this.runPrediction(model, features);

    return {
      estimatedMinutes: Math.round(prediction.value),
      confidence: prediction.confidence,
      modelFound: true,
      range: {
        min: Math.round(prediction.lower),
        max: Math.round(prediction.upper),
      },
    };
  }

  /**
   * Записать feedback для улучшения модели
   */
  async recordFeedback(
    predictionId: string,
    actualValue: string,
  ): Promise<void> {
    const prediction = await this.predictionRepository.findOneOrFail({
      where: { id: predictionId },
    });

    await this.predictionRepository.update(predictionId, {
      actualValue,
      wasCorrect: prediction.prediction.value === actualValue,
      feedbackAt: new Date(),
    });
  }

  private async runPrediction(model: MlModel, features: Record<string, any>): Promise<any> {
    // В реальности здесь был бы вызов ML сервиса (Python/TensorFlow/PyTorch)
    // Для простоты используем rule-based fallback

    // Пример интеграции с внешним ML сервисом:
    // const response = await fetch(`${ML_SERVICE_URL}/predict`, {
    //   method: 'POST',
    //   body: JSON.stringify({ model_id: model.id, features }),
    // });
    // return response.json();

    return this.ruleBased(model.target, features);
  }

  private ruleBased(target: string, features: Record<string, any>): any {
    // Fallback на простые правила
    switch (target) {
      case 'category':
        return this.classifyByKeywords(features.text);
      case 'priority':
        return this.estimatePriority(features);
      default:
        return { value: null, confidence: 0 };
    }
  }
}
```

### 13.5 Zeebe Workers для ML

```typescript
// ml-classify.worker.ts
zeebeClient.createWorker({
  taskType: 'ml:classify',
  taskHandler: async (job) => {
    const { text, target, workspaceId } = job.variables as any;

    const result = await this.mlPredictionService.classify(
      workspaceId,
      target,
      text,
    );

    return job.complete({
      [`predicted_${target}`]: result.value,
      [`${target}_confidence`]: result.confidence,
    });
  },
});

// ml-recommend-assignee.worker.ts
zeebeClient.createWorker({
  taskType: 'ml:recommend-assignee',
  taskHandler: async (job) => {
    const { title, description, category, workspaceId } = job.variables as any;

    const recommendations = await this.mlPredictionService.recommendAssignee(
      workspaceId,
      { title, description, category },
    );

    return job.complete({
      suggestedAssignees: recommendations.slice(0, 3),
      topAssignee: recommendations[0]?.userId || null,
    });
  },
});
```

---

## 14. Кросс-workspace взаимодействие

### 14.1 Концепция

Процессы могут создавать и связывать сущности между разными workspace:
- Заявка в IT Helpdesk → Создать заявку на закупку в Procurement
- Заявка на отпуск в HR → Уведомить в Project Management

### 14.2 Модель данных

```sql
-- Связи между entities
CREATE TABLE entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  link_type VARCHAR(50) NOT NULL,
  -- 'spawned' - создано процессом
  -- 'blocks' - блокирует
  -- 'blocked_by' - заблокировано
  -- 'related' - связано
  -- 'duplicate' - дубликат
  -- 'parent' / 'child' - иерархия

  -- Метаданные связи
  metadata JSONB DEFAULT '{}',
  -- { "createdByProcess": "uuid", "reason": "Требуется закупка" }

  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source_entity_id, target_entity_id, link_type)
);

CREATE INDEX idx_entity_links_source ON entity_links(source_entity_id);
CREATE INDEX idx_entity_links_target ON entity_links(target_entity_id);
CREATE INDEX idx_entity_links_type ON entity_links(link_type);

-- Разрешения на кросс-workspace операции
CREATE TABLE cross_workspace_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  target_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Разрешённые операции
  can_create_entities BOOLEAN DEFAULT false,
  can_link_entities BOOLEAN DEFAULT false,
  can_read_entities BOOLEAN DEFAULT false,
  can_send_messages BOOLEAN DEFAULT false,

  -- Ограничения
  allowed_entity_types TEXT[],  -- NULL = все типы
  max_entities_per_day INT,     -- Лимит на создание

  granted_by_id UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source_workspace_id, target_workspace_id)
);
```

### 14.3 Backend: Workers для кросс-workspace

```typescript
// create-entity.worker.ts
zeebeClient.createWorker({
  taskType: 'create-entity',
  taskHandler: async (job) => {
    const {
      targetWorkspaceId,
      title,
      description,
      priority,
      parentEntityId,
      linkType,
      metadata,
    } = job.variables as any;

    const sourceWorkspaceId = job.variables.workspaceId;

    // Проверить разрешения
    const permission = await this.crossWorkspaceService.checkPermission(
      sourceWorkspaceId,
      targetWorkspaceId,
      'create_entity',
    );

    if (!permission.allowed) {
      return job.fail({
        errorMessage: `Cross-workspace creation not allowed: ${permission.reason}`,
        retries: 0,
      });
    }

    // Создать entity в целевом workspace
    const entity = await this.entityService.create({
      workspaceId: targetWorkspaceId,
      title,
      description,
      priority,
      metadata: {
        ...metadata,
        createdByProcess: job.processInstanceKey,
        sourceWorkspaceId,
        sourceEntityId: parentEntityId,
      },
    });

    // Создать связь
    if (parentEntityId) {
      await this.entityLinksService.create({
        sourceEntityId: parentEntityId,
        targetEntityId: entity.id,
        linkType: linkType || 'spawned',
        metadata: {
          createdByProcess: job.processInstanceKey,
        },
      });
    }

    return job.complete({
      createdEntityId: entity.id,
      createdInWorkspace: targetWorkspaceId,
    });
  },
});

// wait-for-linked-entity.worker.ts
zeebeClient.createWorker({
  taskType: 'wait-for-linked-entity',
  taskHandler: async (job) => {
    const { linkedEntityId, expectedStatus, timeoutMinutes } = job.variables as any;

    // Подписаться на изменения статуса связанной entity
    // Когда статус изменится - отправить message в процесс

    await this.entityWatcherService.watch({
      entityId: linkedEntityId,
      expectedStatus,
      correlationKey: job.processInstanceKey,
      messageName: 'linked-entity-status-changed',
      timeoutMinutes: timeoutMinutes || 1440, // 24 часа по умолчанию
    });

    // Не завершаем job - процесс будет ждать message
    return job.forward();
  },
});
```

### 14.4 Frontend: UI для связей

```tsx
// EntityLinks.tsx
interface EntityLinksProps {
  entityId: string;
}

export function EntityLinks({ entityId }: EntityLinksProps) {
  const { data: links, isLoading } = useEntityLinks(entityId);

  if (isLoading) return <Skeleton />;

  const groupedLinks = groupBy(links, 'linkType');

  return (
    <div className="space-y-4">
      {/* Spawned entities */}
      {groupedLinks.spawned?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">
            Созданные заявки
          </h4>
          {groupedLinks.spawned.map(link => (
            <LinkedEntityCard key={link.id} link={link} />
          ))}
        </div>
      )}

      {/* Blocking */}
      {groupedLinks.blocked_by?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-500 mb-2">
            Заблокировано
          </h4>
          {groupedLinks.blocked_by.map(link => (
            <LinkedEntityCard key={link.id} link={link} showStatus />
          ))}
        </div>
      )}

      {/* Related */}
      {groupedLinks.related?.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">
            Связанные
          </h4>
          {groupedLinks.related.map(link => (
            <LinkedEntityCard key={link.id} link={link} />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 15. План реализации

### 15.1 Фазы

```
┌─────────────────────────────────────────────────────────────────┐
│                    Roadmap: BPMN Platform                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Фаза 1: Триггеры + Human Tasks (4-5 недель)                    │
│  ─────────────────────────────────────────────                  │
│  • Триггеры запуска процессов                                   │
│  • User Tasks с inbox                                           │
│  • Базовые формы                                                │
│  • Кросс-workspace создание entities                            │
│                                                                  │
│  Фаза 2: SLA + DMN (3-4 недели)                                 │
│  ──────────────────────────────                                 │
│  • SLA определения и мониторинг                                 │
│  • DMN таблицы решений                                          │
│  • Эскалация и уведомления                                      │
│                                                                  │
│  Фаза 3: Интеграции (4-5 недель)                                │
│  ───────────────────────────────                                │
│  • Framework коннекторов                                        │
│  • Email, Telegram, REST коннекторы                             │
│  • 1C интеграция (опционально)                                  │
│                                                                  │
│  Фаза 4: Аналитика + Шаблоны (3-4 недели)                       │
│  ─────────────────────────────────────────                      │
│  • Process mining                                               │
│  • Dashboards и отчёты                                          │
│  • Библиотека шаблонов                                          │
│                                                                  │
│  Фаза 5: AI/ML + Оптимизация (4-6 недель)                       │
│  ──────────────────────────────────────────                     │
│  • ML классификация и рекомендации                              │
│  • Предсказание SLA                                             │
│  • Оптимизация производительности                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 15.2 Детальный план Фазы 1

| # | Задача | Приоритет | Оценка | Зависимости |
|---|--------|-----------|--------|-------------|
| **1.1** | **Триггеры** | | | |
| 1.1.1 | Модель данных (миграция) | 🔴 | 2ч | — |
| 1.1.2 | TriggersService (CRUD + evaluation) | 🔴 | 8ч | 1.1.1 |
| 1.1.3 | EntityEventListener | 🔴 | 4ч | 1.1.2 |
| 1.1.4 | CronTriggerScheduler | 🟡 | 4ч | 1.1.2 |
| 1.1.5 | WebhookController | 🟡 | 3ч | 1.1.2 |
| 1.1.6 | API endpoints | 🔴 | 3ч | 1.1.2 |
| 1.1.7 | Frontend: TriggersList + Form | 🔴 | 8ч | 1.1.6 |
| 1.1.8 | Unit тесты | 🔴 | 4ч | 1.1.2-1.1.5 |
| **1.2** | **Human Tasks** | | | |
| 1.2.1 | Модель данных (миграция) | 🔴 | 2ч | — |
| 1.2.2 | UserTasksService | 🔴 | 12ч | 1.2.1 |
| 1.2.3 | UserTasksWorker (Zeebe) | 🔴 | 6ч | 1.2.2 |
| 1.2.4 | API endpoints | 🔴 | 4ч | 1.2.2 |
| 1.2.5 | Frontend: TaskInbox | 🔴 | 10ч | 1.2.4 |
| 1.2.6 | Frontend: TaskDetail + Actions | 🔴 | 8ч | 1.2.5 |
| 1.2.7 | WebSocket уведомления | 🟡 | 3ч | 1.2.2 |
| 1.2.8 | Unit тесты | 🔴 | 6ч | 1.2.2-1.2.3 |
| **1.3** | **Формы** | | | |
| 1.3.1 | Модель данных FormDefinitions | 🟡 | 2ч | — |
| 1.3.2 | FormsService | 🟡 | 4ч | 1.3.1 |
| 1.3.3 | Frontend: DynamicForm | 🔴 | 12ч | 1.3.2 |
| 1.3.4 | Базовые типы полей | 🔴 | 8ч | 1.3.3 |
| 1.3.5 | Кастомные компоненты (user-picker, file-upload) | 🟡 | 6ч | 1.3.4 |
| **1.4** | **Кросс-workspace** | | | |
| 1.4.1 | Модель данных entity_links | 🔴 | 2ч | — |
| 1.4.2 | EntityLinksService | 🔴 | 4ч | 1.4.1 |
| 1.4.3 | CrossWorkspaceService | 🔴 | 4ч | 1.4.1 |
| 1.4.4 | create-entity worker | 🔴 | 4ч | 1.4.2, 1.4.3 |
| 1.4.5 | Frontend: EntityLinks | 🟡 | 4ч | 1.4.2 |
| 1.4.6 | Unit тесты | 🔴 | 4ч | 1.4.2-1.4.4 |

**Итого Фаза 1:** ~130 часов (4-5 недель при 1 разработчике)

### 15.3 Приоритеты функционала

```
┌─────────────────────────────────────────────────────────────────┐
│                    Priority Matrix                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│         High Impact                     Low Impact               │
│              │                              │                    │
│   ┌──────────┼──────────┐      ┌───────────┼───────────┐        │
│   │ Триггеры │ Human    │      │ Шаблоны   │ Process   │        │
│   │          │ Tasks    │      │           │ Mining    │        │
│   │          │          │      │           │           │ High   │
│   │ SLA      │ Формы    │      │ ML        │ DMN       │ Effort │
│   │          │          │      │           │           │        │
│   └──────────┼──────────┘      └───────────┼───────────┘        │
│              │                              │                    │
│   ┌──────────┼──────────┐      ┌───────────┼───────────┐        │
│   │ Cross-   │ Коннек-  │      │ Версиони- │ Компен-   │        │
│   │ workspace│ торы     │      │ рование   │ сации     │        │
│   │          │ (Email,  │      │           │           │ Low    │
│   │ Права    │ Telegram)│      │ Аналитика │           │ Effort │
│   │ доступа  │          │      │           │           │        │
│   └──────────┴──────────┘      └───────────┴───────────┘        │
│                                                                  │
│         Must Have              Nice to Have                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 15.4 Зависимости между модулями

```
                    ┌─────────────┐
                    │   Triggers  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌───────────┐ ┌───────────┐ ┌───────────┐
       │  Human    │ │   SLA     │ │   Cross-  │
       │  Tasks    │ │           │ │  workspace│
       └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
             │             │             │
             └──────┬──────┴──────┬──────┘
                    ▼             ▼
             ┌───────────┐ ┌───────────┐
             │   Forms   │ │ Connectors│
             └─────┬─────┘ └─────┬─────┘
                   │             │
                   └──────┬──────┘
                          ▼
                   ┌───────────┐
                   │    DMN    │
                   └─────┬─────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
     ┌───────────┐ ┌───────────┐ ┌───────────┐
     │ Analytics │ │ Templates │ │   AI/ML   │
     └───────────┘ └───────────┘ └───────────┘
```

### 15.5 Требования к ресурсам

| Фаза | Backend | Frontend | DevOps | Всего |
|------|---------|----------|--------|-------|
| Фаза 1 | 80ч | 50ч | — | 130ч |
| Фаза 2 | 50ч | 30ч | — | 80ч |
| Фаза 3 | 60ч | 20ч | 10ч | 90ч |
| Фаза 4 | 40ч | 40ч | — | 80ч |
| Фаза 5 | 60ч | 30ч | 10ч | 100ч |
| **Итого** | **290ч** | **170ч** | **20ч** | **480ч** |

При 1 full-stack разработчике (~40ч/неделю): **~12 недель (3 месяца)**
При 2 разработчиках: **~6-7 недель**

---

## Заключение

Этот документ описывает полную архитектуру расширения BPMN-платформы. Ключевые принципы:

1. **Модульность** — каждый функционал независим
2. **Инкрементальность** — можно внедрять по частям
3. **Обратная совместимость** — новое не ломает старое
4. **Тестируемость** — каждый модуль покрыт тестами

Рекомендуемый порядок реализации:
1. **Триггеры** — базовая автоматизация
2. **Human Tasks** — основа для человеческих задач
3. **Кросс-workspace** — связи между системами
4. **SLA** — контроль сроков
5. **Остальное** — по приоритету бизнеса

---

**Документ создан:** Claude Code
**Версия:** 1.0
**Дата:** 2026-02-04
