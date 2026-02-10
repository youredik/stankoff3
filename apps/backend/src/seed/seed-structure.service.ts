import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../modules/user/user.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from '../modules/workspace/workspace-member.entity';
import { Section } from '../modules/section/section.entity';
import {
  SectionMember,
  SectionRole,
} from '../modules/section/section-member.entity';
import { SECTIONS } from './data/departments';
import { EMPLOYEES } from './data/employees';

// ──────────────────────────────────────────────────────
// Exported types
// ──────────────────────────────────────────────────────

export interface SeedWorkspaces {
  zk: Workspace; // Заявки клиентов
  kp: Workspace; // Коммерческие предложения
  sz: Workspace; // Сервисные заявки
  rek: Workspace; // Рекламации
  mk: Workspace; // Маркетинговые задачи
  kn: Workspace; // Контент-план
  sk: Workspace; // Складские операции
  dv: Workspace; // Доставки
  fd: Workspace; // Финансовые документы
  sr: Workspace; // Согласование расходов
  dg: Workspace; // Договоры
  ved: Workspace; // ВЭД операции
  hr: Workspace; // HR и кадры
  tn: Workspace; // Тендеры
}

// Map: section key → workspace keys that belong to it
const SECTION_WORKSPACE_MAP: Record<string, string[]> = {
  sales: ['zk', 'kp'],
  service: ['sz', 'rek'],
  marketing: ['mk', 'kn'],
  warehouse_logistics: ['sk', 'dv'],
  finance: ['fd', 'sr'],
  legal_fea: ['dg', 'ved'],
  management: ['hr', 'tn'],
  // it — handled by seed-it-department.service.ts
};

// ══════════════════════════════════════════════════════
// SeedStructureService
// ══════════════════════════════════════════════════════

@Injectable()
export class SeedStructureService {
  private readonly logger = new Logger(SeedStructureService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly wsRepo: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(SectionMember)
    private readonly secMemberRepo: Repository<SectionMember>,
  ) {}

  // ──────────────────────────────────────────────────
  // PUBLIC: create everything
  // ──────────────────────────────────────────────────

  async createAll(
    users: User[],
  ): Promise<{ sections: Section[]; workspaces: SeedWorkspaces }> {
    this.logger.log('Создание секций и workspace...');

    // 1. Create sections (skip IT — it's handled separately)
    const sectionEntities = await this.createSections();

    // Build section lookup by key
    const sectionByKey = new Map<string, Section>();
    for (const sec of sectionEntities) {
      const seedSec = SECTIONS.find((s) => s.name === sec.name);
      if (seedSec) sectionByKey.set(seedSec.key, sec);
    }

    // 2. Create workspaces
    const workspaces = await this.createWorkspaces(sectionByKey);

    // 3. Create workspace members + section members
    await this.createMembers(users, workspaces, sectionByKey);

    this.logger.log(
      `Создано: ${sectionEntities.length} секций, 14 workspace, члены назначены`,
    );

    return { sections: sectionEntities, workspaces };
  }

  // ──────────────────────────────────────────────────
  // SECTIONS (8, including IT)
  // ──────────────────────────────────────────────────

  private async createSections(): Promise<Section[]> {
    const sections: Section[] = [];

    for (let i = 0; i < SECTIONS.length; i++) {
      const s = SECTIONS[i];
      const section = await this.sectionRepo.save({
        name: s.name,
        description: s.description,
        icon: s.icon,
        order: i,
      });
      sections.push(section);
    }

    this.logger.debug(`  Секции: ${sections.map((s) => s.name).join(', ')}`);
    return sections;
  }

  // ──────────────────────────────────────────────────
  // WORKSPACES (14)
  // ──────────────────────────────────────────────────

  private async createWorkspaces(
    sectionByKey: Map<string, Section>,
  ): Promise<SeedWorkspaces> {
    const salesSection = sectionByKey.get('sales')!;
    const serviceSection = sectionByKey.get('service')!;
    const marketingSection = sectionByKey.get('marketing')!;
    const warehouseSection = sectionByKey.get('warehouse_logistics')!;
    const financeSection = sectionByKey.get('finance')!;
    const legalSection = sectionByKey.get('legal_fea')!;
    const managementSection = sectionByKey.get('management')!;

    // ═══ Продажи ═══

    const zk = await this.wsRepo.save({
      name: 'Заявки клиентов',
      icon: '📋',
      prefix: 'ZK',
      lastEntityNumber: 0,
      sectionId: salesSection.id,
      orderInSection: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новая', color: '#3B82F6' },
                { id: 'in_progress', label: 'В обработке', color: '#F59E0B' },
                { id: 'kp_ready', label: 'КП подготовлено', color: '#8B5CF6' },
                { id: 'approval', label: 'Согласование', color: '#6366F1' },
                { id: 'payment', label: 'Оплата', color: '#EC4899' },
                { id: 'shipping', label: 'Отгрузка', color: '#F97316' },
                { id: 'completed', label: 'Завершена', color: '#10B981' },
                { id: 'rejected', label: 'Отклонена', color: '#6B7280' },
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
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            { id: 'customer', name: 'Клиент', type: 'text' as const },
            { id: 'equipment_type', name: 'Тип оборудования', type: 'text' as const },
            { id: 'amount', name: 'Сумма', type: 'number' as const },
          ],
        },
      ],
    });

    const kp = await this.wsRepo.save({
      name: 'Коммерческие предложения',
      icon: '📊',
      prefix: 'KP',
      lastEntityNumber: 0,
      sectionId: salesSection.id,
      orderInSection: 1,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'draft', label: 'Черновик', color: '#6B7280' },
                { id: 'review', label: 'На рассмотрении', color: '#3B82F6' },
                { id: 'approved', label: 'Одобрено', color: '#8B5CF6' },
                { id: 'sent', label: 'Отправлено клиенту', color: '#F59E0B' },
                { id: 'won', label: 'Выиграно', color: '#10B981' },
                { id: 'lost', label: 'Проиграно', color: '#EF4444' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            { id: 'deal_amount', name: 'Сумма сделки', type: 'number' as const },
            { id: 'customer', name: 'Клиент', type: 'text' as const },
            { id: 'valid_until', name: 'Действительно до', type: 'date' as const },
          ],
        },
      ],
    });

    // ═══ Сервис ═══

    const sz = await this.wsRepo.save({
      name: 'Сервисные заявки',
      icon: '🔧',
      prefix: 'SZ',
      lastEntityNumber: 0,
      sectionId: serviceSection.id,
      orderInSection: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новая', color: '#3B82F6' },
                { id: 'diagnostics', label: 'Диагностика', color: '#06B6D4' },
                { id: 'in_repair', label: 'В ремонте', color: '#F59E0B' },
                { id: 'waiting_parts', label: 'Ожидание запчастей', color: '#F97316' },
                { id: 'testing', label: 'Тестирование', color: '#8B5CF6' },
                { id: 'ready', label: 'Готово', color: '#10B981' },
                { id: 'delivered', label: 'Выдано', color: '#6B7280' },
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
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            { id: 'equipment', name: 'Оборудование', type: 'text' as const },
            { id: 'serial_number', name: 'Серийный номер', type: 'text' as const },
            { id: 'customer', name: 'Клиент', type: 'text' as const },
          ],
        },
      ],
    });

    const rek = await this.wsRepo.save({
      name: 'Рекламации',
      icon: '⚠️',
      prefix: 'REK',
      lastEntityNumber: 0,
      sectionId: serviceSection.id,
      orderInSection: 1,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'received', label: 'Получена', color: '#3B82F6' },
                { id: 'investigation', label: 'Расследование', color: '#F59E0B' },
                { id: 'decision', label: 'Решение', color: '#8B5CF6' },
                { id: 'execution', label: 'Исполнение', color: '#6366F1' },
                { id: 'closed', label: 'Закрыта', color: '#10B981' },
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
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            { id: 'customer', name: 'Клиент', type: 'text' as const },
            { id: 'order_number', name: 'Номер заказа', type: 'text' as const },
          ],
        },
      ],
    });

    // ═══ Маркетинг ═══

    const mk = await this.wsRepo.save({
      name: 'Маркетинговые задачи',
      icon: '📣',
      prefix: 'MK',
      lastEntityNumber: 0,
      sectionId: marketingSection.id,
      orderInSection: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'backlog', label: 'Бэклог', color: '#6B7280' },
                { id: 'in_progress', label: 'В работе', color: '#F59E0B' },
                { id: 'review', label: 'На проверке', color: '#8B5CF6' },
                { id: 'done', label: 'Готово', color: '#10B981' },
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
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            {
              id: 'task_type',
              name: 'Тип задачи',
              type: 'select' as const,
              options: [
                { id: 'content', label: 'Контент', color: '#3B82F6' },
                { id: 'ads', label: 'Реклама', color: '#F59E0B' },
                { id: 'exhibition', label: 'Выставка', color: '#8B5CF6' },
                { id: 'research', label: 'Исследование', color: '#06B6D4' },
                { id: 'other', label: 'Другое', color: '#6B7280' },
              ],
            },
            { id: 'deadline', name: 'Дедлайн', type: 'date' as const },
          ],
        },
      ],
    });

    const kn = await this.wsRepo.save({
      name: 'Контент-план',
      icon: '📝',
      prefix: 'KN',
      lastEntityNumber: 0,
      sectionId: marketingSection.id,
      orderInSection: 1,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'idea', label: 'Идея', color: '#6B7280' },
                { id: 'writing', label: 'Написание', color: '#3B82F6' },
                { id: 'editing', label: 'Редактирование', color: '#F59E0B' },
                { id: 'publishing', label: 'Публикация', color: '#8B5CF6' },
                { id: 'published', label: 'Опубликовано', color: '#10B981' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            {
              id: 'platform',
              name: 'Платформа',
              type: 'select' as const,
              options: [
                { id: 'website', label: 'Сайт', color: '#3B82F6' },
                { id: 'social', label: 'Соцсети', color: '#EC4899' },
                { id: 'email', label: 'Email', color: '#F59E0B' },
                { id: 'youtube', label: 'YouTube', color: '#EF4444' },
              ],
            },
            { id: 'publish_date', name: 'Дата публикации', type: 'date' as const },
          ],
        },
      ],
    });

    // ═══ Склад и логистика ═══

    const sk = await this.wsRepo.save({
      name: 'Складские операции',
      icon: '📦',
      prefix: 'SK',
      lastEntityNumber: 0,
      sectionId: warehouseSection.id,
      orderInSection: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новая', color: '#3B82F6' },
                { id: 'in_progress', label: 'В обработке', color: '#F59E0B' },
                { id: 'picking', label: 'Комплектация', color: '#8B5CF6' },
                { id: 'ready', label: 'Готово к отгрузке', color: '#06B6D4' },
                { id: 'shipped', label: 'Отгружено', color: '#10B981' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            {
              id: 'operation_type',
              name: 'Тип операции',
              type: 'select' as const,
              options: [
                { id: 'receiving', label: 'Приёмка', color: '#3B82F6' },
                { id: 'shipping', label: 'Отгрузка', color: '#F59E0B' },
                { id: 'inventory', label: 'Инвентаризация', color: '#8B5CF6' },
                { id: 'transfer', label: 'Перемещение', color: '#06B6D4' },
              ],
            },
          ],
        },
      ],
    });

    const dv = await this.wsRepo.save({
      name: 'Доставки',
      icon: '🚛',
      prefix: 'DV',
      lastEntityNumber: 0,
      sectionId: warehouseSection.id,
      orderInSection: 1,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'planning', label: 'Планирование', color: '#6B7280' },
                { id: 'in_transit', label: 'В пути', color: '#F59E0B' },
                { id: 'delivered', label: 'Доставлено', color: '#10B981' },
                { id: 'problem', label: 'Проблема', color: '#EF4444' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            { id: 'destination', name: 'Пункт назначения', type: 'text' as const },
            { id: 'delivery_date', name: 'Дата доставки', type: 'date' as const },
          ],
        },
      ],
    });

    // ═══ Финансы ═══

    const fd = await this.wsRepo.save({
      name: 'Финансовые документы',
      icon: '💳',
      prefix: 'FD',
      lastEntityNumber: 0,
      sectionId: financeSection.id,
      orderInSection: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новый', color: '#3B82F6' },
                { id: 'checking', label: 'На проверке', color: '#06B6D4' },
                { id: 'approval', label: 'Согласование', color: '#F59E0B' },
                { id: 'approved', label: 'Одобрен', color: '#8B5CF6' },
                { id: 'paid', label: 'Оплачен', color: '#10B981' },
                { id: 'rejected', label: 'Отклонён', color: '#EF4444' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            {
              id: 'doc_type',
              name: 'Тип документа',
              type: 'select' as const,
              options: [
                { id: 'invoice', label: 'Счёт', color: '#3B82F6' },
                { id: 'act', label: 'Акт', color: '#10B981' },
                { id: 'waybill', label: 'Накладная', color: '#F59E0B' },
                { id: 'contract', label: 'Договор', color: '#8B5CF6' },
              ],
            },
            { id: 'amount', name: 'Сумма', type: 'number' as const },
          ],
        },
      ],
    });

    const sr = await this.wsRepo.save({
      name: 'Согласование расходов',
      icon: '💰',
      prefix: 'SR',
      lastEntityNumber: 0,
      sectionId: financeSection.id,
      orderInSection: 1,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новый', color: '#3B82F6' },
                { id: 'budget_check', label: 'Проверка бюджета', color: '#06B6D4' },
                { id: 'approval', label: 'На согласовании', color: '#F59E0B' },
                { id: 'director', label: 'У директора', color: '#8B5CF6' },
                { id: 'approved', label: 'Одобрен', color: '#10B981' },
                { id: 'rejected', label: 'Отклонён', color: '#EF4444' },
                { id: 'paid', label: 'Оплачен', color: '#6B7280' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            {
              id: 'category',
              name: 'Категория',
              type: 'select' as const,
              options: [
                { id: 'office', label: 'Офис', color: '#6B7280' },
                { id: 'travel', label: 'Командировки', color: '#3B82F6' },
                { id: 'equipment', label: 'Оборудование', color: '#F59E0B' },
                { id: 'marketing', label: 'Маркетинг', color: '#EC4899' },
              ],
            },
            { id: 'amount', name: 'Сумма', type: 'number' as const },
          ],
        },
      ],
    });

    // ═══ Юридический и ВЭД ═══

    const dg = await this.wsRepo.save({
      name: 'Договоры',
      icon: '📄',
      prefix: 'DG',
      lastEntityNumber: 0,
      sectionId: legalSection.id,
      orderInSection: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'draft', label: 'Черновик', color: '#6B7280' },
                { id: 'checking', label: 'На проверке', color: '#3B82F6' },
                { id: 'approval', label: 'Согласование', color: '#F59E0B' },
                { id: 'signed', label: 'Подписан', color: '#8B5CF6' },
                { id: 'active', label: 'Действует', color: '#10B981' },
                { id: 'expired', label: 'Истёк', color: '#EF4444' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            {
              id: 'contract_type',
              name: 'Тип договора',
              type: 'select' as const,
              options: [
                { id: 'supply', label: 'Поставка', color: '#3B82F6' },
                { id: 'services', label: 'Услуги', color: '#F59E0B' },
                { id: 'lease', label: 'Аренда', color: '#8B5CF6' },
                { id: 'nda', label: 'NDA', color: '#6B7280' },
              ],
            },
            { id: 'counterparty', name: 'Контрагент', type: 'text' as const },
            { id: 'valid_until', name: 'Действителен до', type: 'date' as const },
          ],
        },
      ],
    });

    const ved = await this.wsRepo.save({
      name: 'ВЭД операции',
      icon: '🌍',
      prefix: 'VED',
      lastEntityNumber: 0,
      sectionId: legalSection.id,
      orderInSection: 1,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новая', color: '#3B82F6' },
                { id: 'documents', label: 'Документы', color: '#F59E0B' },
                { id: 'customs', label: 'Таможня', color: '#8B5CF6' },
                { id: 'logistics', label: 'Логистика', color: '#6366F1' },
                { id: 'completed', label: 'Завершена', color: '#10B981' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            { id: 'country', name: 'Страна', type: 'text' as const },
            { id: 'customs_number', name: 'Таможенный номер', type: 'text' as const },
          ],
        },
      ],
    });

    // ═══ Управление ═══

    const hr = await this.wsRepo.save({
      name: 'HR и кадры',
      icon: '👥',
      prefix: 'HR',
      lastEntityNumber: 0,
      sectionId: managementSection.id,
      orderInSection: 0,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'new', label: 'Новая', color: '#3B82F6' },
                { id: 'in_progress', label: 'В работе', color: '#F59E0B' },
                { id: 'approval', label: 'На согласовании', color: '#8B5CF6' },
                { id: 'completed', label: 'Завершена', color: '#10B981' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            {
              id: 'hr_type',
              name: 'Тип',
              type: 'select' as const,
              options: [
                { id: 'vacation', label: 'Отпуск', color: '#3B82F6' },
                { id: 'sick_leave', label: 'Больничный', color: '#F59E0B' },
                { id: 'hiring', label: 'Приём', color: '#10B981' },
                { id: 'dismissal', label: 'Увольнение', color: '#EF4444' },
                { id: 'training', label: 'Обучение', color: '#8B5CF6' },
              ],
            },
          ],
        },
      ],
    });

    const tn = await this.wsRepo.save({
      name: 'Тендеры',
      icon: '📋',
      prefix: 'TN',
      lastEntityNumber: 0,
      sectionId: managementSection.id,
      orderInSection: 1,
      sections: [
        {
          id: 'main',
          name: 'Основная информация',
          order: 0,
          fields: [
            { id: 'title', name: 'Тема', type: 'text' as const, required: true },
            {
              id: 'status',
              name: 'Статус',
              type: 'status' as const,
              required: true,
              options: [
                { id: 'search', label: 'Поиск', color: '#6B7280' },
                { id: 'preparation', label: 'Подготовка', color: '#3B82F6' },
                { id: 'submitted', label: 'Подана', color: '#F59E0B' },
                { id: 'review', label: 'Рассмотрение', color: '#8B5CF6' },
                { id: 'won', label: 'Выиграно', color: '#10B981' },
                { id: 'lost', label: 'Проиграно', color: '#EF4444' },
              ],
            },
            { id: 'assignee', name: 'Исполнитель', type: 'user' as const },
          ],
        },
        {
          id: 'details',
          name: 'Детали',
          order: 1,
          fields: [
            { id: 'tender_amount', name: 'Сумма тендера', type: 'number' as const },
            { id: 'deadline', name: 'Дедлайн подачи', type: 'date' as const },
          ],
        },
      ],
    });

    return { zk, kp, sz, rek, mk, kn, sk, dv, fd, sr, dg, ved, hr, tn };
  }

  // ──────────────────────────────────────────────────
  // MEMBERS (workspace + section)
  // ──────────────────────────────────────────────────

  private async createMembers(
    users: User[],
    workspaces: SeedWorkspaces,
    sectionByKey: Map<string, Section>,
  ): Promise<void> {
    // Build user lookup by email → departmentKey (from EMPLOYEES data)
    const employeeByEmail = new Map<string, (typeof EMPLOYEES)[number]>();
    for (const emp of EMPLOYEES) {
      employeeByEmail.set(emp.email, emp);
    }

    // Collect admin users (role = admin in User entity)
    const adminUsers = users.filter((u) => u.role === UserRole.ADMIN);

    // Workspace key → Workspace entity
    const wsMap: Record<string, Workspace> = {
      zk: workspaces.zk,
      kp: workspaces.kp,
      sz: workspaces.sz,
      rek: workspaces.rek,
      mk: workspaces.mk,
      kn: workspaces.kn,
      sk: workspaces.sk,
      dv: workspaces.dv,
      fd: workspaces.fd,
      sr: workspaces.sr,
      dg: workspaces.dg,
      ved: workspaces.ved,
      hr: workspaces.hr,
      tn: workspaces.tn,
    };

    // Track members to avoid duplicates
    const addedWsMembers = new Set<string>(); // "workspaceId:userId"
    const addedSecMembers = new Set<string>(); // "sectionId:userId"

    const wsMemberEntities: Partial<WorkspaceMember>[] = [];
    const secMemberEntities: Partial<SectionMember>[] = [];

    // Helper: add workspace member (dedup)
    const addWsMember = (
      workspaceId: string,
      userId: string,
      role: WorkspaceRole,
    ) => {
      const key = `${workspaceId}:${userId}`;
      if (addedWsMembers.has(key)) return;
      addedWsMembers.add(key);
      wsMemberEntities.push({ workspaceId, userId, role });
    };

    // Helper: add section member (dedup)
    const addSecMember = (
      sectionId: string,
      userId: string,
      role: SectionRole,
    ) => {
      const key = `${sectionId}:${userId}`;
      if (addedSecMembers.has(key)) return;
      addedSecMembers.add(key);
      secMemberEntities.push({ sectionId, userId, role });
    };

    // For each section (excluding IT), find department users and assign
    for (const seedSection of SECTIONS) {
      if (seedSection.key === 'it') continue; // IT handled separately

      const section = sectionByKey.get(seedSection.key);
      if (!section) continue;

      const wsKeys = SECTION_WORKSPACE_MAP[seedSection.key] ?? [];

      // Find all users whose department is in this section's departments
      for (const user of users) {
        const emp = employeeByEmail.get(user.email);
        if (!emp) continue;

        const belongsToSection = seedSection.departmentKeys.includes(
          emp.departmentKey,
        );
        if (!belongsToSection) continue;

        // Determine workspace role based on employee role
        const wsRole =
          emp.role === UserRole.MANAGER || emp.role === UserRole.ADMIN
            ? WorkspaceRole.ADMIN
            : WorkspaceRole.EDITOR;

        // Add to all workspaces in this section
        for (const wsKey of wsKeys) {
          const ws = wsMap[wsKey];
          if (ws) {
            addWsMember(ws.id, user.id, wsRole);
          }
        }

        // Section members: managers → SectionRole.ADMIN
        if (emp.role === UserRole.MANAGER || emp.role === UserRole.ADMIN) {
          addSecMember(section.id, user.id, SectionRole.ADMIN);
        }
      }
    }

    // Admin users → ADMIN in ALL workspaces + ALL sections
    for (const admin of adminUsers) {
      for (const wsKey of Object.keys(wsMap)) {
        const ws = wsMap[wsKey];
        addWsMember(ws.id, admin.id, WorkspaceRole.ADMIN);
      }

      for (const [, section] of sectionByKey) {
        addSecMember(section.id, admin.id, SectionRole.ADMIN);
      }
    }

    // Batch save
    if (wsMemberEntities.length > 0) {
      await this.memberRepo.save(wsMemberEntities);
    }
    if (secMemberEntities.length > 0) {
      await this.secMemberRepo.save(secMemberEntities);
    }

    this.logger.debug(
      `  Участники: ${wsMemberEntities.length} workspace members, ${secMemberEntities.length} section members`,
    );
  }
}
