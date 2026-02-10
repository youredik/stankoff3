import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../modules/user/user.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import { SlaDefinition } from '../modules/sla/entities/sla-definition.entity';
import type { SlaTargetType, EscalationRule } from '../modules/sla/entities/sla-definition.entity';
import { DecisionTable } from '../modules/dmn/entities/decision-table.entity';
import type { HitPolicy, InputColumn, OutputColumn, DecisionRule } from '../modules/dmn/entities/decision-table.entity';
import { SeedWorkspaces } from './seed-structure.service';
import { EMPLOYEES } from './data/employees';

// ──────────────────────────────────────────────────────
// SeedSlaDmnService
// ──────────────────────────────────────────────────────

@Injectable()
export class SeedSlaDmnService {
  private readonly logger = new Logger(SeedSlaDmnService.name);

  constructor(
    @InjectRepository(SlaDefinition)
    private readonly slaDefRepo: Repository<SlaDefinition>,
    @InjectRepository(DecisionTable)
    private readonly dmnRepo: Repository<DecisionTable>,
  ) {}

  /**
   * Создать SLA определения и DMN таблицы решений.
   */
  async createAll(ws: SeedWorkspaces, itWs: Workspace, users: User[]): Promise<void> {
    await this.createSlaDefinitions(ws, itWs, users);
    await this.createDmnTables(ws, users);
  }

  // ══════════════════════════════════════════════════════
  // SLA Definitions (6)
  // ══════════════════════════════════════════════════════

  private async createSlaDefinitions(
    ws: SeedWorkspaces,
    itWs: Workspace,
    users: User[],
  ): Promise<void> {
    const userByEmail = new Map<string, User>();
    for (const u of users) {
      userByEmail.set(u.email, u);
    }

    // Менеджеры для createdById
    const salesManager = userByEmail.get('grachev@stankoff.ru');
    const serviceManager = userByEmail.get('andrey@stankoff.ru');
    const financeManager = userByEmail.get('chulpan@stankoff.ru');
    const hrManager = userByEmail.get('anna.sidorova@stankoff.ru');
    const itAdmin = userByEmail.get('youredik@gmail.com');

    const slaDefinitions: Array<Partial<SlaDefinition>> = [
      // 1. Время первого ответа — Заявки клиентов (2 часа)
      {
        workspaceId: ws.zk.id,
        name: 'Время первого ответа',
        description: 'Первый ответ клиенту в течение 2 часов с момента создания заявки',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'any', status: 'new' },
        responseTime: 120,
        resolutionTime: null,
        warningThreshold: 75,
        businessHoursOnly: true,
        businessHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'Europe/Moscow',
          workdays: [1, 2, 3, 4, 5],
        },
        escalationRules: [
          { threshold: 80, action: 'notify', targets: ['assignee'] },
          { threshold: 100, action: 'escalate', targets: ['manager'] },
        ] as EscalationRule[],
        isActive: true,
        priority: 10,
        createdById: salesManager?.id ?? null,
      },

      // 2. Время решения — Сервисные заявки (24 часа)
      {
        workspaceId: ws.sz.id,
        name: 'Время решения сервисной заявки',
        description: 'Полное решение сервисной заявки в течение 24 часов',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'any' },
        responseTime: 60,
        resolutionTime: 1440,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours: {
          start: '08:00',
          end: '20:00',
          timezone: 'Europe/Moscow',
          workdays: [1, 2, 3, 4, 5, 6],
        },
        escalationRules: [
          { threshold: 80, action: 'notify', targets: ['assignee'] },
          { threshold: 100, action: 'escalate', targets: ['manager'] },
          { threshold: 150, action: 'escalate', targets: ['director'] },
        ] as EscalationRule[],
        isActive: true,
        priority: 20,
        createdById: serviceManager?.id ?? null,
      },

      // 3. Согласование финансовых документов (4 часа)
      {
        workspaceId: ws.fd.id,
        name: 'Согласование финансовых документов',
        description: 'Финансовый документ должен быть согласован в течение 4 рабочих часов',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { status: 'approval' },
        responseTime: null,
        resolutionTime: 240,
        warningThreshold: 75,
        businessHoursOnly: true,
        businessHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'Europe/Moscow',
          workdays: [1, 2, 3, 4, 5],
        },
        escalationRules: [
          { threshold: 80, action: 'notify', targets: ['assignee'] },
          { threshold: 100, action: 'escalate', targets: ['manager'] },
        ] as EscalationRule[],
        isActive: true,
        priority: 15,
        createdById: financeManager?.id ?? null,
      },

      // 4. Время ответа на рекламацию (8 часов)
      {
        workspaceId: ws.rek.id,
        name: 'Время ответа на рекламацию',
        description: 'Первичный ответ по рекламации в течение 8 рабочих часов',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'any' },
        responseTime: 480,
        resolutionTime: null,
        warningThreshold: 70,
        businessHoursOnly: true,
        businessHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'Europe/Moscow',
          workdays: [1, 2, 3, 4, 5],
        },
        escalationRules: [
          { threshold: 70, action: 'notify', targets: ['assignee'] },
          { threshold: 100, action: 'escalate', targets: ['manager'] },
          { threshold: 120, action: 'escalate', targets: ['director'] },
        ] as EscalationRule[],
        isActive: true,
        priority: 25,
        createdById: serviceManager?.id ?? null,
      },

      // 5. Закрытие HR заявки (2 дня)
      {
        workspaceId: ws.hr.id,
        name: 'Закрытие HR заявки',
        description: 'HR заявка (отпуск, больничный и т.д.) должна быть обработана в течение 2 рабочих дней',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'any' },
        responseTime: 240,
        resolutionTime: 2880,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'Europe/Moscow',
          workdays: [1, 2, 3, 4, 5],
        },
        escalationRules: [
          { threshold: 80, action: 'notify', targets: ['assignee'] },
          { threshold: 100, action: 'escalate', targets: ['manager'] },
        ] as EscalationRule[],
        isActive: true,
        priority: 5,
        createdById: hrManager?.id ?? null,
      },

      // 6. IT задачи — время реакции (3 дня)
      {
        workspaceId: itWs.id,
        name: 'IT задачи — время реакции',
        description: 'IT задачи должны быть взяты в работу в течение 3 рабочих дней',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'any' },
        responseTime: 480,
        resolutionTime: 4320,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours: {
          start: '09:00',
          end: '18:00',
          timezone: 'Europe/Moscow',
          workdays: [1, 2, 3, 4, 5],
        },
        escalationRules: [
          { threshold: 80, action: 'notify', targets: ['assignee'] },
          { threshold: 100, action: 'escalate', targets: ['manager'] },
        ] as EscalationRule[],
        isActive: true,
        priority: 5,
        createdById: itAdmin?.id ?? null,
      },
    ];

    await this.slaDefRepo.save(slaDefinitions);

    this.logger.log(`Создано ${slaDefinitions.length} SLA определений`);
  }

  // ══════════════════════════════════════════════════════
  // DMN Tables (3)
  // ══════════════════════════════════════════════════════

  private async createDmnTables(ws: SeedWorkspaces, users: User[]): Promise<void> {
    const userByEmail = new Map<string, User>();
    for (const u of users) {
      userByEmail.set(u.email, u);
    }

    const salesManager = userByEmail.get('grachev@stankoff.ru');
    const serviceManager = userByEmail.get('andrey@stankoff.ru');
    const financeManager = userByEmail.get('aleksei.matveev@stankoff.ru');

    // ─── 1. Классификация приоритета заявки (zk) ────────────────────────────

    const priorityInputs: InputColumn[] = [
      { id: 'amount', name: 'amount', label: 'Сумма заказа', type: 'number' },
      { id: 'equipment_type', name: 'equipment_type', label: 'Тип оборудования', type: 'string' },
    ];

    const priorityOutputs: OutputColumn[] = [
      { id: 'priority', name: 'priority', label: 'Приоритет', type: 'string' },
    ];

    const priorityRules: DecisionRule[] = [
      {
        id: 'pr-1',
        description: 'Заказы свыше 10 млн — критический приоритет',
        inputs: {
          amount: { operator: 'gt', value: 10000000 },
          equipment_type: { operator: 'any', value: '*' },
        },
        outputs: { priority: 'critical' },
        priority: 1,
      },
      {
        id: 'pr-2',
        description: 'Заказы свыше 5 млн — высокий приоритет',
        inputs: {
          amount: { operator: 'gt', value: 5000000 },
          equipment_type: { operator: 'any', value: '*' },
        },
        outputs: { priority: 'high' },
        priority: 2,
      },
      {
        id: 'pr-3',
        description: 'Лазерное оборудование свыше 1 млн — высокий приоритет',
        inputs: {
          amount: { operator: 'gt', value: 1000000 },
          equipment_type: { operator: 'contains', value: 'лазерный' },
        },
        outputs: { priority: 'high' },
        priority: 3,
      },
      {
        id: 'pr-4',
        description: 'Заказы свыше 1 млн — средний приоритет',
        inputs: {
          amount: { operator: 'gt', value: 1000000 },
          equipment_type: { operator: 'any', value: '*' },
        },
        outputs: { priority: 'medium' },
        priority: 4,
      },
      {
        id: 'pr-5',
        description: 'Все остальные — низкий приоритет',
        inputs: {
          amount: { operator: 'any', value: '*' },
          equipment_type: { operator: 'any', value: '*' },
        },
        outputs: { priority: 'low' },
        priority: 5,
      },
    ];

    await this.dmnRepo.save(
      this.dmnRepo.create({
        workspaceId: ws.zk.id,
        name: 'Классификация приоритета заявки',
        description: 'Автоматическое определение приоритета по сумме и типу оборудования',
        hitPolicy: 'FIRST' as HitPolicy,
        inputColumns: priorityInputs,
        outputColumns: priorityOutputs,
        rules: priorityRules,
        isActive: true,
        version: 1,
        createdById: salesManager?.id,
      }),
    );

    // ─── 2. Маршрутизация сервисных заявок (sz) ─────────────────────────────

    const routingInputs: InputColumn[] = [
      { id: 'severity', name: 'severity', label: 'Серьёзность', type: 'string' },
      { id: 'equipment_type', name: 'equipment_type', label: 'Тип оборудования', type: 'string' },
    ];

    const routingOutputs: OutputColumn[] = [
      { id: 'team', name: 'team', label: 'Команда', type: 'string' },
      { id: 'sla_hours', name: 'sla_hours', label: 'SLA (часы)', type: 'number' },
    ];

    const routingRules: DecisionRule[] = [
      {
        id: 'rt-1',
        description: 'Критические — специализированная бригада, 4 часа',
        inputs: {
          severity: { operator: 'eq', value: 'critical' },
          equipment_type: { operator: 'any', value: '*' },
        },
        outputs: { team: 'urgent', sla_hours: 4 },
        priority: 1,
      },
      {
        id: 'rt-2',
        description: 'Лазерное оборудование — лазерная бригада',
        inputs: {
          severity: { operator: 'any', value: '*' },
          equipment_type: { operator: 'contains', value: 'лазерный' },
        },
        outputs: { team: 'laser', sla_hours: 8 },
        priority: 2,
      },
      {
        id: 'rt-3',
        description: 'Фрезерное оборудование — фрезерная бригада',
        inputs: {
          severity: { operator: 'any', value: '*' },
          equipment_type: { operator: 'contains', value: 'фрезерный' },
        },
        outputs: { team: 'milling', sla_hours: 12 },
        priority: 3,
      },
      {
        id: 'rt-4',
        description: 'Остальное — общая бригада',
        inputs: {
          severity: { operator: 'any', value: '*' },
          equipment_type: { operator: 'any', value: '*' },
        },
        outputs: { team: 'general', sla_hours: 24 },
        priority: 4,
      },
    ];

    await this.dmnRepo.save(
      this.dmnRepo.create({
        workspaceId: ws.sz.id,
        name: 'Маршрутизация сервисных заявок',
        description: 'Определение бригады и SLA по серьёзности и типу оборудования',
        hitPolicy: 'FIRST' as HitPolicy,
        inputColumns: routingInputs,
        outputColumns: routingOutputs,
        rules: routingRules,
        isActive: true,
        version: 1,
        createdById: serviceManager?.id,
      }),
    );

    // ─── 3. Согласование расходов по сумме (sr) ─────────────────────────────

    const approvalInputs: InputColumn[] = [
      { id: 'amount', name: 'amount', label: 'Сумма расхода', type: 'number' },
      { id: 'category', name: 'category', label: 'Категория', type: 'string' },
    ];

    const approvalOutputs: OutputColumn[] = [
      { id: 'approval_level', name: 'approval_level', label: 'Уровень согласования', type: 'string' },
      { id: 'requires_director', name: 'requires_director', label: 'Нужен директор', type: 'boolean' },
    ];

    const approvalRules: DecisionRule[] = [
      {
        id: 'ap-1',
        description: 'Свыше 5 млн — директор обязательно',
        inputs: {
          amount: { operator: 'gt', value: 5000000 },
          category: { operator: 'any', value: '*' },
        },
        outputs: { approval_level: 'director', requires_director: true },
        priority: 1,
      },
      {
        id: 'ap-2',
        description: 'Свыше 1 млн — финансовый директор',
        inputs: {
          amount: { operator: 'gt', value: 1000000 },
          category: { operator: 'any', value: '*' },
        },
        outputs: { approval_level: 'cfo', requires_director: false },
        priority: 2,
      },
      {
        id: 'ap-3',
        description: 'Свыше 100К — руководитель отдела',
        inputs: {
          amount: { operator: 'gt', value: 100000 },
          category: { operator: 'any', value: '*' },
        },
        outputs: { approval_level: 'department_head', requires_director: false },
        priority: 3,
      },
      {
        id: 'ap-4',
        description: 'Оборудование — всегда руководитель отдела',
        inputs: {
          amount: { operator: 'any', value: '*' },
          category: { operator: 'eq', value: 'equipment' },
        },
        outputs: { approval_level: 'department_head', requires_director: false },
        priority: 4,
      },
      {
        id: 'ap-5',
        description: 'Мелкие расходы — автоматически',
        inputs: {
          amount: { operator: 'any', value: '*' },
          category: { operator: 'any', value: '*' },
        },
        outputs: { approval_level: 'auto', requires_director: false },
        priority: 5,
      },
    ];

    await this.dmnRepo.save(
      this.dmnRepo.create({
        workspaceId: ws.sr.id,
        name: 'Согласование расходов по сумме',
        description: 'Определение уровня согласования расходов в зависимости от суммы и категории',
        hitPolicy: 'FIRST' as HitPolicy,
        inputColumns: approvalInputs,
        outputColumns: approvalOutputs,
        rules: approvalRules,
        isActive: true,
        version: 1,
        createdById: financeManager?.id,
      }),
    );

    this.logger.log('Создано 3 DMN таблицы решений');
  }
}
