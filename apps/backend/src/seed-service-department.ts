import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { User, UserRole } from './modules/user/user.entity';
import { WorkspaceEntity } from './modules/entity/entity.entity';
import { Comment } from './modules/entity/comment.entity';
import { Workspace } from './modules/workspace/workspace.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from './modules/workspace/workspace-member.entity';
import { Section } from './modules/section/section.entity';
import { SectionMember } from './modules/section/section-member.entity';
import { SlaDefinition } from './modules/sla/entities/sla-definition.entity';
import type { SlaTargetType } from './modules/sla/entities/sla-definition.entity';
import { SlaInstance } from './modules/sla/entities/sla-instance.entity';
import type { SlaStatus } from './modules/sla/entities/sla-instance.entity';
import { SlaEvent } from './modules/sla/entities/sla-event.entity';
import { DecisionTable } from './modules/dmn/entities/decision-table.entity';
import type { HitPolicy } from './modules/dmn/entities/decision-table.entity';
import { ProcessDefinition } from './modules/bpmn/entities/process-definition.entity';
import { ProcessInstance, ProcessInstanceStatus } from './modules/bpmn/entities/process-instance.entity';
import { ProcessTrigger, TriggerType } from './modules/bpmn/entities/process-trigger.entity';
import { AutomationRule } from './modules/automation/automation-rule.entity';
import { UserGroup } from './modules/bpmn/entities/user-group.entity';

// ──────────────────────────────────────────────────────
// Helper: random item from array
// ──────────────────────────────────────────────────────
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function hoursAgo(hours: number): Date {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d;
}

@Injectable()
export class SeedServiceDepartment implements OnModuleInit {
  private readonly logger = new Logger(SeedServiceDepartment.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Workspace) private workspaceRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceEntity) private entityRepo: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMember) private memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Section) private sectionRepo: Repository<Section>,
    @InjectRepository(SectionMember) private sectionMemberRepo: Repository<SectionMember>,
    @InjectRepository(Comment) private commentRepo: Repository<Comment>,
    @InjectRepository(SlaDefinition) private slaDefRepo: Repository<SlaDefinition>,
    @InjectRepository(SlaInstance) private slaInstRepo: Repository<SlaInstance>,
    @InjectRepository(SlaEvent) private slaEventRepo: Repository<SlaEvent>,
    @InjectRepository(DecisionTable) private dmnTableRepo: Repository<DecisionTable>,
    @InjectRepository(ProcessDefinition) private processDefRepo: Repository<ProcessDefinition>,
    @InjectRepository(ProcessInstance) private processInstRepo: Repository<ProcessInstance>,
    @InjectRepository(ProcessTrigger) private triggerRepo: Repository<ProcessTrigger>,
    @InjectRepository(AutomationRule) private automationRepo: Repository<AutomationRule>,
    @InjectRepository(UserGroup) private userGroupRepo: Repository<UserGroup>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    // Проверяем маркер: если секция «Сервис» уже существует — пропускаем
    const existing = await this.sectionRepo.findOne({ where: { name: 'Сервис' } });
    if (existing) {
      this.logger.log('Service department seed already exists, skipping');
      return;
    }

    // Также проверяем: если нет ни одного пользователя — значит основной seed ещё не прошёл
    const userCount = await this.userRepo.count();
    if (userCount === 0) {
      this.logger.warn('No users found — waiting for base seed to run first');
      return;
    }

    this.logger.log('Seeding service department...');
    await this.seed();
    this.logger.log('Service department seed completed');
  }

  // ────────────────────────────────────────────────
  // MAIN SEED
  // ────────────────────────────────────────────────
  async seed() {
    const hashedPassword = await bcrypt.hash('password', 10);

    // Find existing admin
    const admin = await this.userRepo.findOne({ where: { email: 'admin@stankoff.ru' } });

    // ═══════════════════════════════════════
    // 1. USERS (12 people)
    // ═══════════════════════════════════════
    const users = await this.createUsers(hashedPassword);

    // ═══════════════════════════════════════
    // 2. SECTION «Сервис»
    // ═══════════════════════════════════════
    const section = await this.sectionRepo.save({
      name: 'Сервис',
      description: 'Технический сервис и работа с рекламациями',
      icon: '🛠️',
      order: 1,
    });

    // Участники секции
    await this.sectionMemberRepo.save([
      { sectionId: section.id, userId: users.kozlov.id, role: 'admin' as any },
      { sectionId: section.id, userId: users.volkova.id, role: 'admin' as any },
      { sectionId: section.id, userId: users.belov.id, role: 'admin' as any },
      { sectionId: section.id, userId: users.kuznetsova.id, role: 'admin' as any },
      ...(admin ? [{ sectionId: section.id, userId: admin.id, role: 'admin' as any }] : []),
    ]);

    // ═══════════════════════════════════════
    // 3. WORKSPACE «Техническая поддержка»
    // ═══════════════════════════════════════
    const tpWorkspace = await this.createTechSupportWorkspace(section.id);

    // ═══════════════════════════════════════
    // 4. WORKSPACE «Рекламации»
    // ═══════════════════════════════════════
    const rekWorkspace = await this.createClaimsWorkspace(section.id, tpWorkspace.id);

    // ═══════════════════════════════════════
    // 5. WORKSPACE MEMBERS
    // ═══════════════════════════════════════
    await this.createWorkspaceMembers(tpWorkspace, rekWorkspace, users, admin);

    // ═══════════════════════════════════════
    // 6. USER GROUPS
    // ═══════════════════════════════════════
    await this.createUserGroups(tpWorkspace, rekWorkspace, users);

    // ═══════════════════════════════════════
    // 7. SLA DEFINITIONS
    // ═══════════════════════════════════════
    const slaDefsTP = await this.createSlaDefinitionsTP(tpWorkspace, users.kozlov);
    const slaDefsREK = await this.createSlaDefinitionsREK(rekWorkspace, users.kozlov);

    // ═══════════════════════════════════════
    // 8. DMN TABLES
    // ═══════════════════════════════════════
    await this.createDmnTables(tpWorkspace, rekWorkspace, users.kozlov);

    // ═══════════════════════════════════════
    // 9. BPMN PROCESS DEFINITIONS
    // ═══════════════════════════════════════
    const processDefinitions = await this.createProcessDefinitions(
      tpWorkspace,
      rekWorkspace,
      users.kozlov,
    );

    // ═══════════════════════════════════════
    // 10. BPMN TRIGGERS
    // ═══════════════════════════════════════
    await this.createTriggers(tpWorkspace, rekWorkspace, processDefinitions, users.kozlov);

    // ═══════════════════════════════════════
    // 11. AUTOMATION RULES
    // ═══════════════════════════════════════
    await this.createAutomationRules(tpWorkspace, rekWorkspace, users.kozlov);

    // ═══════════════════════════════════════
    // 12. ENTITIES (tickets + claims)
    // ═══════════════════════════════════════
    const { tpEntities, rekEntities } = await this.createEntities(
      tpWorkspace,
      rekWorkspace,
      users,
    );

    // ═══════════════════════════════════════
    // 13. COMMENTS
    // ═══════════════════════════════════════
    await this.createComments(tpEntities, rekEntities, users);

    // ═══════════════════════════════════════
    // 14. SLA INSTANCES
    // ═══════════════════════════════════════
    await this.createSlaInstances(
      tpWorkspace,
      rekWorkspace,
      tpEntities,
      rekEntities,
      slaDefsTP,
      slaDefsREK,
    );

    // ═══════════════════════════════════════
    // 15. PROCESS INSTANCES
    // ═══════════════════════════════════════
    await this.createProcessInstances(
      tpWorkspace,
      rekWorkspace,
      tpEntities,
      rekEntities,
      processDefinitions,
      users,
    );

    this.logger.log('✅ Service department seed data created:');
    this.logger.log(`   - 12 users (service department)`);
    this.logger.log(`   - 1 section "Сервис"`);
    this.logger.log(`   - 2 workspaces (TP, REK)`);
    this.logger.log(`   - ${tpEntities.length} tech support tickets`);
    this.logger.log(`   - ${rekEntities.length} claims`);
  }

  // ────────────────────────────────────────────────
  // USERS
  // ────────────────────────────────────────────────
  private async createUsers(hashedPassword: string) {
    const userData = [
      { email: 'kozlov@stankoff.ru', firstName: 'Алексей', lastName: 'Козлов', role: UserRole.MANAGER, department: 'Сервис' },
      { email: 'volkova@stankoff.ru', firstName: 'Елена', lastName: 'Волкова', role: UserRole.MANAGER, department: 'Техподдержка' },
      { email: 'orlov@stankoff.ru', firstName: 'Дмитрий', lastName: 'Орлов', role: UserRole.EMPLOYEE, department: 'Техподдержка' },
      { email: 'morozova@stankoff.ru', firstName: 'Анна', lastName: 'Морозова', role: UserRole.EMPLOYEE, department: 'Техподдержка' },
      { email: 'novikov@stankoff.ru', firstName: 'Сергей', lastName: 'Новиков', role: UserRole.EMPLOYEE, department: 'Техподдержка' },
      { email: 'belov@stankoff.ru', firstName: 'Игорь', lastName: 'Белов', role: UserRole.MANAGER, department: 'Техподдержка' },
      { email: 'sokolova@stankoff.ru', firstName: 'Ольга', lastName: 'Соколова', role: UserRole.EMPLOYEE, department: 'Техподдержка' },
      { email: 'lebedev@stankoff.ru', firstName: 'Максим', lastName: 'Лебедев', role: UserRole.EMPLOYEE, department: 'Техподдержка' },
      { email: 'kuznetsova@stankoff.ru', firstName: 'Наталья', lastName: 'Кузнецова', role: UserRole.MANAGER, department: 'Рекламации' },
      { email: 'popov@stankoff.ru', firstName: 'Павел', lastName: 'Попов', role: UserRole.EMPLOYEE, department: 'Рекламации' },
      { email: 'smirnova@stankoff.ru', firstName: 'Татьяна', lastName: 'Смирнова', role: UserRole.EMPLOYEE, department: 'Рекламации' },
    ];

    const saved: User[] = [];
    for (const u of userData) {
      // Check if user already exists (e.g. from previous partial seed)
      let user = await this.userRepo.findOne({ where: { email: u.email } });
      if (!user) {
        user = await this.userRepo.save({ ...u, password: hashedPassword });
      }
      saved.push(user);
    }

    return {
      kozlov: saved[0],     // Директор по сервису
      volkova: saved[1],    // Рук. L1
      orlov: saved[2],      // Инженер L1
      morozova: saved[3],   // Инженер L1
      novikov: saved[4],    // Инженер L1
      belov: saved[5],      // Рук. L2
      sokolova: saved[6],   // Инженер L2 (оборудование)
      lebedev: saved[7],    // Инженер L2 (ПО)
      kuznetsova: saved[8], // Рук. рекламаций
      popov: saved[9],      // Спец. рекламации
      smirnova: saved[10],  // Спец. рекламации
    };
  }

  // ────────────────────────────────────────────────
  // TECH SUPPORT WORKSPACE
  // ────────────────────────────────────────────────
  private async createTechSupportWorkspace(sectionId: string): Promise<Workspace> {
    return this.workspaceRepo.save({
      name: 'Техническая поддержка',
      icon: '🔧',
      prefix: 'TP',
      lastEntityNumber: 1280,
      sectionId,
      orderInSection: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема заявки', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новая', color: '#3B82F6' },
                { id: 'classified', label: 'Классифицирована', color: '#06B6D4' },
                { id: 'assigned', label: 'Назначена', color: '#6366F1' },
                { id: 'in_progress', label: 'В работе', color: '#F59E0B' },
                { id: 'waiting_client', label: 'Ожидает клиента', color: '#F97316' },
                { id: 'waiting_vendor', label: 'Ожидает поставщика', color: '#EC4899' },
                { id: 'resolved', label: 'Решена', color: '#8B5CF6' },
                { id: 'closed', label: 'Закрыта', color: '#10B981' },
                { id: 'reopened', label: 'Переоткрыта', color: '#EF4444' },
              ],
            },
            {
              id: 'priority',
              name: 'Приоритет',
              type: 'select' as const,
              options: [
                { id: 'low', label: 'Низкий', color: '#10B981' },
                { id: 'medium', label: 'Средний', color: '#F59E0B' },
                { id: 'high', label: 'Высокий', color: '#F97316' },
                { id: 'critical', label: 'Критический', color: '#EF4444' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
            {
              id: 'category',
              name: 'Категория',
              type: 'select' as const,
              options: [
                { id: 'hardware', label: 'Оборудование', color: '#6366F1' },
                { id: 'software', label: 'ПО', color: '#3B82F6' },
                { id: 'network', label: 'Сеть', color: '#06B6D4' },
                { id: 'access', label: 'Доступы', color: '#8B5CF6' },
                { id: 'other', label: 'Прочее', color: '#6B7280' },
              ],
            },
          ],
        },
        {
          id: 'client',
          name: 'Данные клиента',
          order: 1,
          fields: [
            { id: 'client_name', name: 'Имя клиента', type: 'text' as const },
            { id: 'client_phone', name: 'Телефон', type: 'text' as const },
            { id: 'client_email', name: 'Email клиента', type: 'text' as const },
            { id: 'client_company', name: 'Компания', type: 'text' as const },
          ],
        },
        {
          id: 'technical',
          name: 'Техническая информация',
          order: 2,
          fields: [
            { id: 'description', name: 'Описание проблемы', type: 'textarea' as const },
            { id: 'affected_system', name: 'Затронутая система', type: 'text' as const },
            { id: 'error_code', name: 'Код ошибки', type: 'text' as const },
            { id: 'environment', name: 'Окружение', type: 'text' as const },
          ],
        },
        {
          id: 'resolution',
          name: 'Решение',
          order: 3,
          fields: [
            { id: 'resolution', name: 'Решение', type: 'textarea' as const },
            { id: 'root_cause', name: 'Причина', type: 'textarea' as const },
            {
              id: 'escalation_level',
              name: 'Уровень эскалации',
              type: 'select' as const,
              options: [
                { id: 'L1', label: 'L1', color: '#10B981' },
                { id: 'L2', label: 'L2', color: '#F59E0B' },
                { id: 'management', label: 'Руководство', color: '#EF4444' },
              ],
            },
          ],
        },
      ],
    });
  }

  // ────────────────────────────────────────────────
  // CLAIMS WORKSPACE
  // ────────────────────────────────────────────────
  private async createClaimsWorkspace(
    sectionId: string,
    tpWorkspaceId: string,
  ): Promise<Workspace> {
    return this.workspaceRepo.save({
      name: 'Рекламации',
      icon: '⚠️',
      prefix: 'REK',
      lastEntityNumber: 460,
      sectionId,
      orderInSection: 1,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Название рекламации', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'received', label: 'Получена', color: '#3B82F6' },
                { id: 'registered', label: 'Зарегистрирована', color: '#06B6D4' },
                { id: 'investigation', label: 'Расследование', color: '#F59E0B' },
                { id: 'root_cause_analysis', label: 'Анализ причин', color: '#F97316' },
                { id: 'decision', label: 'Решение', color: '#8B5CF6' },
                { id: 'corrective_actions', label: 'Корректирующие действия', color: '#6366F1' },
                { id: 'client_notification', label: 'Уведомление клиента', color: '#EC4899' },
                { id: 'closed', label: 'Закрыта', color: '#10B981' },
                { id: 'rejected', label: 'Отклонена', color: '#6B7280' },
              ],
            },
            {
              id: 'severity',
              name: 'Серьёзность',
              type: 'select' as const,
              options: [
                { id: 'minor', label: 'Незначительная', color: '#10B981' },
                { id: 'major', label: 'Значительная', color: '#F59E0B' },
                { id: 'critical', label: 'Критическая', color: '#EF4444' },
              ],
            },
            { id: 'responsible', name: 'Ответственный', type: 'user' as const },
          ],
        },
        {
          id: 'client',
          name: 'Данные клиента',
          order: 1,
          fields: [
            { id: 'client_name', name: 'Имя клиента', type: 'text' as const, required: true },
            { id: 'client_phone', name: 'Телефон', type: 'text' as const },
            { id: 'client_email', name: 'Email', type: 'text' as const },
            { id: 'client_company', name: 'Компания', type: 'text' as const },
            { id: 'order_number', name: 'Номер заказа', type: 'text' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали рекламации',
          order: 2,
          fields: [
            {
              id: 'claim_type',
              name: 'Тип рекламации',
              type: 'select' as const,
              options: [
                { id: 'quality', label: 'Качество', color: '#EF4444' },
                { id: 'delivery', label: 'Доставка', color: '#F97316' },
                { id: 'service', label: 'Обслуживание', color: '#F59E0B' },
                { id: 'billing', label: 'Счёт/Оплата', color: '#6366F1' },
              ],
            },
            { id: 'defect_description', name: 'Описание дефекта', type: 'textarea' as const },
            { id: 'evidence', name: 'Доказательства', type: 'textarea' as const },
          ],
        },
        {
          id: 'resolution',
          name: 'Решение',
          order: 3,
          fields: [
            {
              id: 'decision_type',
              name: 'Тип решения',
              type: 'select' as const,
              options: [
                { id: 'refund', label: 'Возврат средств', color: '#10B981' },
                { id: 'replacement', label: 'Замена', color: '#3B82F6' },
                { id: 'repair', label: 'Ремонт', color: '#F59E0B' },
                { id: 'reject', label: 'Отклонить', color: '#EF4444' },
              ],
            },
            { id: 'corrective_action', name: 'Корректирующее действие', type: 'textarea' as const },
            { id: 'preventive_action', name: 'Превентивное действие', type: 'textarea' as const },
            { id: 'compensation_amount', name: 'Сумма компенсации', type: 'number' as const },
          ],
        },
        {
          id: 'relations',
          name: 'Связи',
          order: 4,
          fields: [
            {
              id: 'related_ticket',
              name: 'Связанная заявка ТП',
              type: 'relation' as const,
              relatedWorkspaceId: tpWorkspaceId,
            },
          ],
        },
      ],
    });
  }

  // ────────────────────────────────────────────────
  // WORKSPACE MEMBERS
  // ────────────────────────────────────────────────
  private async createWorkspaceMembers(
    tp: Workspace,
    rek: Workspace,
    users: Record<string, User>,
    admin: User | null,
  ) {
    const members = [
      // TP — все сотрудники ТП
      { workspaceId: tp.id, userId: users.kozlov.id, role: WorkspaceRole.ADMIN },
      { workspaceId: tp.id, userId: users.volkova.id, role: WorkspaceRole.ADMIN },
      { workspaceId: tp.id, userId: users.orlov.id, role: WorkspaceRole.EDITOR },
      { workspaceId: tp.id, userId: users.morozova.id, role: WorkspaceRole.EDITOR },
      { workspaceId: tp.id, userId: users.novikov.id, role: WorkspaceRole.EDITOR },
      { workspaceId: tp.id, userId: users.belov.id, role: WorkspaceRole.ADMIN },
      { workspaceId: tp.id, userId: users.sokolova.id, role: WorkspaceRole.EDITOR },
      { workspaceId: tp.id, userId: users.lebedev.id, role: WorkspaceRole.EDITOR },
      // TP — рекламации видят заявки ТП
      { workspaceId: tp.id, userId: users.kuznetsova.id, role: WorkspaceRole.VIEWER },
      // REK — сотрудники рекламаций
      { workspaceId: rek.id, userId: users.kozlov.id, role: WorkspaceRole.ADMIN },
      { workspaceId: rek.id, userId: users.kuznetsova.id, role: WorkspaceRole.ADMIN },
      { workspaceId: rek.id, userId: users.popov.id, role: WorkspaceRole.EDITOR },
      { workspaceId: rek.id, userId: users.smirnova.id, role: WorkspaceRole.EDITOR },
      // REK — L2 руководитель видит рекламации
      { workspaceId: rek.id, userId: users.belov.id, role: WorkspaceRole.VIEWER },
    ];

    if (admin) {
      members.push(
        { workspaceId: tp.id, userId: admin.id, role: WorkspaceRole.ADMIN },
        { workspaceId: rek.id, userId: admin.id, role: WorkspaceRole.ADMIN },
      );
    }

    await this.memberRepo.save(members);
  }

  // ────────────────────────────────────────────────
  // USER GROUPS (for BPMN candidate groups)
  // ────────────────────────────────────────────────
  private async createUserGroups(
    tp: Workspace,
    rek: Workspace,
    users: Record<string, User>,
  ) {
    const l1Group = this.userGroupRepo.create({
      workspaceId: tp.id,
      name: 'Поддержка L1',
      key: 'l1-support',
      description: 'Инженеры первой линии поддержки',
    });
    const savedL1 = await this.userGroupRepo.save(l1Group);
    savedL1.members = [users.orlov, users.morozova, users.novikov];
    await this.userGroupRepo.save(savedL1);

    const l2HwGroup = this.userGroupRepo.create({
      workspaceId: tp.id,
      name: 'Поддержка L2 (оборудование)',
      key: 'l2-hardware',
      description: 'Инженеры второй линии — оборудование',
    });
    const savedL2Hw = await this.userGroupRepo.save(l2HwGroup);
    savedL2Hw.members = [users.sokolova];
    await this.userGroupRepo.save(savedL2Hw);

    const l2SwGroup = this.userGroupRepo.create({
      workspaceId: tp.id,
      name: 'Поддержка L2 (ПО)',
      key: 'l2-software',
      description: 'Инженеры второй линии — программное обеспечение',
    });
    const savedL2Sw = await this.userGroupRepo.save(l2SwGroup);
    savedL2Sw.members = [users.lebedev];
    await this.userGroupRepo.save(savedL2Sw);

    const mgmtGroup = this.userGroupRepo.create({
      workspaceId: tp.id,
      name: 'Руководство сервиса',
      key: 'management',
      description: 'Руководители сервисного подразделения',
    });
    const savedMgmt = await this.userGroupRepo.save(mgmtGroup);
    savedMgmt.members = [users.kozlov, users.volkova, users.belov];
    await this.userGroupRepo.save(savedMgmt);

    const claimsGroup = this.userGroupRepo.create({
      workspaceId: rek.id,
      name: 'Отдел рекламаций',
      key: 'claims-team',
      description: 'Специалисты по рекламациям',
    });
    const savedClaims = await this.userGroupRepo.save(claimsGroup);
    savedClaims.members = [users.kuznetsova, users.popov, users.smirnova];
    await this.userGroupRepo.save(savedClaims);
  }

  // ────────────────────────────────────────────────
  // SLA DEFINITIONS — ТП
  // ────────────────────────────────────────────────
  private async createSlaDefinitionsTP(tp: Workspace, creator: User) {
    const businessHours = {
      start: '09:00',
      end: '18:00',
      timezone: 'Europe/Moscow',
      workdays: [1, 2, 3, 4, 5],
    };

    const escalationRules = [
      { threshold: 80, action: 'notify' as const, targets: ['assignee'] },
      { threshold: 100, action: 'escalate' as const, targets: ['manager'] },
      { threshold: 150, action: 'escalate' as const, targets: ['director'] },
    ];

    const defs = await this.slaDefRepo.save([
      {
        workspaceId: tp.id,
        name: 'SLA Критический',
        description: 'Критические заявки: 15 мин ответ, 4 часа решение',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'critical' },
        responseTime: 15,
        resolutionTime: 240,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours,
        escalationRules,
        isActive: true,
        priority: 4,
        createdById: creator.id,
      },
      {
        workspaceId: tp.id,
        name: 'SLA Высокий',
        description: 'Высокий приоритет: 1 час ответ, 8 часов решение',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'high' },
        responseTime: 60,
        resolutionTime: 480,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours,
        escalationRules,
        isActive: true,
        priority: 3,
        createdById: creator.id,
      },
      {
        workspaceId: tp.id,
        name: 'SLA Средний',
        description: 'Средний приоритет: 4 часа ответ, 24 часа решение',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'medium' },
        responseTime: 240,
        resolutionTime: 1440,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours,
        escalationRules,
        isActive: true,
        priority: 2,
        createdById: creator.id,
      },
      {
        workspaceId: tp.id,
        name: 'SLA Низкий',
        description: 'Низкий приоритет: 8 часов ответ, 72 часа решение',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'low' },
        responseTime: 480,
        resolutionTime: 4320,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours,
        escalationRules,
        isActive: true,
        priority: 1,
        createdById: creator.id,
      },
    ]);

    return defs;
  }

  // ────────────────────────────────────────────────
  // SLA DEFINITIONS — Рекламации
  // ────────────────────────────────────────────────
  private async createSlaDefinitionsREK(rek: Workspace, creator: User) {
    const businessHours = {
      start: '09:00',
      end: '18:00',
      timezone: 'Europe/Moscow',
      workdays: [1, 2, 3, 4, 5],
    };

    const escalationRules = [
      { threshold: 80, action: 'notify' as const, targets: ['assignee'] },
      { threshold: 100, action: 'escalate' as const, targets: ['manager'] },
      { threshold: 150, action: 'escalate' as const, targets: ['director'] },
    ];

    const defs = await this.slaDefRepo.save([
      {
        workspaceId: rek.id,
        name: 'SLA Критическая рекламация',
        description: 'Критические: 1 час ответ, 3 дня решение',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'critical' },
        responseTime: 60,
        resolutionTime: 4320,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours,
        escalationRules,
        isActive: true,
        priority: 3,
        createdById: creator.id,
      },
      {
        workspaceId: rek.id,
        name: 'SLA Значительная рекламация',
        description: 'Значительные: 4 часа ответ, 7 дней решение',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'major' },
        responseTime: 240,
        resolutionTime: 10080,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours,
        escalationRules,
        isActive: true,
        priority: 2,
        createdById: creator.id,
      },
      {
        workspaceId: rek.id,
        name: 'SLA Незначительная рекламация',
        description: 'Незначительные: 24 часа ответ, 14 дней решение',
        appliesTo: 'entity' as SlaTargetType,
        conditions: { priority: 'minor' },
        responseTime: 1440,
        resolutionTime: 20160,
        warningThreshold: 80,
        businessHoursOnly: true,
        businessHours,
        escalationRules,
        isActive: true,
        priority: 1,
        createdById: creator.id,
      },
    ]);

    return defs;
  }

  // ────────────────────────────────────────────────
  // DMN TABLES
  // ────────────────────────────────────────────────
  private async createDmnTables(tp: Workspace, rek: Workspace, creator: User) {
    // 1. Support Routing
    await this.dmnTableRepo.save({
      workspaceId: tp.id,
      name: 'Маршрутизация техподдержки',
      description: 'Определяет уровень поддержки и группу по приоритету и категории',
      hitPolicy: 'FIRST' as HitPolicy,
      inputColumns: [
        { id: 'priority', name: 'priority', label: 'Приоритет', type: 'string' as const },
        { id: 'category', name: 'category', label: 'Категория', type: 'string' as const },
      ],
      outputColumns: [
        { id: 'level', name: 'level', label: 'Уровень', type: 'string' as const, defaultValue: 'L1' },
        { id: 'group', name: 'group', label: 'Группа', type: 'string' as const, defaultValue: 'l1-support' },
      ],
      rules: [
        { id: 'r1', description: 'Критические → руководство', inputs: { priority: { operator: 'eq' as const, value: 'critical' } }, outputs: { level: 'L2', group: 'management' }, priority: 1 },
        { id: 'r2', description: 'Высокий + оборудование → L2 HW', inputs: { priority: { operator: 'eq' as const, value: 'high' }, category: { operator: 'eq' as const, value: 'hardware' } }, outputs: { level: 'L2', group: 'l2-hardware' }, priority: 2 },
        { id: 'r3', description: 'Высокий + ПО → L2 SW', inputs: { priority: { operator: 'eq' as const, value: 'high' }, category: { operator: 'eq' as const, value: 'software' } }, outputs: { level: 'L2', group: 'l2-software' }, priority: 3 },
        { id: 'r4', description: 'Сеть → L2 HW', inputs: { category: { operator: 'eq' as const, value: 'network' } }, outputs: { level: 'L2', group: 'l2-hardware' }, priority: 4 },
        { id: 'r5', description: 'Оборудование → L1', inputs: { category: { operator: 'eq' as const, value: 'hardware' } }, outputs: { level: 'L1', group: 'l1-support' }, priority: 5 },
        { id: 'r6', description: 'ПО → L1', inputs: { category: { operator: 'eq' as const, value: 'software' } }, outputs: { level: 'L1', group: 'l1-support' }, priority: 6 },
        { id: 'r7', description: 'Доступы → L1', inputs: { category: { operator: 'eq' as const, value: 'access' } }, outputs: { level: 'L1', group: 'l1-support' }, priority: 7 },
        { id: 'r8', description: 'По умолчанию → L1', inputs: {}, outputs: { level: 'L1', group: 'l1-support' }, priority: 8 },
      ],
      isActive: true,
      createdById: creator.id,
    });

    // 2. Claims Severity Assessment
    await this.dmnTableRepo.save({
      workspaceId: rek.id,
      name: 'Оценка серьёзности рекламации',
      description: 'Определяет серьёзность и необходимость автоэскалации',
      hitPolicy: 'FIRST' as HitPolicy,
      inputColumns: [
        { id: 'claim_type', name: 'claim_type', label: 'Тип рекламации', type: 'string' as const },
        { id: 'compensation_amount', name: 'compensation_amount', label: 'Сумма компенсации', type: 'number' as const },
      ],
      outputColumns: [
        { id: 'severity', name: 'severity', label: 'Серьёзность', type: 'string' as const, defaultValue: 'minor' },
        { id: 'auto_escalate', name: 'auto_escalate', label: 'Автоэскалация', type: 'boolean' as const, defaultValue: false },
      ],
      rules: [
        { id: 'r1', description: 'Качество + крупная сумма → критическая', inputs: { claim_type: { operator: 'eq' as const, value: 'quality' }, compensation_amount: { operator: 'gte' as const, value: 100000 } }, outputs: { severity: 'critical', auto_escalate: true }, priority: 1 },
        { id: 'r2', description: 'Качество → значительная', inputs: { claim_type: { operator: 'eq' as const, value: 'quality' } }, outputs: { severity: 'major', auto_escalate: false }, priority: 2 },
        { id: 'r3', description: 'Обслуживание → значительная', inputs: { claim_type: { operator: 'eq' as const, value: 'service' } }, outputs: { severity: 'major', auto_escalate: false }, priority: 3 },
        { id: 'r4', description: 'Доставка → незначительная', inputs: { claim_type: { operator: 'eq' as const, value: 'delivery' } }, outputs: { severity: 'minor', auto_escalate: false }, priority: 4 },
        { id: 'r5', description: 'Счёт → незначительная', inputs: { claim_type: { operator: 'eq' as const, value: 'billing' } }, outputs: { severity: 'minor', auto_escalate: false }, priority: 5 },
      ],
      isActive: true,
      createdById: creator.id,
    });
  }

  // ────────────────────────────────────────────────
  // BPMN PROCESS DEFINITIONS
  // ────────────────────────────────────────────────
  private async createProcessDefinitions(
    tp: Workspace,
    rek: Workspace,
    creator: User,
  ) {
    const templatesDir = path.join(__dirname, 'modules', 'bpmn', 'templates');

    const readBpmn = (filename: string): string => {
      try {
        return fs.readFileSync(path.join(templatesDir, filename), 'utf-8');
      } catch {
        this.logger.warn(`BPMN template ${filename} not found, using placeholder`);
        return `<!-- ${filename} not found -->`;
      }
    };

    const supportV2Xml = readBpmn('service-support-v2.bpmn');
    const claimsMgmtXml = readBpmn('claims-management.bpmn');
    const slaEscXml = readBpmn('sla-escalation.bpmn');

    const defs = await this.processDefRepo.save([
      {
        workspaceId: tp.id,
        name: 'Техподдержка (полный цикл)',
        description: 'ITIL-совместимый процесс: AI-классификация, маршрутизация L1/L2, эскалация, ожидание клиента, автозакрытие',
        processId: 'service-support-v2',
        bpmnXml: supportV2Xml,
        version: 1,
        isActive: true,
        isDefault: true,
        createdById: creator.id,
      },
      {
        workspaceId: rek.id,
        name: 'Управление рекламациями (ISO 10002)',
        description: 'Полный цикл рекламации: регистрация, расследование, RCA, решение, корректирующие действия',
        processId: 'claims-management',
        bpmnXml: claimsMgmtXml,
        version: 1,
        isActive: true,
        isDefault: true,
        createdById: creator.id,
      },
      {
        workspaceId: tp.id,
        name: 'Автоэскалация по SLA',
        description: 'Автоматическая эскалация при нарушении SLA: 80%, 100%, 150%',
        processId: 'sla-escalation',
        bpmnXml: slaEscXml,
        version: 1,
        isActive: true,
        isDefault: false,
        createdById: creator.id,
      },
    ]);

    return {
      supportV2: defs[0],
      claimsManagement: defs[1],
      slaEscalation: defs[2],
    };
  }

  // ────────────────────────────────────────────────
  // BPMN TRIGGERS
  // ────────────────────────────────────────────────
  private async createTriggers(
    tp: Workspace,
    rek: Workspace,
    processDefs: { supportV2: ProcessDefinition; claimsManagement: ProcessDefinition; slaEscalation: ProcessDefinition },
    creator: User,
  ) {
    await this.triggerRepo.save([
      {
        processDefinitionId: processDefs.supportV2.id,
        workspaceId: tp.id,
        name: 'Автозапуск процесса ТП',
        description: 'При создании заявки автоматически запускается BPMN процесс техподдержки',
        triggerType: TriggerType.ENTITY_CREATED,
        conditions: {},
        variableMappings: {
          entityId: '$.entity.id',
          workspaceId: '$.entity.workspaceId',
          title: '$.entity.title',
          priority: '$.entity.priority',
          category: '$.entity.data.category',
          assigneeId: '$.entity.assigneeId',
        },
        isActive: true,
        createdById: creator.id,
      },
      {
        processDefinitionId: processDefs.claimsManagement.id,
        workspaceId: rek.id,
        name: 'Автозапуск процесса рекламации',
        description: 'При создании рекламации автоматически запускается BPMN процесс',
        triggerType: TriggerType.ENTITY_CREATED,
        conditions: {},
        variableMappings: {
          entityId: '$.entity.id',
          workspaceId: '$.entity.workspaceId',
          title: '$.entity.title',
          severity: '$.entity.data.severity',
          claimType: '$.entity.data.claim_type',
          clientName: '$.entity.data.client_name',
        },
        isActive: true,
        createdById: creator.id,
      },
    ]);
  }

  // ────────────────────────────────────────────────
  // AUTOMATION RULES
  // ────────────────────────────────────────────────
  private async createAutomationRules(
    tp: Workspace,
    rek: Workspace,
    creator: User,
  ) {
    await this.automationRepo.save([
      {
        name: 'Уведомление при критическом приоритете',
        description: 'При создании заявки с приоритетом "Критический" уведомить руководителя',
        workspaceId: tp.id,
        trigger: 'on_create' as any,
        conditions: [
          { field: 'priority', operator: 'equals' as any, value: 'critical' },
        ],
        actions: [
          {
            type: 'send_notification' as any,
            config: {
              recipientMode: 'all_workspace_members',
              message: '🚨 Создана критическая заявка! Требуется немедленная реакция.',
            },
          },
        ],
        isActive: true,
        priority: 1,
        createdById: creator.id,
      },
      {
        name: 'Автоклассификация по DMN',
        description: 'При создании заявки запускается DMN-маршрутизация',
        workspaceId: tp.id,
        trigger: 'on_create' as any,
        conditions: [],
        actions: [
          {
            type: 'evaluate_dmn' as any,
            config: {
              inputMapping: { priority: 'priority', category: 'data.category' },
              outputMapping: { level: 'data.escalation_level', group: 'data.assigned_group' },
              applyOutputToEntity: true,
            },
          },
        ],
        isActive: true,
        priority: 0,
        createdById: creator.id,
      },
    ]);
  }

  // ────────────────────────────────────────────────
  // ENTITIES (tickets + claims)
  // ────────────────────────────────────────────────
  private async createEntities(
    tp: Workspace,
    rek: Workspace,
    users: Record<string, User>,
  ) {
    // ─── Tech Support Tickets (32 штуки) ───
    const tpData: Partial<WorkspaceEntity>[] = [
      // 5 новых
      { customId: 'TP-1249', title: 'Не включается станок ЧПУ Haas VF-2', status: 'new', priority: 'critical', data: { category: 'hardware', client_name: 'ООО "МеталлПром"', client_phone: '+7 (495) 111-22-33', client_company: 'ООО "МеталлПром"', description: 'Станок не реагирует на кнопку включения. Индикатор питания не горит.', affected_system: 'Haas VF-2 S/N: HV2-12345' }, createdAt: hoursAgo(2) },
      { customId: 'TP-1250', title: 'Ошибка P0234 на токарном станке Mazak', status: 'new', priority: 'high', data: { category: 'hardware', client_name: 'АО "ТочноСтрой"', client_phone: '+7 (495) 222-33-44', client_company: 'АО "ТочноСтрой"', description: 'При запуске программы появляется ошибка P0234. Станок останавливается.', error_code: 'P0234', affected_system: 'Mazak QTN-200' }, createdAt: hoursAgo(5) },
      { customId: 'TP-1251', title: 'Настройка VPN для удалённого мониторинга', status: 'new', priority: 'medium', data: { category: 'network', client_name: 'Сергей Петров', client_email: 'petrov@tochnobuild.ru', client_company: 'АО "ТочноСтрой"', description: 'Нужен VPN-доступ для удалённого мониторинга оборудования' }, createdAt: hoursAgo(8) },
      { customId: 'TP-1252', title: 'Запрос доступа к документации Siemens', status: 'new', priority: 'low', data: { category: 'access', client_name: 'Иван Смирнов', client_email: 'smirnov@metalcom.ru', client_company: 'ЗАО "МеталлКом"', description: 'Нужен доступ к базе документации Siemens SINUMERIK' }, createdAt: hoursAgo(12) },
      { customId: 'TP-1253', title: 'Обновление прошивки контроллера Fanuc', status: 'new', priority: 'medium', data: { category: 'software', client_name: 'Дмитрий Козлов', client_phone: '+7 (916) 555-66-77', client_company: 'ИП Козлов', description: 'Нужно обновить прошивку до версии 3.2.1' }, createdAt: hoursAgo(1) },

      // 3 классифицированных
      { customId: 'TP-1254', title: 'Перегрев шпинделя на станке DMG', status: 'classified', priority: 'high', assigneeId: null, data: { category: 'hardware', client_name: 'ПАО "Станкомаш"', client_phone: '+7 (495) 333-44-55', description: 'Температура шпинделя превышает 80°C при работе на средних оборотах', escalation_level: 'L2', affected_system: 'DMG MORI NLX 2500' }, createdAt: hoursAgo(16) },
      { customId: 'TP-1255', title: 'Ошибка связи ПЛК — HMI', status: 'classified', priority: 'medium', assigneeId: null, data: { category: 'software', client_name: 'ООО "ТехноРесурс"', description: 'Панель HMI не получает данные от ПЛК. Связь по Profinet.', error_code: 'COMM_FAULT_01', escalation_level: 'L1' }, createdAt: hoursAgo(20) },
      { customId: 'TP-1256', title: 'Калибровка измерительной системы Renishaw', status: 'classified', priority: 'low', assigneeId: null, data: { category: 'hardware', client_name: 'АО "Прецизион"', description: 'Плановая калибровка системы Renishaw RMP600', escalation_level: 'L1' }, createdAt: daysAgo(1) },

      // 5 в работе
      { customId: 'TP-1257', title: 'Замена серводвигателя оси Y', status: 'in_progress', priority: 'high', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'ООО "ПромТех"', client_phone: '+7 (495) 444-55-66', description: 'Серводвигатель оси Y издаёт посторонний шум. Требуется замена.', affected_system: 'Okuma MA-600HII', escalation_level: 'L2' }, createdAt: daysAgo(2), firstResponseAt: daysAgo(2) },
      { customId: 'TP-1258', title: 'Настройка системы охлаждения', status: 'in_progress', priority: 'medium', assigneeId: users.orlov.id, data: { category: 'hardware', client_name: 'АО "МашСтрой"', description: 'Система охлаждения шпинделя не поддерживает стабильную температуру', escalation_level: 'L1' }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'TP-1259', title: 'Установка ПО CAM на рабочие станции', status: 'in_progress', priority: 'medium', assigneeId: users.lebedev.id, data: { category: 'software', client_name: 'ООО "КадСтрой"', description: 'Установить и настроить Mastercam 2024 на 5 рабочих станций', escalation_level: 'L2' }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'TP-1260', title: 'Диагностика электрошкафа', status: 'in_progress', priority: 'high', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'ЗАО "ЭнергоМаш"', client_phone: '+7 (495) 666-77-88', description: 'Периодические сбои электропитания станка. Предположительно проблема в электрошкафу.', escalation_level: 'L2' }, createdAt: daysAgo(1), firstResponseAt: hoursAgo(20) },
      { customId: 'TP-1261', title: 'Обновление параметров ЧПУ после модернизации', status: 'in_progress', priority: 'low', assigneeId: users.novikov.id, data: { category: 'software', client_name: 'ООО "НовоТех"', description: 'После замены шпинделя нужно обновить параметры в системе ЧПУ', escalation_level: 'L1' }, createdAt: daysAgo(4), firstResponseAt: daysAgo(3) },

      // 3 ожидает клиента
      { customId: 'TP-1262', title: 'Запрос серийного номера для гарантии', status: 'waiting_client', priority: 'medium', assigneeId: users.morozova.id, data: { category: 'hardware', client_name: 'ООО "МетТехно"', client_email: 'support@mettechno.ru', description: 'Для обработки гарантийной заявки нужен серийный номер блока управления' }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'TP-1263', title: 'Уточнение конфигурации сети', status: 'waiting_client', priority: 'low', assigneeId: users.orlov.id, data: { category: 'network', client_name: 'АО "СтанкоИмпорт"', description: 'Ждём от клиента схему сетевой инфраструктуры для настройки удалённого доступа' }, createdAt: daysAgo(5), firstResponseAt: daysAgo(4) },
      { customId: 'TP-1264', title: 'Ожидание лог-файлов для анализа', status: 'waiting_client', priority: 'high', assigneeId: users.lebedev.id, data: { category: 'software', client_name: 'ПАО "ТехноКласс"', client_phone: '+7 (495) 777-88-99', description: 'Запросили у клиента лог-файлы системы ЧПУ для анализа ошибки' }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },

      // 2 ожидает поставщика
      { customId: 'TP-1265', title: 'Ожидание запчастей от Siemens', status: 'waiting_vendor', priority: 'high', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'ООО "ПромРесурс"', description: 'Заказан блок питания Siemens 6SL3210. Срок поставки: 2-3 недели.', affected_system: 'Siemens SINUMERIK 840D' }, createdAt: daysAgo(7), firstResponseAt: daysAgo(6) },
      { customId: 'TP-1266', title: 'Замена подшипника шпинделя (заказ у Okuma)', status: 'waiting_vendor', priority: 'medium', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'АО "ТочноМаш"', description: 'Подшипник шпинделя заказан у поставщика Okuma Japan. ETA: 3 недели.' }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9) },

      // 4 решённых
      { customId: 'TP-1267', title: 'Восстановление бэкапа параметров ЧПУ', status: 'resolved', priority: 'high', assigneeId: users.lebedev.id, data: { category: 'software', client_name: 'ООО "Ресурс-М"', description: 'После сбоя питания потеряны параметры ЧПУ', resolution: 'Восстановлены параметры из последнего бэкапа. Проверена работоспособность.' }, createdAt: daysAgo(5), firstResponseAt: daysAgo(5), resolvedAt: daysAgo(1) },
      { customId: 'TP-1268', title: 'Устранение вибрации шпинделя', status: 'resolved', priority: 'medium', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'АО "МашЭкспорт"', description: 'Повышенная вибрация при высоких оборотах', resolution: 'Заменены подшипники, выполнена балансировка. Вибрация в норме.' }, createdAt: daysAgo(8), firstResponseAt: daysAgo(7), resolvedAt: daysAgo(2) },
      { customId: 'TP-1269', title: 'Настройка VPN-туннеля для удалённого сервиса', status: 'resolved', priority: 'low', assigneeId: users.novikov.id, data: { category: 'network', client_name: 'ООО "ИнтерСтанок"', description: 'Настроить VPN для удалённой диагностики оборудования', resolution: 'Настроен IPSec VPN. Выдан сертификат доступа клиенту.' }, createdAt: daysAgo(6), firstResponseAt: daysAgo(5), resolvedAt: daysAgo(3) },
      { customId: 'TP-1270', title: 'Обновление ПО Heidenhain TNC 640', status: 'resolved', priority: 'medium', assigneeId: users.lebedev.id, data: { category: 'software', client_name: 'ЗАО "ПромДеталь"', description: 'Обновить до версии 340594-09', resolution: 'Обновление выполнено. Протестированы все циклы обработки.' }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9), resolvedAt: daysAgo(4) },

      // 6 закрытых
      { customId: 'TP-1271', title: 'Замена датчика позиции стола', status: 'closed', priority: 'high', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'ООО "АвтоДеталь"', resolution: 'Заменён датчик позиции. Калибровка выполнена.', root_cause: 'Износ датчика' }, createdAt: daysAgo(15), resolvedAt: daysAgo(10) },
      { customId: 'TP-1272', title: 'Конфигурация нового контроллера Fanuc', status: 'closed', priority: 'medium', assigneeId: users.lebedev.id, data: { category: 'software', client_name: 'АО "СтанкоГрупп"', resolution: 'Контроллер настроен, параметры загружены из шаблона.', root_cause: 'Первичная настройка' }, createdAt: daysAgo(20), resolvedAt: daysAgo(14) },
      { customId: 'TP-1273', title: 'Установка дополнительного модуля I/O', status: 'closed', priority: 'low', assigneeId: users.novikov.id, data: { category: 'hardware', client_name: 'ИП Иванов', resolution: 'Модуль установлен и протестирован.', root_cause: 'Расширение функционала' }, createdAt: daysAgo(25), resolvedAt: daysAgo(18) },
      { customId: 'TP-1274', title: 'Перенос лицензии ПО на новый сервер', status: 'closed', priority: 'medium', assigneeId: users.lebedev.id, data: { category: 'software', client_name: 'ООО "ПромСервис"', resolution: 'Лицензия перенесена. Активация подтверждена вендором.' }, createdAt: daysAgo(30), resolvedAt: daysAgo(25) },
      { customId: 'TP-1275', title: 'Диагностика системы смазки', status: 'closed', priority: 'high', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'ЗАО "ТяжМаш"', resolution: 'Заменён насос системы смазки. Давление в норме.', root_cause: 'Износ насоса' }, createdAt: daysAgo(35), resolvedAt: daysAgo(28) },
      { customId: 'TP-1276', title: 'Обучение оператора работе с новым ПО', status: 'closed', priority: 'low', assigneeId: users.morozova.id, data: { category: 'other', client_name: 'ООО "НоваСтрой"', resolution: 'Проведено 3-часовое обучение. Оператор сдал тест.' }, createdAt: daysAgo(40), resolvedAt: daysAgo(35) },

      // 2 переоткрытых
      { customId: 'TP-1277', title: 'Повторная ошибка системы охлаждения', status: 'reopened', priority: 'high', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'АО "МашСтрой"', description: 'Проблема с охлаждением повторилась после предыдущего ремонта', root_cause: 'Предыдущий ремонт не устранил корневую причину' }, createdAt: daysAgo(12), firstResponseAt: daysAgo(11), resolvedAt: daysAgo(6) },
      { customId: 'TP-1278', title: 'VPN снова не работает после обновления', status: 'reopened', priority: 'medium', assigneeId: users.orlov.id, data: { category: 'network', client_name: 'ООО "ТехСервис"', description: 'VPN перестал работать после обновления маршрутизатора' }, createdAt: daysAgo(8), firstResponseAt: daysAgo(7) },

      // Ещё 2 для разнообразия
      { customId: 'TP-1279', title: 'Интеграция IoT-датчиков с SCADA', status: 'in_progress', priority: 'critical', assigneeId: users.lebedev.id, data: { category: 'software', client_name: 'ПАО "МеталлГрупп"', client_phone: '+7 (495) 888-99-00', description: 'Интеграция 20 IoT-датчиков с системой SCADA для мониторинга в реальном времени', affected_system: 'SCADA WinCC OA', escalation_level: 'L2' }, createdAt: daysAgo(1), firstResponseAt: hoursAgo(18) },
      { customId: 'TP-1280', title: 'Аварийная остановка — ошибка E-stop', status: 'assigned', priority: 'critical', assigneeId: users.sokolova.id, data: { category: 'hardware', client_name: 'ООО "МегаСтанок"', client_phone: '+7 (495) 999-00-11', description: 'Станок перешёл в режим E-stop без видимой причины. Производство остановлено.', affected_system: 'Brother Speedio M140X2', escalation_level: 'L2' }, createdAt: hoursAgo(3), firstResponseAt: hoursAgo(2) },
    ];

    const tpEntities: WorkspaceEntity[] = [];
    for (const item of tpData) {
      const entity = await this.entityRepo.save({
        ...item,
        workspaceId: tp.id,
      });
      tpEntities.push(entity);
    }

    // ─── Claims (12 штук) ───
    const rekData: Partial<WorkspaceEntity>[] = [
      // 2 получены
      { customId: 'REK-447', title: 'Рекламация на качество шпинделя', status: 'received', priority: 'high', data: { severity: 'major', claim_type: 'quality', client_name: 'ООО "АвтоДеталь"', client_phone: '+7 (495) 111-00-22', client_company: 'ООО "АвтоДеталь"', order_number: 'ORD-2024-4521', defect_description: 'Шпиндель вышел из строя через 2 месяца после замены. Гарантийный случай.' }, createdAt: hoursAgo(6) },
      { customId: 'REK-448', title: 'Претензия по срокам поставки запчастей', status: 'received', priority: 'medium', data: { severity: 'minor', claim_type: 'delivery', client_name: 'АО "ПромТех"', client_email: 'claims@promtech.ru', client_company: 'АО "ПромТех"', order_number: 'ORD-2024-4678', defect_description: 'Запчасти доставлены с опозданием на 2 недели. Простой оборудования.' }, createdAt: hoursAgo(12) },

      // 1 зарегистрирована
      { customId: 'REK-449', title: 'Рекламация на некомплектную поставку', status: 'registered', priority: 'medium', assigneeId: users.popov.id, data: { severity: 'major', claim_type: 'delivery', client_name: 'ЗАО "ЭнергоМаш"', client_phone: '+7 (495) 222-11-33', client_company: 'ЗАО "ЭнергоМаш"', order_number: 'ORD-2024-4590', defect_description: 'В поставке отсутствует блок управления. Комплектация не соответствует спецификации.' }, createdAt: daysAgo(2) },

      // 2 расследование
      { customId: 'REK-450', title: 'Дефект сварного соединения на корпусе', status: 'investigation', priority: 'high', assigneeId: users.popov.id, data: { severity: 'critical', claim_type: 'quality', client_name: 'ПАО "Станкомаш"', client_phone: '+7 (495) 333-22-44', client_company: 'ПАО "Станкомаш"', order_number: 'ORD-2024-4201', defect_description: 'Обнаружена трещина в сварном шве корпуса станка. Потенциальная угроза безопасности.', evidence: 'Фотографии трещины, отчёт независимой экспертизы' }, createdAt: daysAgo(5), firstResponseAt: daysAgo(4) },
      { customId: 'REK-451', title: 'Несоответствие характеристик электродвигателя', status: 'investigation', priority: 'medium', assigneeId: users.smirnova.id, data: { severity: 'major', claim_type: 'quality', client_name: 'ООО "МеталлПром"', client_company: 'ООО "МеталлПром"', order_number: 'ORD-2024-4350', defect_description: 'Мощность двигателя не соответствует заявленным характеристикам. Отклонение 15%.' }, createdAt: daysAgo(7), firstResponseAt: daysAgo(6) },

      // 1 анализ причин
      { customId: 'REK-452', title: 'Рекламация на повторный выход из строя ПЛК', status: 'root_cause_analysis', priority: 'high', assigneeId: users.kuznetsova.id, data: { severity: 'critical', claim_type: 'quality', client_name: 'АО "ТочноСтрой"', client_company: 'АО "ТочноСтрой"', order_number: 'ORD-2024-3890', defect_description: 'ПЛК Siemens выходил из строя 3 раза за полгода. Требуется корневой анализ причин.', evidence: 'Журнал отказов, акты предыдущих ремонтов', compensation_amount: 150000 }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9) },

      // 1 решение + 1 корректирующие действия
      { customId: 'REK-453', title: 'Рекламация на качество фрезы', status: 'decision', priority: 'medium', assigneeId: users.kuznetsova.id, data: { severity: 'major', claim_type: 'quality', client_name: 'ООО "ФрезерМастер"', client_company: 'ООО "ФрезерМастер"', order_number: 'ORD-2024-4100', defect_description: 'Фрезы вышли из строя на 30% раньше заявленного ресурса', decision_type: 'replacement', corrective_action: 'Замена партии фрез на новую с улучшенным покрытием' }, createdAt: daysAgo(14), firstResponseAt: daysAgo(13) },
      { customId: 'REK-454', title: 'Корректирующие действия по поставке', status: 'corrective_actions', priority: 'medium', assigneeId: users.smirnova.id, data: { severity: 'minor', claim_type: 'delivery', client_name: 'ИП Сидоров', client_company: 'ИП Сидоров', order_number: 'ORD-2024-3950', defect_description: 'Повторная задержка поставки', corrective_action: 'Внедрение автоматического трекинга заказов', preventive_action: 'Создание буферного склада для критических комплектующих' }, createdAt: daysAgo(18), firstResponseAt: daysAgo(17) },

      // 3 закрыты
      { customId: 'REK-455', title: 'Рекламация на обслуживание (закрыта)', status: 'closed', priority: 'low', assigneeId: users.popov.id, data: { severity: 'minor', claim_type: 'service', client_name: 'ООО "ТехноСервис"', order_number: 'ORD-2024-3700', decision_type: 'refund', compensation_amount: 25000, corrective_action: 'Проведён инструктаж сервисной бригады' }, createdAt: daysAgo(25), resolvedAt: daysAgo(15) },
      { customId: 'REK-456', title: 'Возврат средств за бракованный подшипник', status: 'closed', priority: 'medium', assigneeId: users.smirnova.id, data: { severity: 'major', claim_type: 'quality', client_name: 'АО "МашЭкспорт"', order_number: 'ORD-2024-3500', decision_type: 'refund', compensation_amount: 45000 }, createdAt: daysAgo(30), resolvedAt: daysAgo(20) },
      { customId: 'REK-457', title: 'Замена двигателя по гарантии', status: 'closed', priority: 'high', assigneeId: users.kuznetsova.id, data: { severity: 'critical', claim_type: 'quality', client_name: 'ПАО "ТехноКласс"', order_number: 'ORD-2024-3200', decision_type: 'replacement', corrective_action: 'Усилен входной контроль двигателей от данного поставщика' }, createdAt: daysAgo(45), resolvedAt: daysAgo(30) },

      // 1 отклонена
      { customId: 'REK-458', title: 'Отклонённая претензия (нарушение условий эксплуатации)', status: 'rejected', priority: 'low', assigneeId: users.popov.id, data: { severity: 'minor', claim_type: 'quality', client_name: 'ИП Петров', order_number: 'ORD-2024-3800', defect_description: 'Выход из строя направляющих. Экспертиза показала нарушение условий эксплуатации.', decision_type: 'reject' }, createdAt: daysAgo(20), resolvedAt: daysAgo(12) },
    ];

    const rekEntities: WorkspaceEntity[] = [];
    for (const item of rekData) {
      const entity = await this.entityRepo.save({
        ...item,
        workspaceId: rek.id,
      });
      rekEntities.push(entity);
    }

    return { tpEntities, rekEntities };
  }

  // ────────────────────────────────────────────────
  // COMMENTS
  // ────────────────────────────────────────────────
  private async createComments(
    tpEntities: WorkspaceEntity[],
    rekEntities: WorkspaceEntity[],
    users: Record<string, User>,
  ) {
    const comments: Partial<Comment>[] = [];

    // Комментарии для заявок ТП (in_progress, waiting_client, resolved)
    const activeTP = tpEntities.filter((e) =>
      ['in_progress', 'waiting_client', 'resolved', 'reopened', 'assigned'].includes(e.status),
    );

    for (const entity of activeTP.slice(0, 8)) {
      comments.push({
        entityId: entity.id,
        authorId: entity.assigneeId || users.volkova.id,
        content: `Заявка принята в работу. Начинаю диагностику.`,
        createdAt: hoursAgo(Math.floor(Math.random() * 48) + 1),
      });

      if (['in_progress', 'resolved', 'reopened'].includes(entity.status)) {
        comments.push({
          entityId: entity.id,
          authorId: entity.assigneeId || users.orlov.id,
          content: `Выполнена предварительная диагностика. ${entity.status === 'resolved' ? 'Проблема решена.' : 'Продолжаю работу.'}`,
          createdAt: hoursAgo(Math.floor(Math.random() * 24) + 1),
        });
      }

      if (entity.status === 'waiting_client') {
        comments.push({
          entityId: entity.id,
          authorId: entity.assigneeId || users.morozova.id,
          content: 'Жду дополнительную информацию от клиента.',
          createdAt: hoursAgo(Math.floor(Math.random() * 12) + 1),
        });
      }

      if (entity.status === 'reopened') {
        comments.push({
          entityId: entity.id,
          authorId: users.volkova.id,
          content: 'Заявка переоткрыта. Требуется повторный анализ проблемы.',
          createdAt: hoursAgo(Math.floor(Math.random() * 6) + 1),
        });
      }
    }

    // Комментарии для рекламаций
    const activeREK = rekEntities.filter((e) =>
      ['investigation', 'root_cause_analysis', 'decision', 'corrective_actions'].includes(e.status),
    );

    for (const entity of activeREK) {
      comments.push({
        entityId: entity.id,
        authorId: entity.assigneeId || users.kuznetsova.id,
        content: `Рекламация принята. Начинаю расследование.`,
        createdAt: daysAgo(Math.floor(Math.random() * 5) + 1),
      });

      if (['root_cause_analysis', 'decision', 'corrective_actions'].includes(entity.status)) {
        comments.push({
          entityId: entity.id,
          authorId: users.kuznetsova.id,
          content: 'Проведён анализ. Формирую заключение по корневым причинам.',
          createdAt: daysAgo(Math.floor(Math.random() * 3) + 1),
        });
      }
    }

    if (comments.length > 0) {
      await this.commentRepo.save(comments);
    }
  }

  // ────────────────────────────────────────────────
  // SLA INSTANCES
  // ────────────────────────────────────────────────
  private async createSlaInstances(
    tp: Workspace,
    rek: Workspace,
    tpEntities: WorkspaceEntity[],
    rekEntities: WorkspaceEntity[],
    slaDefsTP: SlaDefinition[],
    slaDefsREK: SlaDefinition[],
  ) {
    // Map priority → SLA definition for TP
    const tpSlaMap: Record<string, SlaDefinition> = {};
    for (const def of slaDefsTP) {
      const p = (def.conditions as any)?.priority;
      if (p) tpSlaMap[p] = def;
    }

    const now = new Date();
    const slaInstances: Partial<SlaInstance>[] = [];

    // SLA for TP entities (active ones)
    const activeTpStatuses = ['new', 'classified', 'assigned', 'in_progress', 'waiting_client', 'reopened'];
    for (const entity of tpEntities) {
      const slaDef = tpSlaMap[entity.priority || 'medium'];
      if (!slaDef) continue;

      const isActive = activeTpStatuses.includes(entity.status);
      const isResolved = ['resolved', 'closed'].includes(entity.status);

      const responseDueAt = new Date(entity.createdAt);
      responseDueAt.setMinutes(responseDueAt.getMinutes() + (slaDef.responseTime || 240));

      const resolutionDueAt = new Date(entity.createdAt);
      resolutionDueAt.setMinutes(resolutionDueAt.getMinutes() + (slaDef.resolutionTime || 1440));

      const responseStatus: SlaStatus = entity.firstResponseAt
        ? (entity.firstResponseAt <= responseDueAt ? 'met' : 'breached')
        : (isActive && now > responseDueAt ? 'breached' : 'pending');

      const resolutionStatus: SlaStatus = entity.resolvedAt
        ? (entity.resolvedAt <= resolutionDueAt ? 'met' : 'breached')
        : (isActive && now > resolutionDueAt ? 'breached' : 'pending');

      slaInstances.push({
        slaDefinitionId: slaDef.id,
        workspaceId: tp.id,
        targetType: 'entity' as SlaTargetType,
        targetId: entity.id,
        responseDueAt,
        resolutionDueAt,
        firstResponseAt: entity.firstResponseAt,
        resolvedAt: isResolved ? entity.resolvedAt : undefined,
        responseStatus,
        resolutionStatus,
        isPaused: entity.status === 'waiting_client',
        currentEscalationLevel: responseStatus === 'breached' ? 1 : 0,
      });
    }

    if (slaInstances.length > 0) {
      await this.slaInstRepo.save(slaInstances);
    }
  }

  // ────────────────────────────────────────────────
  // PROCESS INSTANCES
  // ────────────────────────────────────────────────
  private async createProcessInstances(
    tp: Workspace,
    rek: Workspace,
    tpEntities: WorkspaceEntity[],
    rekEntities: WorkspaceEntity[],
    processDefs: { supportV2: ProcessDefinition; claimsManagement: ProcessDefinition; slaEscalation: ProcessDefinition },
    users: Record<string, User>,
  ) {
    const instances: Partial<ProcessInstance>[] = [];
    let keyCounter = 2251799813685249; // Zeebe-style keys

    // Process instances for TP (active tickets get active instances, closed get completed)
    for (const entity of tpEntities) {
      const isCompleted = ['closed'].includes(entity.status);
      const isTerminated = ['rejected'].includes(entity.status);

      instances.push({
        workspaceId: tp.id,
        entityId: entity.id,
        processDefinitionId: processDefs.supportV2.id,
        processDefinitionKey: `${keyCounter++}`,
        processInstanceKey: `${keyCounter++}`,
        businessKey: entity.customId,
        status: isCompleted
          ? ProcessInstanceStatus.COMPLETED
          : isTerminated
            ? ProcessInstanceStatus.TERMINATED
            : ProcessInstanceStatus.ACTIVE,
        variables: {
          entityId: entity.id,
          workspaceId: tp.id,
          title: entity.title,
          priority: entity.priority,
          category: (entity.data as any)?.category,
          assigneeId: entity.assigneeId,
        },
        startedById: users.kozlov.id,
        startedAt: entity.createdAt,
        completedAt: isCompleted ? entity.resolvedAt : undefined,
      });
    }

    // Process instances for REK
    for (const entity of rekEntities) {
      const isCompleted = ['closed'].includes(entity.status);
      const isRejected = ['rejected'].includes(entity.status);

      instances.push({
        workspaceId: rek.id,
        entityId: entity.id,
        processDefinitionId: processDefs.claimsManagement.id,
        processDefinitionKey: `${keyCounter++}`,
        processInstanceKey: `${keyCounter++}`,
        businessKey: entity.customId,
        status: isCompleted || isRejected
          ? ProcessInstanceStatus.COMPLETED
          : ProcessInstanceStatus.ACTIVE,
        variables: {
          entityId: entity.id,
          workspaceId: rek.id,
          title: entity.title,
          severity: (entity.data as any)?.severity,
          claimType: (entity.data as any)?.claim_type,
        },
        startedById: users.kuznetsova.id,
        startedAt: entity.createdAt,
        completedAt: (isCompleted || isRejected) ? entity.resolvedAt : undefined,
      });
    }

    if (instances.length > 0) {
      await this.processInstRepo.save(instances);
    }
  }
}
