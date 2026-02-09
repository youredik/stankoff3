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
import { WorkspaceMember, WorkspaceRole } from './modules/workspace/workspace-member.entity';
import { Section } from './modules/section/section.entity';
import { SectionMember } from './modules/section/section-member.entity';
import { SlaDefinition } from './modules/sla/entities/sla-definition.entity';
import type { SlaTargetType } from './modules/sla/entities/sla-definition.entity';
import { SlaInstance } from './modules/sla/entities/sla-instance.entity';
import type { SlaStatus } from './modules/sla/entities/sla-instance.entity';
import { DecisionTable } from './modules/dmn/entities/decision-table.entity';
import type { HitPolicy } from './modules/dmn/entities/decision-table.entity';
import { ProcessDefinition } from './modules/bpmn/entities/process-definition.entity';
import { ProcessTrigger, TriggerType } from './modules/bpmn/entities/process-trigger.entity';
import { EntityLink, EntityLinkType } from './modules/bpmn/entities/entity-link.entity';
import { AutomationRule } from './modules/automation/automation-rule.entity';
import { UserGroup } from './modules/bpmn/entities/user-group.entity';
import { BpmnService } from './modules/bpmn/bpmn.service';

// ──── Helpers ────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt;
}

function hoursAgo(h: number): Date {
  const dt = new Date();
  dt.setHours(dt.getHours() - h);
  return dt;
}

function rnd(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

// ──── Types ────

type UsersByDept = { hr: User[]; finance: User[]; commercial: User[] };
type Workspaces = { otp: Workspace; fin: Workspace; po: Workspace; kp: Workspace };
type EntitiesByWs = { otp: WorkspaceEntity[]; fin: WorkspaceEntity[]; po: WorkspaceEntity[]; kp: WorkspaceEntity[] };

// ══════════════════════════════════════════════════════
// SeedShowcase — демо-данные для всех функций портала
// ══════════════════════════════════════════════════════

@Injectable()
export class SeedShowcase implements OnModuleInit {
  private readonly logger = new Logger(SeedShowcase.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Workspace) private wsRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceEntity) private entityRepo: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMember) private memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Section) private sectionRepo: Repository<Section>,
    @InjectRepository(SectionMember) private secMemberRepo: Repository<SectionMember>,
    @InjectRepository(Comment) private commentRepo: Repository<Comment>,
    @InjectRepository(SlaDefinition) private slaDefRepo: Repository<SlaDefinition>,
    @InjectRepository(SlaInstance) private slaInstRepo: Repository<SlaInstance>,
    @InjectRepository(DecisionTable) private dmnRepo: Repository<DecisionTable>,
    @InjectRepository(ProcessDefinition) private procDefRepo: Repository<ProcessDefinition>,
    @InjectRepository(ProcessTrigger) private triggerRepo: Repository<ProcessTrigger>,
    @InjectRepository(EntityLink) private linkRepo: Repository<EntityLink>,
    @InjectRepository(AutomationRule) private automationRepo: Repository<AutomationRule>,
    @InjectRepository(UserGroup) private groupRepo: Repository<UserGroup>,
    private readonly bpmnService: BpmnService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    const existing = await this.sectionRepo.findOne({ where: { name: 'HR' } });
    if (existing) {
      this.logger.log('Showcase seed already exists, skipping');
      return;
    }
    const userCount = await this.userRepo.count();
    if (userCount === 0) {
      this.logger.warn('No users found — waiting for base seed');
      return;
    }

    this.logger.log('Waiting for Zeebe connection...');
    await this.bpmnService.waitForConnection(30000);

    this.logger.log('Zeebe connected. Cleaning up and seeding showcase...');
    await this.cleanup();
    await this.seed();
    this.logger.log('Showcase seed completed');
  }

  private async cleanup() {
    this.logger.log('Cleanup: removing ALL data...');

    // 1. BPMN (user_tasks перед process_instances из-за FK)
    try { await this.dataSource.query(`DELETE FROM "user_task_comments"`); } catch { /* table may not exist */ }
    try { await this.dataSource.query(`DELETE FROM "user_tasks"`); } catch { /* table may not exist */ }
    await this.dataSource.query(`DELETE FROM "entity_links"`);
    await this.dataSource.query(`DELETE FROM "process_activity_logs"`);
    await this.dataSource.query(`DELETE FROM "process_instances"`);
    try { await this.dataSource.query(`DELETE FROM "trigger_executions"`); } catch { /* table may not exist */ }
    await this.dataSource.query(`DELETE FROM "process_triggers"`);
    try { await this.dataSource.query(`DELETE FROM "form_definitions"`); } catch { /* table may not exist */ }
    await this.dataSource.query(`DELETE FROM "process_definitions"`);

    // 2. SLA / DMN / Automation
    await this.dataSource.query(`DELETE FROM "sla_events"`);
    await this.dataSource.query(`DELETE FROM "sla_instances"`);
    await this.dataSource.query(`DELETE FROM "sla_definitions"`);
    try { await this.dataSource.query(`DELETE FROM "decision_evaluations"`); } catch { /* table may not exist */ }
    await this.dataSource.query(`DELETE FROM "decision_tables"`);
    await this.dataSource.query(`DELETE FROM "automation_rules"`);
    await this.dataSource.query(`DELETE FROM "user_group_members"`);
    await this.dataSource.query(`DELETE FROM "user_groups"`);

    // 3. Comments + Entities (все)
    await this.dataSource.query(`DELETE FROM "comments"`);
    await this.dataSource.query(`DELETE FROM "entities"`);

    // 4. Workspace members (все)
    await this.dataSource.query(`DELETE FROM "workspace_members"`);

    // 5. Workspaces (все)
    await this.dataSource.query(`DELETE FROM "workspaces"`);

    // 6. Sections
    await this.dataSource.query(`DELETE FROM "section_members"`);
    await this.dataSource.query(`DELETE FROM "sections"`);

    // 7. Пользователи (оставляем только admin)
    await this.dataSource.query(`
      DELETE FROM "users"
      WHERE "email" NOT IN ('admin@stankoff.ru')
    `);

    this.logger.log('Cleanup: done');
  }

  async seed() {
    const pw = await bcrypt.hash('password', 10);
    const admin = await this.userRepo.findOne({ where: { email: 'admin@stankoff.ru' } });

    const users = await this.createUsers(pw);
    const sections = await this.createSections(users, admin);
    const ws = await this.createWorkspaces(sections);
    await this.createMembers(ws, users, admin);
    await this.createUserGroups(ws, users);
    const procDefs = await this.createProcessDefinitions(ws, users);
    await this.createTriggers(ws, procDefs, users);
    const slaDefs = await this.createSlaDefinitions(ws, users);
    await this.createDmnTables(ws, users);
    await this.createAutomationRules(ws, users);
    const entities = await this.createAllEntities(ws, users);
    await this.createComments(entities, users);
    await this.createSlaInstances(ws, entities, slaDefs);
    await this.startRealProcesses(ws, entities, procDefs, users);
    await this.createEntityLinks(entities, users.hr[0]);

    const total = entities.otp.length + entities.fin.length + entities.po.length + entities.kp.length;
    this.logger.log(`Showcase: 20 users, 3 sections, 4 workspaces, ${total} entities, real BPMN processes`);
  }

  // ──── USERS (20) ────

  private async createUsers(pw: string): Promise<UsersByDept> {
    const data = [
      { email: 'antonova@stankoff.ru', firstName: 'Ирина', lastName: 'Антонова', role: UserRole.MANAGER, department: 'HR' },
      { email: 'voronov@stankoff.ru', firstName: 'Артём', lastName: 'Воронов', role: UserRole.MANAGER, department: 'HR' },
      { email: 'mbelova@stankoff.ru', firstName: 'Марина', lastName: 'Белова', role: UserRole.EMPLOYEE, department: 'HR' },
      { email: 'gorbunov@stankoff.ru', firstName: 'Павел', lastName: 'Горбунов', role: UserRole.EMPLOYEE, department: 'HR' },
      { email: 'dmitrieva@stankoff.ru', firstName: 'Анна', lastName: 'Дмитриева', role: UserRole.EMPLOYEE, department: 'HR' },
      { email: 'efimov@stankoff.ru', firstName: 'Роман', lastName: 'Ефимов', role: UserRole.EMPLOYEE, department: 'HR' },
      { email: 'zhukova@stankoff.ru', firstName: 'Светлана', lastName: 'Жукова', role: UserRole.EMPLOYEE, department: 'HR' },
      { email: 'zakharov@stankoff.ru', firstName: 'Андрей', lastName: 'Захаров', role: UserRole.MANAGER, department: 'Финансы' },
      { email: 'isaeva@stankoff.ru', firstName: 'Елена', lastName: 'Исаева', role: UserRole.MANAGER, department: 'Финансы' },
      { email: 'kalinin@stankoff.ru', firstName: 'Михаил', lastName: 'Калинин', role: UserRole.EMPLOYEE, department: 'Финансы' },
      { email: 'lavrova@stankoff.ru', firstName: 'Ольга', lastName: 'Лаврова', role: UserRole.EMPLOYEE, department: 'Финансы' },
      { email: 'makarov@stankoff.ru', firstName: 'Денис', lastName: 'Макаров', role: UserRole.EMPLOYEE, department: 'Финансы' },
      { email: 'nazarova@stankoff.ru', firstName: 'Юлия', lastName: 'Назарова', role: UserRole.EMPLOYEE, department: 'Финансы' },
      { email: 'osipov@stankoff.ru', firstName: 'Виктор', lastName: 'Осипов', role: UserRole.EMPLOYEE, department: 'Финансы' },
      { email: 'polyakova@stankoff.ru', firstName: 'Анастасия', lastName: 'Полякова', role: UserRole.MANAGER, department: 'Коммерческий' },
      { email: 'rusakov@stankoff.ru', firstName: 'Алексей', lastName: 'Русаков', role: UserRole.MANAGER, department: 'Коммерческий' },
      { email: 'stepanova@stankoff.ru', firstName: 'Кристина', lastName: 'Степанова', role: UserRole.EMPLOYEE, department: 'Коммерческий' },
      { email: 'tarasov@stankoff.ru', firstName: 'Владимир', lastName: 'Тарасов', role: UserRole.EMPLOYEE, department: 'Коммерческий' },
      { email: 'ulyanova@stankoff.ru', firstName: 'Дарья', lastName: 'Ульянова', role: UserRole.EMPLOYEE, department: 'Коммерческий' },
      { email: 'filippov@stankoff.ru', firstName: 'Евгений', lastName: 'Филиппов', role: UserRole.EMPLOYEE, department: 'Коммерческий' },
    ];

    const saved: User[] = [];
    for (const u of data) {
      let user = await this.userRepo.findOne({ where: { email: u.email } });
      if (!user) user = await this.userRepo.save({ ...u, password: pw });
      saved.push(user);
    }

    return { hr: saved.slice(0, 7), finance: saved.slice(7, 14), commercial: saved.slice(14, 20) };
  }

  // ──── SECTIONS (3) ────

  private async createSections(users: UsersByDept, admin: User | null) {
    const hr = await this.sectionRepo.save({ name: 'HR', description: 'Управление персоналом', icon: '👥', order: 2 });
    const fin = await this.sectionRepo.save({ name: 'Финансы', description: 'Финансы и закупки', icon: '💰', order: 3 });
    const comm = await this.sectionRepo.save({ name: 'Коммерческий', description: 'Продажи и предложения', icon: '📊', order: 4 });

    const members = [
      { sectionId: hr.id, userId: users.hr[0].id, role: 'admin' as any },
      { sectionId: hr.id, userId: users.hr[1].id, role: 'viewer' as any },
      { sectionId: fin.id, userId: users.finance[0].id, role: 'admin' as any },
      { sectionId: fin.id, userId: users.finance[1].id, role: 'admin' as any },
      { sectionId: comm.id, userId: users.commercial[0].id, role: 'admin' as any },
      { sectionId: comm.id, userId: users.commercial[1].id, role: 'viewer' as any },
    ];
    if (admin) {
      members.push(
        { sectionId: hr.id, userId: admin.id, role: 'admin' as any },
        { sectionId: fin.id, userId: admin.id, role: 'admin' as any },
        { sectionId: comm.id, userId: admin.id, role: 'admin' as any },
      );
    }
    await this.secMemberRepo.save(members);
    return { hr, fin, comm };
  }

  // ──── WORKSPACES (4) ────

  private async createWorkspaces(sec: { hr: Section; fin: Section; comm: Section }): Promise<Workspaces> {
    const otp = await this.wsRepo.save({
      name: 'Отпуска и отсутствия', icon: '🏖️', prefix: 'OTP', lastEntityNumber: 35,
      sectionId: sec.hr.id, orderInSection: 0,
      sections: [
        { id: 'main', name: 'Основная информация', order: 0, fields: [
          { id: 'title', name: 'Заявка', type: 'text' as const, required: true },
          { id: 'status', name: 'Статус', type: 'status' as const, required: true, options: [
            { id: 'pending', label: 'Подана', color: '#3B82F6' },
            { id: 'pending_approval', label: 'На согласовании', color: '#F59E0B' },
            { id: 'approved', label: 'Одобрена', color: '#10B981' },
            { id: 'rejected', label: 'Отклонена', color: '#EF4444' },
            { id: 'in_progress', label: 'В отпуске', color: '#8B5CF6' },
            { id: 'completed', label: 'Завершён', color: '#6B7280' },
          ] },
          { id: 'type', name: 'Тип отпуска', type: 'select' as const, options: [
            { id: 'annual', label: 'Ежегодный', color: '#3B82F6' },
            { id: 'sick', label: 'Больничный', color: '#EF4444' },
            { id: 'study', label: 'Учебный', color: '#F59E0B' },
            { id: 'unpaid', label: 'Без сохранения', color: '#6B7280' },
          ] },
          { id: 'assignee', name: 'Сотрудник', type: 'user' as const },
        ] },
        { id: 'dates', name: 'Даты', order: 1, fields: [
          { id: 'start_date', name: 'Дата начала', type: 'date' as const },
          { id: 'end_date', name: 'Дата окончания', type: 'date' as const },
          { id: 'days_count', name: 'Количество дней', type: 'number' as const },
        ] },
        { id: 'details', name: 'Детали', order: 2, fields: [
          { id: 'reason', name: 'Причина', type: 'textarea' as const },
        ] },
      ],
    });

    const fin = await this.wsRepo.save({
      name: 'Согласование расходов', icon: '💳', prefix: 'FIN', lastEntityNumber: 35,
      sectionId: sec.fin.id, orderInSection: 0,
      sections: [
        { id: 'main', name: 'Основная информация', order: 0, fields: [
          { id: 'title', name: 'Расход', type: 'text' as const, required: true },
          { id: 'status', name: 'Статус', type: 'status' as const, required: true, options: [
            { id: 'new', label: 'Новый', color: '#3B82F6' },
            { id: 'budget_check', label: 'Проверка бюджета', color: '#06B6D4' },
            { id: 'pending_approval', label: 'На согласовании', color: '#F59E0B' },
            { id: 'director_approval', label: 'У директора', color: '#F97316' },
            { id: 'approved', label: 'Одобрен', color: '#10B981' },
            { id: 'rejected', label: 'Отклонён', color: '#EF4444' },
            { id: 'paid', label: 'Оплачен', color: '#6B7280' },
          ] },
          { id: 'category', name: 'Категория', type: 'select' as const, options: [
            { id: 'office', label: 'Офис', color: '#6366F1' },
            { id: 'travel', label: 'Командировки', color: '#3B82F6' },
            { id: 'equipment', label: 'Оборудование', color: '#06B6D4' },
            { id: 'marketing', label: 'Маркетинг', color: '#EC4899' },
            { id: 'training', label: 'Обучение', color: '#F59E0B' },
          ] },
          { id: 'assignee', name: 'Ответственный', type: 'user' as const },
          { id: 'amount', name: 'Сумма (₽)', type: 'number' as const },
        ] },
        { id: 'details', name: 'Детали', order: 1, fields: [
          { id: 'justification', name: 'Обоснование', type: 'textarea' as const },
          { id: 'needed_by', name: 'Нужно до', type: 'date' as const },
        ] },
      ],
    });

    const po = await this.wsRepo.save({
      name: 'Закупки', icon: '📦', prefix: 'PO', lastEntityNumber: 35,
      sectionId: sec.fin.id, orderInSection: 1,
      sections: [
        { id: 'main', name: 'Основная информация', order: 0, fields: [
          { id: 'title', name: 'Наименование', type: 'text' as const, required: true },
          { id: 'status', name: 'Статус', type: 'status' as const, required: true, options: [
            { id: 'new', label: 'Новая', color: '#3B82F6' },
            { id: 'review', label: 'Проверка', color: '#06B6D4' },
            { id: 'budget_check', label: 'Проверка бюджета', color: '#F59E0B' },
            { id: 'approved', label: 'Одобрена', color: '#10B981' },
            { id: 'supplier_selected', label: 'Поставщик выбран', color: '#8B5CF6' },
            { id: 'ordered', label: 'Заказано', color: '#6366F1' },
            { id: 'received', label: 'Получено', color: '#EC4899' },
            { id: 'completed', label: 'Завершена', color: '#6B7280' },
            { id: 'rejected', label: 'Отклонена', color: '#EF4444' },
          ] },
          { id: 'assignee', name: 'Ответственный', type: 'user' as const },
          { id: 'total_amount', name: 'Сумма (₽)', type: 'number' as const },
        ] },
        { id: 'supplier', name: 'Поставщик', order: 1, fields: [
          { id: 'supplier_name', name: 'Поставщик', type: 'text' as const },
          { id: 'contract_number', name: 'Номер договора', type: 'text' as const },
          { id: 'delivery_deadline', name: 'Срок поставки', type: 'date' as const },
        ] },
        { id: 'details', name: 'Детали', order: 2, fields: [
          { id: 'specifications', name: 'Спецификация', type: 'textarea' as const },
        ] },
      ],
    });

    const kp = await this.wsRepo.save({
      name: 'Коммерческие предложения', icon: '📊', prefix: 'KP', lastEntityNumber: 35,
      sectionId: sec.comm.id, orderInSection: 0,
      sections: [
        { id: 'main', name: 'Основная информация', order: 0, fields: [
          { id: 'title', name: 'Название КП', type: 'text' as const, required: true },
          { id: 'status', name: 'Статус', type: 'status' as const, required: true, options: [
            { id: 'draft', label: 'Черновик', color: '#6B7280' },
            { id: 'pending', label: 'На рассмотрении', color: '#F59E0B' },
            { id: 'approved', label: 'Одобрено', color: '#10B981' },
            { id: 'rejected', label: 'Отклонено', color: '#EF4444' },
            { id: 'sent_to_client', label: 'Отправлено клиенту', color: '#3B82F6' },
            { id: 'won', label: 'Выиграно', color: '#059669' },
            { id: 'lost', label: 'Проиграно', color: '#DC2626' },
          ] },
          { id: 'assignee', name: 'Менеджер', type: 'user' as const },
          { id: 'deal_amount', name: 'Сумма сделки (₽)', type: 'number' as const },
        ] },
        { id: 'client', name: 'Клиент', order: 1, fields: [
          { id: 'customer', name: 'Компания-клиент', type: 'text' as const },
          { id: 'valid_until', name: 'Действует до', type: 'date' as const },
        ] },
        { id: 'details', name: 'Детали', order: 2, fields: [
          { id: 'description', name: 'Описание', type: 'textarea' as const },
          { id: 'proposal_link', name: 'Ссылка на КП', type: 'text' as const },
        ] },
      ],
    });

    return { otp, fin, po, kp };
  }

  // ──── WORKSPACE MEMBERS ────

  private async createMembers(ws: Workspaces, users: UsersByDept, admin: User | null) {
    const m = [
      // OTP — HR team
      ...users.hr.map((u, i) => ({ workspaceId: ws.otp.id, userId: u.id, role: i < 2 ? WorkspaceRole.ADMIN : WorkspaceRole.EDITOR })),
      // FIN — finance team
      ...users.finance.map((u, i) => ({ workspaceId: ws.fin.id, userId: u.id, role: i < 2 ? WorkspaceRole.ADMIN : WorkspaceRole.EDITOR })),
      // PO — finance team (shared)
      ...users.finance.map((u, i) => ({ workspaceId: ws.po.id, userId: u.id, role: i < 2 ? WorkspaceRole.ADMIN : WorkspaceRole.EDITOR })),
      // KP — commercial team
      ...users.commercial.map((u, i) => ({ workspaceId: ws.kp.id, userId: u.id, role: i < 2 ? WorkspaceRole.ADMIN : WorkspaceRole.EDITOR })),
      // Cross-visibility
      { workspaceId: ws.fin.id, userId: users.hr[0].id, role: WorkspaceRole.VIEWER },
      { workspaceId: ws.kp.id, userId: users.finance[0].id, role: WorkspaceRole.VIEWER },
    ];
    if (admin) {
      m.push(
        { workspaceId: ws.otp.id, userId: admin.id, role: WorkspaceRole.ADMIN },
        { workspaceId: ws.fin.id, userId: admin.id, role: WorkspaceRole.ADMIN },
        { workspaceId: ws.po.id, userId: admin.id, role: WorkspaceRole.ADMIN },
        { workspaceId: ws.kp.id, userId: admin.id, role: WorkspaceRole.ADMIN },
      );
    }
    await this.memberRepo.save(m);
  }

  // ──── USER GROUPS (4) ────

  private async createUserGroups(ws: Workspaces, users: UsersByDept) {
    const groups = [
      { ws: ws.otp, name: 'HR-менеджеры', key: 'hr-managers', desc: 'Руководители HR', members: users.hr.slice(0, 2) },
      { ws: ws.fin, name: 'Финансовый контроль', key: 'finance-control', desc: 'Контролёры бюджета', members: [users.finance[0], users.finance[1], users.finance[6]] },
      { ws: ws.po, name: 'Отдел закупок', key: 'procurement', desc: 'Специалисты по закупкам', members: [users.finance[4], users.finance[5]] },
      { ws: ws.kp, name: 'Отдел продаж', key: 'sales-team', desc: 'Менеджеры по продажам', members: users.commercial },
    ];
    for (const g of groups) {
      const saved = await this.groupRepo.save(this.groupRepo.create({
        workspaceId: g.ws.id, name: g.name, key: g.key, description: g.desc,
      }));
      saved.members = g.members;
      await this.groupRepo.save(saved);
    }
  }

  // ──── BPMN PROCESS DEFINITIONS (4) ────

  private async createProcessDefinitions(ws: Workspaces, users: UsersByDept) {
    const dir = path.join(__dirname, 'modules', 'bpmn', 'templates');
    const read = (f: string) => { try { return fs.readFileSync(path.join(dir, f), 'utf-8'); } catch { return `<!-- ${f} -->`; } };

    const defs = await this.procDefRepo.save([
      { workspaceId: ws.otp.id, name: 'Согласование отпуска', description: 'Подача → согласование руководителем → одобрение/отклонение', processId: 'vacation-request', bpmnXml: read('vacation-request.bpmn'), version: 1, isActive: true, isDefault: true, createdById: users.hr[0].id },
      { workspaceId: ws.fin.id, name: 'Согласование расходов', description: 'Проверка бюджета → согласование → одобрение/отклонение', processId: 'expense-approval', bpmnXml: read('expense-approval.bpmn'), version: 1, isActive: true, isDefault: true, createdById: users.finance[0].id },
      { workspaceId: ws.po.id, name: 'Процесс закупки', description: 'Полный цикл: проверка → согласование → выбор поставщика → заказ → приёмка', processId: 'purchase-order', bpmnXml: read('purchase-order.bpmn'), version: 1, isActive: true, isDefault: true, createdById: users.finance[0].id },
      { workspaceId: ws.kp.id, name: 'Согласование КП', description: 'Простое согласование коммерческого предложения', processId: 'simple-approval', bpmnXml: read('simple-approval.bpmn'), version: 1, isActive: true, isDefault: true, createdById: users.commercial[0].id },
    ]);

    // Деплой в Zeebe
    for (const def of defs) {
      await this.bpmnService.deployDefinition(def.id);
      this.logger.log(`  Deployed: ${def.processId}`);
    }

    return { vacation: defs[0], expense: defs[1], purchase: defs[2], simple: defs[3] };
  }

  // ──── TRIGGERS (4) ────

  private async createTriggers(
    ws: Workspaces,
    pd: { vacation: ProcessDefinition; expense: ProcessDefinition; purchase: ProcessDefinition; simple: ProcessDefinition },
    users: UsersByDept,
  ) {
    await this.triggerRepo.save([
      { processDefinitionId: pd.vacation.id, workspaceId: ws.otp.id, name: 'Автозапуск при подаче заявки', triggerType: TriggerType.ENTITY_CREATED, conditions: {}, variableMappings: { entityId: '$.entity.id', title: '$.entity.title' }, isActive: true, createdById: users.hr[0].id },
      { processDefinitionId: pd.expense.id, workspaceId: ws.fin.id, name: 'Автозапуск согласования расхода', triggerType: TriggerType.ENTITY_CREATED, conditions: {}, variableMappings: { entityId: '$.entity.id', amount: '$.entity.data.amount' }, isActive: true, createdById: users.finance[0].id },
      { processDefinitionId: pd.purchase.id, workspaceId: ws.po.id, name: 'Автозапуск процесса закупки', triggerType: TriggerType.ENTITY_CREATED, conditions: {}, variableMappings: { entityId: '$.entity.id', total_amount: '$.entity.data.total_amount' }, isActive: true, createdById: users.finance[0].id },
      { processDefinitionId: pd.simple.id, workspaceId: ws.kp.id, name: 'Автозапуск согласования КП', triggerType: TriggerType.ENTITY_CREATED, conditions: {}, variableMappings: { entityId: '$.entity.id', deal_amount: '$.entity.data.deal_amount' }, isActive: true, createdById: users.commercial[0].id },
    ]);
  }

  // ──── SLA DEFINITIONS (8) ────

  private async createSlaDefinitions(ws: Workspaces, users: UsersByDept) {
    const bh = { start: '09:00', end: '18:00', timezone: 'Europe/Moscow', workdays: [1, 2, 3, 4, 5] };
    const esc = [
      { threshold: 80, action: 'notify' as const, targets: ['assignee'] },
      { threshold: 100, action: 'escalate' as const, targets: ['manager'] },
    ];

    const defs = await this.slaDefRepo.save([
      // OTP (2)
      { workspaceId: ws.otp.id, name: 'SLA Согласование отпуска', description: 'Руководитель должен рассмотреть за 24ч', appliesTo: 'entity' as SlaTargetType, conditions: {}, responseTime: 60, resolutionTime: 1440, warningThreshold: 80, businessHoursOnly: true, businessHours: bh, escalationRules: esc, isActive: true, priority: 1, createdById: users.hr[0].id },
      { workspaceId: ws.otp.id, name: 'SLA Срочный отпуск', description: 'Срочные заявки: 4ч ответ, 8ч решение', appliesTo: 'entity' as SlaTargetType, conditions: { priority: 'high' }, responseTime: 30, resolutionTime: 480, warningThreshold: 70, businessHoursOnly: true, businessHours: bh, escalationRules: esc, isActive: true, priority: 2, createdById: users.hr[0].id },
      // FIN (2)
      { workspaceId: ws.fin.id, name: 'SLA Согласование расходов', description: 'Стандартные расходы: 4ч ответ, 2 дня решение', appliesTo: 'entity' as SlaTargetType, conditions: {}, responseTime: 240, resolutionTime: 2880, warningThreshold: 80, businessHoursOnly: true, businessHours: bh, escalationRules: esc, isActive: true, priority: 1, createdById: users.finance[0].id },
      { workspaceId: ws.fin.id, name: 'SLA Крупные расходы', description: 'Расходы >100к: 1ч ответ, 1 день решение', appliesTo: 'entity' as SlaTargetType, conditions: { priority: 'high' }, responseTime: 60, resolutionTime: 1440, warningThreshold: 70, businessHoursOnly: true, businessHours: bh, escalationRules: esc, isActive: true, priority: 2, createdById: users.finance[0].id },
      // PO (2)
      { workspaceId: ws.po.id, name: 'SLA Стандартная закупка', description: '8ч ответ, 5 дней полный цикл', appliesTo: 'entity' as SlaTargetType, conditions: {}, responseTime: 480, resolutionTime: 7200, warningThreshold: 80, businessHoursOnly: true, businessHours: bh, escalationRules: esc, isActive: true, priority: 1, createdById: users.finance[0].id },
      { workspaceId: ws.po.id, name: 'SLA Срочная закупка', description: 'Срочные: 2ч ответ, 2 дня цикл', appliesTo: 'entity' as SlaTargetType, conditions: { priority: 'high' }, responseTime: 120, resolutionTime: 2880, warningThreshold: 70, businessHoursOnly: true, businessHours: bh, escalationRules: esc, isActive: true, priority: 2, createdById: users.finance[0].id },
      // KP (2)
      { workspaceId: ws.kp.id, name: 'SLA Согласование КП', description: '4ч ответ, 3 дня решение', appliesTo: 'entity' as SlaTargetType, conditions: {}, responseTime: 240, resolutionTime: 4320, warningThreshold: 80, businessHoursOnly: true, businessHours: bh, escalationRules: esc, isActive: true, priority: 1, createdById: users.commercial[0].id },
      { workspaceId: ws.kp.id, name: 'SLA Крупные КП', description: 'КП >5М: 1ч ответ, 1 день решение', appliesTo: 'entity' as SlaTargetType, conditions: { priority: 'high' }, responseTime: 60, resolutionTime: 1440, warningThreshold: 70, businessHoursOnly: true, businessHours: bh, escalationRules: esc, isActive: true, priority: 2, createdById: users.commercial[0].id },
    ]);
    return {
      otp: defs.slice(0, 2), fin: defs.slice(2, 4),
      po: defs.slice(4, 6), kp: defs.slice(6, 8),
    };
  }

  // ──── DMN TABLES (4) ────

  private async createDmnTables(ws: Workspaces, users: UsersByDept) {
    await this.dmnRepo.save([
      {
        workspaceId: ws.otp.id, name: 'Маршрутизация отпусков', description: 'Определяет согласующего по типу и длительности', hitPolicy: 'FIRST' as HitPolicy,
        inputColumns: [
          { id: 'type', name: 'type', label: 'Тип отпуска', type: 'string' as const },
          { id: 'days', name: 'days', label: 'Дней', type: 'number' as const },
        ],
        outputColumns: [
          { id: 'approver', name: 'approver', label: 'Согласующий', type: 'string' as const, defaultValue: 'manager' },
        ],
        rules: [
          { id: 'r1', description: '>14 дней → директор', inputs: { days: { operator: 'gt' as const, value: 14 } }, outputs: { approver: 'director' }, priority: 1 },
          { id: 'r2', description: 'Без сохранения → HR директор', inputs: { type: { operator: 'eq' as const, value: 'unpaid' } }, outputs: { approver: 'hr_director' }, priority: 2 },
          { id: 'r3', description: 'По умолчанию → руководитель', inputs: {}, outputs: { approver: 'manager' }, priority: 3 },
        ],
        isActive: true, createdById: users.hr[0].id,
      },
      {
        workspaceId: ws.fin.id, name: 'Лимиты расходов', description: 'Определяет уровень согласования по сумме', hitPolicy: 'FIRST' as HitPolicy,
        inputColumns: [{ id: 'amount', name: 'amount', label: 'Сумма', type: 'number' as const }],
        outputColumns: [
          { id: 'level', name: 'level', label: 'Уровень', type: 'string' as const, defaultValue: 'manager' },
          { id: 'auto_approve', name: 'auto_approve', label: 'Автоодобрение', type: 'boolean' as const, defaultValue: false },
        ],
        rules: [
          { id: 'r1', description: '>500к → директор', inputs: { amount: { operator: 'gt' as const, value: 500000 } }, outputs: { level: 'director', auto_approve: false }, priority: 1 },
          { id: 'r2', description: '>100к → руководитель', inputs: { amount: { operator: 'gt' as const, value: 100000 } }, outputs: { level: 'manager', auto_approve: false }, priority: 2 },
          { id: 'r3', description: '<5к → автоодобрение', inputs: { amount: { operator: 'lt' as const, value: 5000 } }, outputs: { level: 'auto', auto_approve: true }, priority: 3 },
          { id: 'r4', description: 'По умолчанию', inputs: {}, outputs: { level: 'manager', auto_approve: false }, priority: 4 },
        ],
        isActive: true, createdById: users.finance[0].id,
      },
      {
        workspaceId: ws.po.id, name: 'Скоринг поставщиков', description: 'Оценка поставщиков по критериям', hitPolicy: 'COLLECT' as HitPolicy,
        inputColumns: [
          { id: 'delivery_time', name: 'delivery_time', label: 'Срок поставки (дни)', type: 'number' as const },
          { id: 'quality_rating', name: 'quality_rating', label: 'Рейтинг качества', type: 'number' as const },
        ],
        outputColumns: [
          { id: 'score', name: 'score', label: 'Баллы', type: 'number' as const, defaultValue: 0 },
        ],
        rules: [
          { id: 'r1', description: 'Быстрая поставка +30', inputs: { delivery_time: { operator: 'lte' as const, value: 7 } }, outputs: { score: 30 }, priority: 1 },
          { id: 'r2', description: 'Высокое качество +50', inputs: { quality_rating: { operator: 'gte' as const, value: 4 } }, outputs: { score: 50 }, priority: 2 },
          { id: 'r3', description: 'Среднее качество +20', inputs: { quality_rating: { operator: 'gte' as const, value: 3 } }, outputs: { score: 20 }, priority: 3 },
        ],
        isActive: true, createdById: users.finance[0].id,
      },
      {
        workspaceId: ws.kp.id, name: 'Квалификация сделок', description: 'Приоритизация КП по сумме и типу клиента', hitPolicy: 'RULE_ORDER' as HitPolicy,
        inputColumns: [
          { id: 'deal_amount', name: 'deal_amount', label: 'Сумма сделки', type: 'number' as const },
          { id: 'client_type', name: 'client_type', label: 'Тип клиента', type: 'string' as const },
        ],
        outputColumns: [
          { id: 'priority', name: 'priority', label: 'Приоритет', type: 'string' as const, defaultValue: 'normal' },
          { id: 'action', name: 'action', label: 'Действие', type: 'string' as const, defaultValue: 'standard' },
        ],
        rules: [
          { id: 'r1', description: 'Крупная сделка → VIP', inputs: { deal_amount: { operator: 'gte' as const, value: 5000000 } }, outputs: { priority: 'critical', action: 'vip_service' }, priority: 1 },
          { id: 'r2', description: 'Госзаказчик → приоритет', inputs: { client_type: { operator: 'eq' as const, value: 'government' } }, outputs: { priority: 'high', action: 'government_process' }, priority: 2 },
          { id: 'r3', description: 'Средняя сделка', inputs: { deal_amount: { operator: 'gte' as const, value: 1000000 } }, outputs: { priority: 'medium', action: 'standard' }, priority: 3 },
          { id: 'r4', description: 'Стандарт', inputs: {}, outputs: { priority: 'normal', action: 'standard' }, priority: 4 },
        ],
        isActive: true, createdById: users.commercial[0].id,
      },
    ]);
  }

  // ──── AUTOMATION RULES (6) ────

  private async createAutomationRules(ws: Workspaces, users: UsersByDept) {
    await this.automationRepo.save([
      { name: 'Уведомление HR о новой заявке', workspaceId: ws.otp.id, trigger: 'on_create' as any, conditions: [], actions: [{ type: 'send_notification' as any, config: { recipientMode: 'all_workspace_members', message: 'Подана новая заявка на отпуск' } }], isActive: true, priority: 0, createdById: users.hr[0].id },
      { name: 'Автоназначение бюджетного контролёра', workspaceId: ws.fin.id, trigger: 'on_create' as any, conditions: [], actions: [{ type: 'set_field' as any, config: { field: 'status', value: 'budget_check' } }], isActive: true, priority: 0, createdById: users.finance[0].id },
      { name: 'Уведомление о крупном расходе', workspaceId: ws.fin.id, trigger: 'on_create' as any, conditions: [{ field: 'data.amount', operator: 'greater_than' as any, value: 100000 }], actions: [{ type: 'send_notification' as any, config: { recipientMode: 'all_workspace_members', message: '⚠️ Расход >100к — требует внимания' } }], isActive: true, priority: 1, createdById: users.finance[0].id },
      { name: 'Автостатус новой закупки', workspaceId: ws.po.id, trigger: 'on_create' as any, conditions: [], actions: [{ type: 'set_field' as any, config: { field: 'status', value: 'review' } }], isActive: true, priority: 0, createdById: users.finance[0].id },
      { name: 'Уведомление о выигранном КП', workspaceId: ws.kp.id, trigger: 'on_status_change' as any, triggerConfig: { toStatus: 'won' }, conditions: [], actions: [{ type: 'send_notification' as any, config: { recipientMode: 'all_workspace_members', message: '🎉 КП выиграно!' } }], isActive: true, priority: 0, createdById: users.commercial[0].id },
      { name: 'DMN квалификация КП', workspaceId: ws.kp.id, trigger: 'on_create' as any, conditions: [], actions: [{ type: 'evaluate_dmn' as any, config: { inputMapping: { deal_amount: 'data.deal_amount' }, applyOutputToEntity: true } }], isActive: true, priority: 1, createdById: users.commercial[0].id },
    ] as any);
  }

  // ──── ENTITIES (~140) ────

  private async createAllEntities(ws: Workspaces, users: UsersByDept): Promise<EntitiesByWs> {
    const hr = users.hr;
    const fin = users.finance;
    const com = users.commercial;

    // ═══ OTP — Отпуска (35) ═══
    const otpActive: Partial<WorkspaceEntity>[] = [
      { customId: 'OTP-1', title: 'Ежегодный отпуск — Калинин М.А.', status: 'pending', data: { type: 'annual', days_count: 14, reason: 'Плановый ежегодный отпуск' }, createdAt: hoursAgo(3) },
      { customId: 'OTP-2', title: 'Больничный — Лаврова О.В.', status: 'pending', data: { type: 'sick', days_count: 5 }, createdAt: hoursAgo(6) },
      { customId: 'OTP-3', title: 'Учебный отпуск — Осипов В.К.', status: 'pending', data: { type: 'study', days_count: 10, reason: 'Сессия в университете' }, createdAt: hoursAgo(12) },
      { customId: 'OTP-4', title: 'Без сохранения — Степанова К.Р.', status: 'pending', priority: 'high', data: { type: 'unpaid', days_count: 3, reason: 'Семейные обстоятельства' }, createdAt: hoursAgo(1) },
      { customId: 'OTP-5', title: 'Ежегодный отпуск — Тарасов В.М.', status: 'pending_approval', assigneeId: hr[2].id, data: { type: 'annual', days_count: 21, reason: 'Отдых с семьёй' }, createdAt: daysAgo(1), firstResponseAt: hoursAgo(20) },
      { customId: 'OTP-6', title: 'Больничный — Филиппов Е.С.', status: 'pending_approval', assigneeId: hr[3].id, data: { type: 'sick', days_count: 7 }, createdAt: daysAgo(1), firstResponseAt: hoursAgo(18) },
      { customId: 'OTP-7', title: 'Ежегодный отпуск — Русаков А.Л.', status: 'pending_approval', assigneeId: hr[2].id, data: { type: 'annual', days_count: 14 }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'OTP-8', title: 'Учебный отпуск — Ульянова Д.А.', status: 'pending_approval', assigneeId: hr[4].id, data: { type: 'study', days_count: 14, reason: 'Дипломная работа' }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'OTP-9', title: 'Ежегодный отпуск — Горбунов П.В.', status: 'approved', assigneeId: hr[3].id, data: { type: 'annual', days_count: 7, reason: 'Короткий отпуск' }, createdAt: daysAgo(5), firstResponseAt: daysAgo(4) },
      { customId: 'OTP-10', title: 'Ежегодный отпуск — Дмитриева А.А.', status: 'approved', assigneeId: hr[5].id, data: { type: 'annual', days_count: 14 }, createdAt: daysAgo(4), firstResponseAt: daysAgo(3) },
      { customId: 'OTP-11', title: 'Больничный — Ефимов Р.Н.', status: 'approved', assigneeId: hr[6].id, data: { type: 'sick', days_count: 10 }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'OTP-12', title: 'Без сохранения — Жукова С.П.', status: 'rejected', assigneeId: hr[2].id, data: { type: 'unpaid', days_count: 5, reason: 'Личные дела' }, createdAt: daysAgo(6), firstResponseAt: daysAgo(5), resolvedAt: daysAgo(4) },
      { customId: 'OTP-13', title: 'Учебный отпуск — Воронов А.С.', status: 'rejected', assigneeId: hr[4].id, data: { type: 'study', days_count: 30, reason: 'Длительное обучение' }, createdAt: daysAgo(8), firstResponseAt: daysAgo(7), resolvedAt: daysAgo(5) },
      { customId: 'OTP-14', title: 'Ежегодный отпуск — Макаров Д.К.', status: 'in_progress', assigneeId: hr[3].id, data: { type: 'annual', days_count: 14 }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9) },
      { customId: 'OTP-15', title: 'Больничный — Назарова Ю.Е.', status: 'in_progress', assigneeId: hr[5].id, data: { type: 'sick', days_count: 7 }, createdAt: daysAgo(5), firstResponseAt: daysAgo(4) },
      { customId: 'OTP-16', title: 'Ежегодный отпуск — Исаева Е.В.', status: 'in_progress', assigneeId: hr[6].id, data: { type: 'annual', days_count: 21 }, createdAt: daysAgo(7), firstResponseAt: daysAgo(6) },
      { customId: 'OTP-17', title: 'Без сохранения — Полякова А.Р.', status: 'in_progress', assigneeId: hr[2].id, data: { type: 'unpaid', days_count: 2 }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'OTP-18', title: 'Ежегодный отпуск — Захаров А.П.', status: 'in_progress', assigneeId: hr[4].id, data: { type: 'annual', days_count: 7 }, createdAt: daysAgo(4), firstResponseAt: daysAgo(3) },
    ];
    const otpCompletedTitles = [
      'Ежегодный отпуск — Андреев А.С. (14 дн.)', 'Больничный — Власова О.Н. (5 дн.)',
      'Ежегодный отпуск — Кириллов П.Е. (7 дн.)', 'Без сохранения — Григорьев М.В. (3 дн.)',
      'Учебный отпуск — Фёдоров Д.А. (10 дн.)', 'Ежегодный отпуск — Романова Т.С. (21 дн.)',
      'Больничный — Соловьёв И.К. (7 дн.)', 'Ежегодный отпуск — Павлова Е.М. (14 дн.)',
      'Без сохранения — Миронов А.А. (2 дн.)', 'Ежегодный отпуск — Егорова Л.П. (7 дн.)',
      'Больничный — Тимофеев С.Г. (14 дн.)', 'Ежегодный отпуск — Данилов В.О. (21 дн.)',
      'Учебный отпуск — Зайцева А.М. (10 дн.)', 'Ежегодный отпуск — Сорокин Н.В. (14 дн.)',
      'Больничный — Комарова Е.К. (3 дн.)', 'Ежегодный отпуск — Лебедева О.С. (7 дн.)',
      'Без сохранения — Петухов В.А. (5 дн.)',
    ];
    const otpCompleted = otpCompletedTitles.map((title, i) => ({
      customId: `OTP-${19 + i}`, title, status: 'completed',
      assigneeId: hr[(i % 5) + 2].id,
      data: { type: pick(['annual', 'sick', 'study', 'unpaid']), days_count: rnd(3, 21) },
      createdAt: daysAgo(20 + i * 4), resolvedAt: daysAgo(5 + i * 3),
    }));
    const otpEntities = await this.entityRepo.save(
      [...otpActive, ...otpCompleted].map(e => ({ ...e, workspaceId: ws.otp.id })),
    );

    // ═══ FIN — Согласование расходов (35) ═══
    const finActive: Partial<WorkspaceEntity>[] = [
      { customId: 'FIN-1', title: 'Канцтовары для офиса — май', status: 'new', data: { category: 'office', amount: 15000, justification: 'Ежемесячное пополнение запасов' }, createdAt: hoursAgo(2) },
      { customId: 'FIN-2', title: 'Командировка в Москву — Калинин', status: 'new', priority: 'medium', data: { category: 'travel', amount: 45000, justification: 'Встреча с клиентом ПАО Газпром' }, createdAt: hoursAgo(5) },
      { customId: 'FIN-3', title: 'Закупка мониторов (5 шт.)', status: 'new', data: { category: 'equipment', amount: 125000, justification: 'Обновление рабочих мест отдела продаж' }, createdAt: hoursAgo(8) },
      { customId: 'FIN-4', title: 'Реклама в LinkedIn', status: 'new', data: { category: 'marketing', amount: 80000, justification: 'Продвижение на зарубежный рынок' }, createdAt: hoursAgo(12) },
      { customId: 'FIN-5', title: 'Курс повышения квалификации — Осипов', status: 'budget_check', assigneeId: fin[6].id, data: { category: 'training', amount: 65000 }, createdAt: daysAgo(1), firstResponseAt: hoursAgo(20) },
      { customId: 'FIN-6', title: 'Аренда конференц-зала', status: 'budget_check', assigneeId: fin[6].id, data: { category: 'office', amount: 35000 }, createdAt: daysAgo(1), firstResponseAt: hoursAgo(16) },
      { customId: 'FIN-7', title: 'Командировка в СПб — Лаврова', status: 'budget_check', assigneeId: fin[2].id, data: { category: 'travel', amount: 55000 }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'FIN-8', title: 'Закупка ноутбука для нового сотрудника', status: 'pending_approval', assigneeId: fin[3].id, data: { category: 'equipment', amount: 95000 }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'FIN-9', title: 'Подписка на CRM систему (год)', status: 'pending_approval', assigneeId: fin[4].id, data: { category: 'equipment', amount: 240000 }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'FIN-10', title: 'Корпоратив — день рождения компании', status: 'pending_approval', assigneeId: fin[2].id, data: { category: 'office', amount: 180000 }, createdAt: daysAgo(4), firstResponseAt: daysAgo(3) },
      { customId: 'FIN-11', title: 'Обновление серверного ПО', status: 'pending_approval', priority: 'high', assigneeId: fin[5].id, data: { category: 'equipment', amount: 450000, justification: 'Критическое обновление безопасности' }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'FIN-12', title: 'Закупка промышленного 3D-принтера', status: 'director_approval', priority: 'high', assigneeId: fin[0].id, data: { category: 'equipment', amount: 850000, justification: 'Для прототипирования деталей' }, createdAt: daysAgo(5), firstResponseAt: daysAgo(4) },
      { customId: 'FIN-13', title: 'Участие в выставке EMO 2026', status: 'director_approval', priority: 'high', assigneeId: fin[0].id, data: { category: 'marketing', amount: 1200000 }, createdAt: daysAgo(6), firstResponseAt: daysAgo(5) },
      { customId: 'FIN-14', title: 'Расширение офиса — аренда', status: 'approved', assigneeId: fin[1].id, data: { category: 'office', amount: 350000, justification: 'Дополнительные площади для нового отдела' }, createdAt: daysAgo(8), firstResponseAt: daysAgo(7) },
      { customId: 'FIN-15', title: 'Командировка в Ганновер — Захаров', status: 'approved', assigneeId: fin[3].id, data: { category: 'travel', amount: 180000 }, createdAt: daysAgo(7), firstResponseAt: daysAgo(6) },
      { customId: 'FIN-16', title: 'Закупка офисной мебели', status: 'approved', assigneeId: fin[4].id, data: { category: 'office', amount: 220000 }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9) },
      { customId: 'FIN-17', title: 'Сертификация ISO 9001', status: 'rejected', assigneeId: fin[5].id, data: { category: 'training', amount: 500000 }, createdAt: daysAgo(12), firstResponseAt: daysAgo(11), resolvedAt: daysAgo(8) },
      { customId: 'FIN-18', title: 'Дорогой тимбилдинг на Мальдивах', status: 'rejected', assigneeId: fin[2].id, data: { category: 'office', amount: 2000000 }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9), resolvedAt: daysAgo(7) },
    ];
    const finPaidTitles = [
      'Канцтовары — март', 'Командировка в Екб — Петров', 'Подписка Jira Cloud',
      'Замена стульев (10 шт.)', 'Обучение менеджеров MBA', 'Командировка в Казань',
      'Оплата хостинга', 'Канцтовары — апрель', 'Конференция BPMN Summit',
      'Командировка в Новосибирск', 'Лицензии Microsoft 365', 'Ремонт кондиционера',
      'Страхование оборудования', 'Подписка на аналитику', 'Командировка в Минск',
      'Обновление антивируса', 'Печать каталогов',
    ];
    const finPaid = finPaidTitles.map((title, i) => ({
      customId: `FIN-${19 + i}`, title, status: 'paid',
      assigneeId: fin[(i % 5) + 2].id,
      data: { category: pick(['office', 'travel', 'equipment', 'marketing', 'training']), amount: rnd(5000, 200000) },
      createdAt: daysAgo(15 + i * 4), resolvedAt: daysAgo(3 + i * 3),
    }));
    const finEntities = await this.entityRepo.save(
      [...finActive, ...finPaid].map(e => ({ ...e, workspaceId: ws.fin.id })),
    );

    // ═══ PO — Закупки (35) ═══
    const poActive: Partial<WorkspaceEntity>[] = [
      { customId: 'PO-1', title: 'Серводвигатель Fanuc αiF 22/3000', status: 'new', priority: 'high', data: { total_amount: 450000, specifications: 'Для замены на станке Okuma MA-600' }, createdAt: hoursAgo(4) },
      { customId: 'PO-2', title: 'Фрезы HPC для стали (50 шт.)', status: 'new', data: { total_amount: 85000, specifications: 'Sandvik Coromant R390-11T308M-PM' }, createdAt: hoursAgo(8) },
      { customId: 'PO-3', title: 'Масло Mobil DTE 25 (200 л)', status: 'new', data: { total_amount: 42000, specifications: 'Для гидростанций станков' }, createdAt: daysAgo(1) },
      { customId: 'PO-4', title: 'Подшипники SKF для шпинделя', status: 'review', assigneeId: fin[4].id, data: { total_amount: 320000, specifications: 'SKF 7020 ACD/P4A — 4 шт.' }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'PO-5', title: 'Кабель Profinet (500 м)', status: 'review', assigneeId: fin[5].id, data: { total_amount: 65000 }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'PO-6', title: 'Датчик температуры Renishaw', status: 'review', assigneeId: fin[4].id, data: { total_amount: 180000, specifications: 'RMP600 + receiver' }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'PO-7', title: 'Блок питания Siemens 6SL3210', status: 'budget_check', assigneeId: fin[6].id, data: { total_amount: 280000 }, createdAt: daysAgo(4), firstResponseAt: daysAgo(3) },
      { customId: 'PO-8', title: 'Фильтры охлаждения (комплект)', status: 'budget_check', assigneeId: fin[6].id, data: { total_amount: 35000 }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'PO-9', title: 'Энкодер Heidenhain ERN 1387', status: 'approved', assigneeId: fin[4].id, data: { total_amount: 210000, supplier_name: 'Heidenhain GmbH' }, createdAt: daysAgo(6), firstResponseAt: daysAgo(5) },
      { customId: 'PO-10', title: 'Реле защиты ABB (5 шт.)', status: 'approved', assigneeId: fin[5].id, data: { total_amount: 45000, supplier_name: 'ABB Russia' }, createdAt: daysAgo(5), firstResponseAt: daysAgo(4) },
      { customId: 'PO-11', title: 'Пластины Sandvik твёрдосплавные', status: 'supplier_selected', assigneeId: fin[4].id, data: { total_amount: 156000, supplier_name: 'Sandvik Coromant' }, createdAt: daysAgo(8), firstResponseAt: daysAgo(7) },
      { customId: 'PO-12', title: 'Уплотнения для гидроцилиндра', status: 'supplier_selected', assigneeId: fin[5].id, data: { total_amount: 28000, supplier_name: 'Parker Hannifin' }, createdAt: daysAgo(7), firstResponseAt: daysAgo(6) },
      { customId: 'PO-13', title: 'Насос СОЖ Grundfos', status: 'ordered', assigneeId: fin[4].id, data: { total_amount: 95000, supplier_name: 'Grundfos', contract_number: 'GF-2026-0412' }, createdAt: daysAgo(12), firstResponseAt: daysAgo(11) },
      { customId: 'PO-14', title: 'Направляющие THK (комплект)', status: 'ordered', assigneeId: fin[5].id, data: { total_amount: 380000, supplier_name: 'THK Japan', contract_number: 'THK-2026-088' }, createdAt: daysAgo(14), firstResponseAt: daysAgo(13) },
      { customId: 'PO-15', title: 'Электрошкаф Rittal', status: 'ordered', assigneeId: fin[4].id, data: { total_amount: 120000, supplier_name: 'Rittal GmbH', contract_number: 'RT-2026-215' }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9) },
      { customId: 'PO-16', title: 'ПЛК Siemens S7-1500', status: 'received', assigneeId: fin[5].id, data: { total_amount: 260000, supplier_name: 'Siemens', contract_number: 'SM-2026-0073' }, createdAt: daysAgo(18), firstResponseAt: daysAgo(17) },
      { customId: 'PO-17', title: 'Инвертор Mitsubishi FR-A800', status: 'received', assigneeId: fin[4].id, data: { total_amount: 175000, supplier_name: 'Mitsubishi Electric' }, createdAt: daysAgo(16), firstResponseAt: daysAgo(15) },
      { customId: 'PO-18', title: 'Шариковинтовая пара (SFU2005)', status: 'rejected', assigneeId: fin[6].id, data: { total_amount: 520000 }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9), resolvedAt: daysAgo(7) },
      { customId: 'PO-19', title: 'Промышленный пылесос Kärcher', status: 'rejected', assigneeId: fin[5].id, data: { total_amount: 180000 }, createdAt: daysAgo(12), firstResponseAt: daysAgo(11), resolvedAt: daysAgo(9) },
      { customId: 'PO-20', title: 'Станок EDM (отклонён по бюджету)', status: 'rejected', priority: 'high', assigneeId: fin[0].id, data: { total_amount: 3500000 }, createdAt: daysAgo(15), firstResponseAt: daysAgo(14), resolvedAt: daysAgo(10) },
    ];
    const poCompletedTitles = [
      'Твёрдосплавные свёрла Dormer', 'Муфта BK2 для шпинделя', 'Смазка Kluber Isoflex',
      'Пневмоцилиндр Festo', 'Теплообменник для СОЖ', 'Индуктивный датчик Balluff',
      'Гидроаккумулятор Bosch Rexroth', 'Ремень ГРМ Gates', 'Контактор Schneider',
      'Вентилятор охлаждения шкафа', 'Манометр WIKA', 'Термопара тип K (10 шт.)',
      'Шланг высокого давления', 'Предохранитель ABB (комплект)', 'Патрон токарный Kitagawa',
    ];
    const poCompleted = poCompletedTitles.map((title, i) => ({
      customId: `PO-${21 + i}`, title, status: 'completed',
      assigneeId: fin[(i % 3) + 4].id,
      data: { total_amount: rnd(10000, 300000), supplier_name: pick(['Fanuc', 'Siemens', 'ABB', 'SKF', 'Sandvik', 'THK']) },
      createdAt: daysAgo(25 + i * 4), resolvedAt: daysAgo(8 + i * 3),
    }));
    const poEntities = await this.entityRepo.save(
      [...poActive, ...poCompleted].map(e => ({ ...e, workspaceId: ws.po.id })),
    );

    // ═══ KP — Коммерческие предложения (35) ═══
    const kpActive: Partial<WorkspaceEntity>[] = [
      { customId: 'KP-1', title: 'КП для ООО "ТехноПром" — токарные станки', status: 'draft', data: { deal_amount: 2500000, customer: 'ООО "ТехноПром"', description: 'Поставка 2 токарных станков с ЧПУ' }, createdAt: hoursAgo(4) },
      { customId: 'KP-2', title: 'КП для АО "МашЭкспорт" — фрезерный центр', status: 'draft', data: { deal_amount: 4800000, customer: 'АО "МашЭкспорт"' }, createdAt: hoursAgo(8) },
      { customId: 'KP-3', title: 'КП для ИП Сидоров — мини-станок', status: 'draft', data: { deal_amount: 650000, customer: 'ИП Сидоров' }, createdAt: daysAgo(1) },
      { customId: 'KP-4', title: 'КП для ПАО "Ростех" — автоматизация', status: 'draft', priority: 'high', data: { deal_amount: 12000000, customer: 'ПАО "Ростех"' }, createdAt: hoursAgo(2) },
      { customId: 'KP-5', title: 'КП для ООО "МеталлГрупп" — 5-осевой', status: 'pending', assigneeId: com[2].id, data: { deal_amount: 8500000, customer: 'ООО "МеталлГрупп"' }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'KP-6', title: 'КП для АО "Калашников" — обработка', status: 'pending', assigneeId: com[3].id, data: { deal_amount: 6200000, customer: 'АО "Калашников"' }, createdAt: daysAgo(3), firstResponseAt: daysAgo(2) },
      { customId: 'KP-7', title: 'КП для ОАО "Уралмаш" — модернизация', status: 'pending', priority: 'high', assigneeId: com[4].id, data: { deal_amount: 15000000, customer: 'ОАО "Уралмаш"' }, createdAt: daysAgo(2), firstResponseAt: daysAgo(1) },
      { customId: 'KP-8', title: 'КП для ООО "Сервис+" — обслуживание', status: 'pending', assigneeId: com[5].id, data: { deal_amount: 1200000, customer: 'ООО "Сервис+"' }, createdAt: daysAgo(4), firstResponseAt: daysAgo(3) },
      { customId: 'KP-9', title: 'КП для АО "Вертолёты России" — обработка', status: 'approved', assigneeId: com[2].id, data: { deal_amount: 9800000, customer: 'АО "Вертолёты России"' }, createdAt: daysAgo(6), firstResponseAt: daysAgo(5) },
      { customId: 'KP-10', title: 'КП для ООО "ПромТехСервис" — токарный', status: 'approved', assigneeId: com[3].id, data: { deal_amount: 3200000, customer: 'ООО "ПромТехСервис"' }, createdAt: daysAgo(5), firstResponseAt: daysAgo(4) },
      { customId: 'KP-11', title: 'КП для ПАО "ОАК" — прецизионная обработка', status: 'approved', priority: 'high', assigneeId: com[4].id, data: { deal_amount: 18000000, customer: 'ПАО "ОАК"' }, createdAt: daysAgo(7), firstResponseAt: daysAgo(6) },
      { customId: 'KP-12', title: 'КП для ООО "Лёгкие Металлы" — литьё', status: 'rejected', assigneeId: com[5].id, data: { deal_amount: 2100000, customer: 'ООО "Лёгкие Металлы"' }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9), resolvedAt: daysAgo(7) },
      { customId: 'KP-13', title: 'КП для ИП Козлов — гравировка', status: 'rejected', assigneeId: com[2].id, data: { deal_amount: 450000, customer: 'ИП Козлов' }, createdAt: daysAgo(8), firstResponseAt: daysAgo(7), resolvedAt: daysAgo(5) },
      { customId: 'KP-14', title: 'КП для АО "СтанкоЛизинг" — лизинг', status: 'sent_to_client', assigneeId: com[3].id, data: { deal_amount: 5500000, customer: 'АО "СтанкоЛизинг"' }, createdAt: daysAgo(8), firstResponseAt: daysAgo(7) },
      { customId: 'KP-15', title: 'КП для ООО "АвиаДеталь" — сервис', status: 'sent_to_client', assigneeId: com[4].id, data: { deal_amount: 3800000, customer: 'ООО "АвиаДеталь"' }, createdAt: daysAgo(9), firstResponseAt: daysAgo(8) },
      { customId: 'KP-16', title: 'КП для ПАО "КамАЗ" — линия обработки', status: 'sent_to_client', priority: 'high', assigneeId: com[5].id, data: { deal_amount: 22000000, customer: 'ПАО "КамАЗ"' }, createdAt: daysAgo(6), firstResponseAt: daysAgo(5) },
      { customId: 'KP-17', title: 'КП для АО "Туполев" — титан', status: 'sent_to_client', assigneeId: com[2].id, data: { deal_amount: 7600000, customer: 'АО "Туполев"' }, createdAt: daysAgo(10), firstResponseAt: daysAgo(9) },
    ];
    const kpWonTitles = [
      'КП для ПАО "Газпром" — станки ЧПУ', 'КП для АО "Росатом" — центры',
      'КП для ООО "Сибур" — модернизация', 'КП для АО "Алроса" — оборудование',
      'КП для ПАО "НЛМК" — автоматизация', 'КП для ООО "Норникель" — сервис',
    ];
    const kpLostTitles = [
      'КП для ОАО "РЖД" — диагностика', 'КП для ООО "Лукойл" — насосы',
      'КП для АО "Северсталь" — прокат', 'КП для ПАО "ОМК" — трубопрокат',
      'КП для ООО "Евраз" — конвейеры', 'КП для АО "ЧТПЗ" — токарные',
    ];
    const kpWon = kpWonTitles.map((title, i) => ({
      customId: `KP-${18 + i}`, title, status: 'won',
      assigneeId: com[(i % 4) + 2].id,
      data: { deal_amount: rnd(3000000, 15000000), customer: title.split(' — ')[0].replace('КП для ', '') },
      createdAt: daysAgo(20 + i * 5), resolvedAt: daysAgo(5 + i * 3),
    }));
    const kpLost = kpLostTitles.map((title, i) => ({
      customId: `KP-${24 + i}`, title, status: 'lost',
      assigneeId: com[(i % 4) + 2].id,
      data: { deal_amount: rnd(2000000, 10000000), customer: title.split(' — ')[0].replace('КП для ', '') },
      createdAt: daysAgo(25 + i * 5), resolvedAt: daysAgo(10 + i * 3),
    }));
    const kpMore = [
      ...['Ежегодный сервисный контракт — ВСМПО', 'КП для АО "ОДК" — турбинные лопатки', 'КП для ПАО "Мечел" — прутки',
        'КП для ООО "Полиметалл" — дробилки', 'КП для АО "ТВЭЛ" — ядерные компоненты', 'КП для ПАО "Силовые машины" — генераторы'].map((title, i) => ({
        customId: `KP-${30 + i}`, title, status: pick(['won', 'lost']),
        assigneeId: com[(i % 4) + 2].id,
        data: { deal_amount: rnd(5000000, 20000000), customer: title.split(' — ')[0].replace('КП для ', '') },
        createdAt: daysAgo(35 + i * 6), resolvedAt: daysAgo(15 + i * 4),
      })),
    ];
    const kpEntities = await this.entityRepo.save(
      [...kpActive, ...kpWon, ...kpLost, ...kpMore].map(e => ({ ...e, workspaceId: ws.kp.id })),
    );

    return { otp: otpEntities, fin: finEntities, po: poEntities, kp: kpEntities };
  }

  // ──── COMMENTS (~80) ────

  private async createComments(entities: EntitiesByWs, users: UsersByDept) {
    const comments: Partial<Comment>[] = [];
    const msgs = {
      started: 'Принято в работу. Начинаю обработку.',
      progress: 'Продвигается. Ожидаю ответа от коллег.',
      waiting: 'Ожидаю дополнительную информацию.',
      approved: 'Одобрено. Перехожу к следующему шагу.',
      rejected: 'К сожалению, заявка отклонена. Причина указана в карточке.',
      resolved: 'Выполнено. Проверьте результат.',
    };

    const addComments = (ents: WorkspaceEntity[], team: User[]) => {
      const active = ents.filter(e => !['completed', 'paid', 'won', 'lost'].includes(e.status));
      for (const e of active.slice(0, 12)) {
        comments.push({
          entityId: e.id, authorId: e.assigneeId || pick(team).id,
          content: pick(Object.values(msgs)),
          createdAt: new Date(e.createdAt.getTime() + rnd(3600000, 86400000)),
        });
        if (['in_progress', 'approved', 'pending_approval', 'director_approval', 'review', 'ordered'].includes(e.status)) {
          comments.push({
            entityId: e.id, authorId: pick(team).id,
            content: pick(['Проверил, всё корректно.', 'Согласовано с руководством.', 'Нужно уточнить детали.', 'Жду подтверждения от контрагента.']),
            createdAt: new Date(e.createdAt.getTime() + rnd(86400000, 172800000)),
          });
        }
      }
    };

    addComments(entities.otp, users.hr);
    addComments(entities.fin, users.finance);
    addComments(entities.po, users.finance);
    addComments(entities.kp, users.commercial);

    if (comments.length > 0) await this.commentRepo.save(comments);
  }

  // ──── SLA INSTANCES ────

  private async createSlaInstances(
    ws: Workspaces, entities: EntitiesByWs,
    slaDefs: { otp: SlaDefinition[]; fin: SlaDefinition[]; po: SlaDefinition[]; kp: SlaDefinition[] },
  ) {
    const now = new Date();
    const instances: Partial<SlaInstance>[] = [];

    const createForWs = (
      wsId: string, ents: WorkspaceEntity[], defs: SlaDefinition[],
      activeStatuses: string[], resolvedStatuses: string[],
    ) => {
      const baseDef = defs[0]; // standard SLA
      for (const e of ents) {
        const def = e.priority === 'high' && defs[1] ? defs[1] : baseDef;
        const isActive = activeStatuses.includes(e.status);
        const isResolved = resolvedStatuses.includes(e.status);

        const responseDueAt = new Date(e.createdAt);
        responseDueAt.setMinutes(responseDueAt.getMinutes() + (def.responseTime || 240));
        const resolutionDueAt = new Date(e.createdAt);
        resolutionDueAt.setMinutes(resolutionDueAt.getMinutes() + (def.resolutionTime || 1440));

        const responseStatus: SlaStatus = e.firstResponseAt
          ? (e.firstResponseAt <= responseDueAt ? 'met' : 'breached')
          : (isActive && now > responseDueAt ? 'breached' : 'pending');
        const resolutionStatus: SlaStatus = e.resolvedAt
          ? (e.resolvedAt <= resolutionDueAt ? 'met' : 'breached')
          : (isActive && now > resolutionDueAt ? 'breached' : 'pending');

        instances.push({
          slaDefinitionId: def.id, workspaceId: wsId,
          targetType: 'entity' as SlaTargetType, targetId: e.id,
          responseDueAt, resolutionDueAt,
          firstResponseAt: e.firstResponseAt || undefined,
          resolvedAt: isResolved ? (e.resolvedAt || undefined) : undefined,
          responseStatus, resolutionStatus,
          isPaused: false,
          currentEscalationLevel: responseStatus === 'breached' ? 1 : 0,
        });
      }
    };

    createForWs(ws.otp.id, entities.otp, slaDefs.otp,
      ['pending', 'pending_approval', 'approved', 'in_progress'], ['completed', 'rejected']);
    createForWs(ws.fin.id, entities.fin, slaDefs.fin,
      ['new', 'budget_check', 'pending_approval', 'director_approval', 'approved'], ['paid', 'rejected']);
    createForWs(ws.po.id, entities.po, slaDefs.po,
      ['new', 'review', 'budget_check', 'approved', 'supplier_selected', 'ordered', 'received'], ['completed', 'rejected']);
    createForWs(ws.kp.id, entities.kp, slaDefs.kp,
      ['draft', 'pending', 'approved', 'sent_to_client'], ['won', 'lost', 'rejected']);

    if (instances.length > 0) await this.slaInstRepo.save(instances);
  }

  // ──── REAL ZEEBE PROCESSES ────

  private async startRealProcesses(
    ws: Workspaces, entities: EntitiesByWs,
    pd: { vacation: ProcessDefinition; expense: ProcessDefinition; purchase: ProcessDefinition; simple: ProcessDefinition },
    users: UsersByDept,
  ) {
    const batchSize = 10;
    const delayMs = 200;

    const startForWorkspace = async (
      ents: WorkspaceEntity[],
      def: ProcessDefinition,
      startedById: string,
      variableMapper: (e: WorkspaceEntity) => Record<string, any>,
    ): Promise<number> => {
      let count = 0;
      for (let i = 0; i < ents.length; i += batchSize) {
        const batch = ents.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (e) => {
            try {
              await this.bpmnService.startProcess(def.id, variableMapper(e), {
                entityId: e.id,
                businessKey: e.customId,
                startedById,
              });
              count++;
            } catch (err) {
              this.logger.warn(`Failed to start process for ${e.customId}: ${err.message}`);
            }
          }),
        );
        if (i + batchSize < ents.length) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      return count;
    };

    const otpCount = await startForWorkspace(
      entities.otp, pd.vacation, users.hr[0].id,
      (e) => ({ entityId: e.id, title: e.title }),
    );
    const finCount = await startForWorkspace(
      entities.fin, pd.expense, users.finance[0].id,
      (e) => ({ entityId: e.id, title: e.title, amount: (e.data as any)?.amount }),
    );
    const poCount = await startForWorkspace(
      entities.po, pd.purchase, users.finance[0].id,
      (e) => ({ entityId: e.id, title: e.title, total_amount: (e.data as any)?.total_amount }),
    );
    const kpCount = await startForWorkspace(
      entities.kp, pd.simple, users.commercial[0].id,
      (e) => ({ entityId: e.id, title: e.title, deal_amount: (e.data as any)?.deal_amount }),
    );

    this.logger.log(`  Started ${otpCount + finCount + poCount + kpCount} real Zeebe processes`);
  }

  // ──── ENTITY LINKS (15) ────

  private async createEntityLinks(entities: EntitiesByWs, creator: User) {
    const links: Partial<EntityLink>[] = [];
    const otp = entities.otp;
    const fin = entities.fin;
    const po = entities.po;
    const kp = entities.kp;

    // OTP → FIN: отпуск → командировочные расходы
    if (otp[4] && fin[1]) links.push({ sourceEntityId: otp[4].id, targetEntityId: fin[1].id, linkType: EntityLinkType.RELATED, metadata: { reason: 'Отпуск связан с командировочными расходами' }, createdById: creator.id });
    if (otp[13] && fin[5]) links.push({ sourceEntityId: otp[13].id, targetEntityId: fin[5].id, linkType: EntityLinkType.RELATED, metadata: { reason: 'Отпуск + командировка' }, createdById: creator.id });

    // FIN → PO: расход порождает закупку (PARENT/CHILD)
    if (fin[7] && po[0]) links.push({ sourceEntityId: fin[7].id, targetEntityId: po[0].id, linkType: EntityLinkType.PARENT, metadata: { reason: 'Расход на оборудование → закупка' }, createdById: creator.id });
    if (po[0] && fin[7]) links.push({ sourceEntityId: po[0].id, targetEntityId: fin[7].id, linkType: EntityLinkType.CHILD, metadata: { reason: 'Закупка из расхода' }, createdById: creator.id });

    // KP → PO: выигранное КП приводит к закупке (SPAWNED)
    if (kp.length > 17 && po[8]) links.push({ sourceEntityId: kp[17].id, targetEntityId: po[8].id, linkType: EntityLinkType.SPAWNED, metadata: { reason: 'Выигранное КП → закупка комплектующих' }, createdById: creator.id });
    if (kp.length > 18 && po[9]) links.push({ sourceEntityId: kp[18].id, targetEntityId: po[9].id, linkType: EntityLinkType.SPAWNED, metadata: { reason: 'КП → закупка по контракту' }, createdById: creator.id });

    // PO blocks PO (внутри workspace)
    if (po[6] && po[12]) links.push({ sourceEntityId: po[6].id, targetEntityId: po[12].id, linkType: EntityLinkType.BLOCKS, metadata: { reason: 'Бюджет блокирует заказ' }, createdById: creator.id });
    if (po[12] && po[6]) links.push({ sourceEntityId: po[12].id, targetEntityId: po[6].id, linkType: EntityLinkType.BLOCKED_BY, metadata: { reason: 'Заказ заблокирован бюджетом' }, createdById: creator.id });

    // Duplicates
    if (fin[0] && fin.length > 18) links.push({ sourceEntityId: fin[0].id, targetEntityId: fin[18].id, linkType: EntityLinkType.DUPLICATE, metadata: { reason: 'Похожий расход на канцтовары' }, createdById: creator.id });

    // More RELATED
    if (kp[4] && fin[11]) links.push({ sourceEntityId: kp[4].id, targetEntityId: fin[11].id, linkType: EntityLinkType.RELATED, metadata: { reason: 'КП и расход на выставку' }, createdById: creator.id });
    if (po[3] && po[10]) links.push({ sourceEntityId: po[3].id, targetEntityId: po[10].id, linkType: EntityLinkType.RELATED, metadata: { reason: 'Подшипники для того же станка' }, createdById: creator.id });
    if (otp[8] && otp[14]) links.push({ sourceEntityId: otp[8].id, targetEntityId: otp[14].id, linkType: EntityLinkType.RELATED, metadata: { reason: 'Замена сотрудника на время отпуска' }, createdById: creator.id });

    // KP → FIN: КП порождает расход на подготовку
    if (kp[6] && fin[12]) links.push({ sourceEntityId: kp[6].id, targetEntityId: fin[12].id, linkType: EntityLinkType.SPAWNED, metadata: { reason: 'Крупное КП → расход на подготовку' }, createdById: creator.id });

    const validLinks = links.filter(l => l.sourceEntityId && l.targetEntityId);
    if (validLinks.length > 0) await this.linkRepo.save(validLinks);
  }

}
