import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { Workspace } from '../../workspace/workspace.entity';
import { SystemSyncLog } from '../entities/system-sync-log.entity';
import { LegacyService } from './legacy.service';
import { LegacyUrlService } from './legacy-url.service';
import { ProductCategoryService } from '../../entity/product-category.service';
import {
  LegacyCounterparty,
  LegacyCustomer,
  LegacyProduct,
  LegacyCategory,
  LegacyDeal,
  LegacyDealStage,
} from '../entities';

export type SystemType = 'counterparties' | 'contacts' | 'products' | 'deals';

export interface SyncResult {
  systemType: SystemType;
  created: number;
  updated: number;
  errors: number;
  totalProcessed: number;
  durationMs: number;
  incremental: boolean;
}

export interface SyncProgress {
  systemType: SystemType;
  isRunning: boolean;
  totalItems: number;
  processedItems: number;
  createdItems: number;
  errors: number;
  startedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
}

export interface SyncStatus {
  counterparties: SyncProgress;
  contacts: SyncProgress;
  products: SyncProgress;
  deals: SyncProgress;
  cronEnabled: boolean;
  lastCronRunAt: Date | null;
}

// ==================== SECTION DEFINITIONS ====================

const COUNTERPARTY_SECTIONS = [
  {
    id: 'main',
    name: 'Основная информация',
    order: 0,
    fields: [
      { id: 'inn', name: 'ИНН', type: 'text' as const, system: true, config: { type: 'text', mask: 'inn' } },
      { id: 'kpp', name: 'КПП', type: 'text' as const, system: true },
      { id: 'ogrn', name: 'ОГРН', type: 'text' as const, system: true },
      {
        id: 'orgType', name: 'Тип', type: 'select' as const, system: true,
        options: [
          { id: 'legal', label: 'Юр. лицо', color: '#3B82F6' },
          { id: 'individual', label: 'ИП', color: '#8B5CF6' },
          { id: 'person', label: 'Физ. лицо', color: '#6B7280' },
        ],
      },
      { id: 'director', name: 'Руководитель', type: 'text' as const, system: true },
      { id: 'website', name: 'Сайт', type: 'url' as const, system: true },
      {
        id: 'status', name: 'Статус', type: 'status' as const, required: true, system: true,
        options: [
          { id: 'active', label: 'Действующий', color: '#10B981' },
          { id: 'inactive', label: 'Не активен', color: '#6B7280' },
          { id: 'liquidated', label: 'Ликвидирован', color: '#EF4444' },
        ],
      },
    ],
  },
  {
    id: 'address',
    name: 'Адрес',
    order: 1,
    fields: [
      { id: 'address', name: 'Юридический адрес', type: 'textarea' as const, system: true },
    ],
  },
  {
    id: 'bank',
    name: 'Банковские реквизиты',
    order: 2,
    fields: [
      { id: 'bankName', name: 'Банк', type: 'text' as const, system: true },
      { id: 'bankBik', name: 'БИК', type: 'text' as const, system: true },
      { id: 'employeeCount', name: 'Кол-во сотрудников', type: 'number' as const, system: true, config: { type: 'number', subtype: 'integer' } },
    ],
  },
  {
    id: 'legacy',
    name: 'Legacy CRM',
    order: 3,
    fields: [
      { id: 'legacyId', name: 'Legacy ID', type: 'number' as const, system: true },
      { id: 'legacyUrl', name: 'Ссылка в CRM', type: 'url' as const, system: true },
    ],
  },
];

const CONTACT_SECTIONS = [
  {
    id: 'main',
    name: 'Основная информация',
    order: 0,
    fields: [
      { id: 'email', name: 'Email', type: 'text' as const, system: true },
      { id: 'phone', name: 'Телефон', type: 'text' as const, system: true, config: { type: 'text', mask: 'phone' } },
      { id: 'position', name: 'Должность', type: 'text' as const, system: true },
      { id: 'telegram', name: 'Telegram', type: 'text' as const, system: true, config: { type: 'text', placeholder: '@username' } },
      // relatedWorkspaceId заполняется динамически при создании workspace
      { id: 'counterparty', name: 'Контрагент', type: 'relation' as const, system: true },
      {
        id: 'status', name: 'Статус', type: 'status' as const, required: true, system: true,
        options: [
          { id: 'active', label: 'Активный', color: '#10B981' },
          { id: 'inactive', label: 'Неактивный', color: '#6B7280' },
        ],
      },
    ],
  },
  {
    id: 'legacy',
    name: 'Legacy CRM',
    order: 1,
    fields: [
      { id: 'legacyId', name: 'Legacy ID', type: 'number' as const, system: true },
      { id: 'isEmployee', name: 'Сотрудник', type: 'checkbox' as const, system: true },
      { id: 'legacyUrl', name: 'Ссылка в CRM', type: 'url' as const, system: true },
    ],
  },
];

const PRODUCT_SECTIONS = [
  {
    id: 'main',
    name: 'Основная информация',
    order: 0,
    fields: [
      { id: 'productCode', name: 'Артикул', type: 'text' as const, system: true },
      { id: 'description', name: 'Описание', type: 'textarea' as const, system: true },
      { id: 'category', name: 'Категория', type: 'text' as const, system: true },
      { id: 'factoryName', name: 'Завод-изготовитель', type: 'text' as const, system: true },
      { id: 'inStock', name: 'В наличии (шт)', type: 'number' as const, system: true, config: { type: 'number', subtype: 'integer' } },
      {
        id: 'status', name: 'Статус', type: 'status' as const, required: true, system: true,
        options: [
          { id: 'active', label: 'Активный', color: '#10B981' },
          { id: 'out_of_stock', label: 'Нет в наличии', color: '#F59E0B' },
          { id: 'disabled', label: 'Отключён', color: '#6B7280' },
        ],
      },
    ],
  },
  {
    id: 'pricing',
    name: 'Цены',
    order: 1,
    fields: [
      {
        id: 'price', name: 'Цена', type: 'number' as const, system: true,
        config: { type: 'number', subtype: 'money', suffix: '₽' },
      },
      {
        id: 'basePrice', name: 'Базовая цена', type: 'number' as const, system: true,
        config: { type: 'number', subtype: 'money', suffix: '₽' },
      },
      {
        id: 'fobPrice', name: 'Цена FOB', type: 'number' as const, system: true,
        config: { type: 'number', subtype: 'money', suffix: '$' },
      },
    ],
  },
  {
    id: 'specs',
    name: 'Характеристики',
    order: 2,
    fields: [
      {
        id: 'warranty', name: 'Гарантия', type: 'number' as const, system: true,
        config: { type: 'number', subtype: 'integer', suffix: 'мес.' },
      },
    ],
  },
  {
    id: 'legacy',
    name: 'Legacy CRM',
    order: 3,
    fields: [
      { id: 'legacyId', name: 'Legacy ID', type: 'number' as const, system: true },
      { id: 'legacyUrl', name: 'Ссылка в каталоге', type: 'url' as const, system: true },
    ],
  },
];

const DEAL_SECTIONS = [
  {
    id: 'main',
    name: 'Основная информация',
    order: 0,
    fields: [
      {
        id: 'amount', name: 'Сумма', type: 'number' as const, system: true,
        config: { type: 'number', subtype: 'money', suffix: '₽' },
      },
      { id: 'counterparty', name: 'Контрагент', type: 'relation' as const, system: true },
      {
        id: 'completion', name: 'Результат', type: 'select' as const, system: true,
        options: [
          { id: 'in_progress', label: 'В работе', color: '#3B82F6' },
          { id: 'won', label: 'Выиграна', color: '#10B981' },
          { id: 'lost', label: 'Проиграна', color: '#EF4444' },
        ],
      },
    ],
  },
  {
    id: 'legacy',
    name: 'Legacy CRM',
    order: 1,
    fields: [
      { id: 'legacyId', name: 'Legacy ID', type: 'number' as const, system: true },
      { id: 'legacyUrl', name: 'Ссылка в CRM', type: 'url' as const, system: true },
    ],
  },
];

/**
 * Пауза между батчами для снижения нагрузки на legacy DB.
 * Legacy сайт и так перегружен (Core Web Vitals: 4.93K URL с низкой скоростью),
 * агрессивный sync усугубит ситуацию.
 */
const BATCH_THROTTLE_MS = 2000;
/** Размер батча по умолчанию — маленький для щадящей нагрузки */
const DEFAULT_BATCH_SIZE = 200;
/** Circuit breaker: abort sync если % ошибок превышает порог */
const CIRCUIT_BREAKER_ERROR_RATE = 0.15;
/** Минимум обработанных записей до активации circuit breaker */
const CIRCUIT_BREAKER_MIN_PROCESSED = 20;

@Injectable()
export class SystemSyncService {
  private readonly logger = new Logger(SystemSyncService.name);
  private cronEnabled = true;
  private lastCronRunAt: Date | null = null;
  private readonly telegramBotToken: string | null;
  private readonly telegramChatId: string | null;

  private progress: Record<SystemType, SyncProgress> = {
    counterparties: this.emptyProgress('counterparties'),
    contacts: this.emptyProgress('contacts'),
    products: this.emptyProgress('products'),
    deals: this.emptyProgress('deals'),
  };

  // Кэш категорий для маппинга legacyCategoryId → categoryName
  private categoryMap = new Map<number, string>();
  // Кэш deal stages для маппинга stageId → alias
  private dealStageMap = new Map<number, { alias: string; title: string }>();

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(SystemSyncLog)
    private readonly syncLogRepo: Repository<SystemSyncLog>,
    private readonly dataSource: DataSource,
    private readonly legacyService: LegacyService,
    private readonly legacyUrlService: LegacyUrlService,
    private readonly productCategoryService: ProductCategoryService,
    private readonly configService: ConfigService,
  ) {
    this.telegramBotToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || null;
    this.telegramChatId = this.configService.get<string>('TELEGRAM_DEFAULT_CHAT_ID') || null;
  }

  // ==================== WORKSPACE MANAGEMENT ====================

  async ensureCounterpartiesWorkspace(): Promise<Workspace> {
    return this.ensureSystemWorkspace('counterparties', 'Контрагенты', '🏢', 'CO', COUNTERPARTY_SECTIONS);
  }

  async ensureContactsWorkspace(): Promise<Workspace> {
    const cpWs = await this.ensureCounterpartiesWorkspace();
    const sections = JSON.parse(JSON.stringify(CONTACT_SECTIONS));
    const mainSection = sections.find((s: { id: string }) => s.id === 'main');
    if (mainSection) {
      const counterpartyField = mainSection.fields.find((f: { id: string }) => f.id === 'counterparty');
      if (counterpartyField) {
        counterpartyField.relatedWorkspaceId = cpWs.id;
      }
    }
    return this.ensureSystemWorkspace('contacts', 'Контакты', '👤', 'CT', sections);
  }

  async ensureProductsWorkspace(): Promise<Workspace> {
    return this.ensureSystemWorkspace('products', 'Товары', '📦', 'PR', PRODUCT_SECTIONS);
  }

  async ensureDealsWorkspace(): Promise<Workspace> {
    const cpWs = await this.ensureCounterpartiesWorkspace();
    const sections = JSON.parse(JSON.stringify(DEAL_SECTIONS));
    const mainSection = sections.find((s: { id: string }) => s.id === 'main');
    if (mainSection) {
      const counterpartyField = mainSection.fields.find((f: { id: string }) => f.id === 'counterparty');
      if (counterpartyField) {
        counterpartyField.relatedWorkspaceId = cpWs.id;
      }
    }

    // Загружаем этапы воронки из legacy для создания статусов workspace
    let statuses: any[] = [
      { id: 'new', label: 'Новая', color: '#3B82F6', order: 0 },
      { id: 'won', label: 'Выиграна', color: '#10B981', order: 98 },
      { id: 'lost', label: 'Проиграна', color: '#EF4444', order: 99 },
    ];

    try {
      const stages = await this.legacyService.getAllDealStages();
      if (stages.length > 0) {
        statuses = stages.map((s, i) => ({
          id: s.alias || `stage-${s.id}`,
          label: s.title,
          color: s.color || '#6B7280',
          order: s.sortOrder ?? i,
        }));
        // Кэшируем для маппинга
        this.dealStageMap.clear();
        for (const s of stages) {
          this.dealStageMap.set(s.id, { alias: s.alias || `stage-${s.id}`, title: s.title });
        }
      }
    } catch {
      this.logger.warn('Не удалось загрузить deal_stage — используем стандартные статусы');
    }

    return this.ensureSystemWorkspace('deals', 'Сделки', '💰', 'DL', sections, statuses);
  }

  async ensureAllWorkspaces(): Promise<{
    counterparties: Workspace;
    contacts: Workspace;
    products: Workspace;
    deals: Workspace;
  }> {
    const counterparties = await this.ensureCounterpartiesWorkspace();
    const contacts = await this.ensureContactsWorkspace();
    const products = await this.ensureProductsWorkspace();
    const deals = await this.ensureDealsWorkspace();
    return { counterparties, contacts, products, deals };
  }

  // ==================== SYNC OPERATIONS ====================

  /**
   * Синхронизация контрагентов.
   * fullSync=false (по умолчанию): только новые записи (id > lastSyncedId) — щадящий режим.
   * fullSync=true: полная переповторная синхронизация с обновлением существующих.
   */
  async syncCounterparties(batchSize = DEFAULT_BATCH_SIZE, fullSync = false): Promise<SyncResult> {
    return this.runSync('counterparties', batchSize, fullSync, async (workspace) => {
      if (fullSync) {
        return this.fullSyncLoop('counterparties', workspace.id, batchSize,
          () => this.legacyService.getCounterpartiesCount(),
          (offset, limit) => this.legacyService.getAllCounterpartiesBatch(offset, limit),
          (batch, wsId) => this.syncCounterpartyBatch(batch, wsId),
        );
      }

      // Инкрементальный: только записи с id > lastSyncedId
      const lastId = await this.getLastSyncedLegacyId('counterparties');
      const totalNew = await this.legacyService.getCounterpartiesCountSinceId(lastId);

      if (totalNew === 0) {
        this.logger.log('Контрагенты: нет новых записей');
        return { created: 0, updated: 0, errors: 0, totalProcessed: 0 };
      }

      this.logger.log(`Контрагенты: ${totalNew} новых (sinceId=${lastId})`);
      this.initProgress('counterparties', totalNew);

      let created = 0, updated = 0, errors = 0, processed = 0;
      let currentMinId = lastId;

      while (processed < totalNew) {
        const batch = await this.withRetry(() =>
          this.legacyService.getCounterpartiesSinceId(currentMinId, batchSize),
        );
        if (batch.length === 0) break;

        const result = await this.syncCounterpartyBatch(batch, workspace.id);
        created += result.created;
        updated += result.updated;
        errors += result.errors;
        processed += batch.length;
        currentMinId = batch[batch.length - 1].id;

        this.updateProgress('counterparties', processed, created, errors);
        this.checkCircuitBreaker(errors, processed, 'counterparties');
        await this.throttle();
      }

      return { created, updated, errors, totalProcessed: processed };
    });
  }

  async syncContacts(batchSize = DEFAULT_BATCH_SIZE, fullSync = false): Promise<SyncResult> {
    return this.runSync('contacts', batchSize, fullSync, async (workspace) => {
      const cpWorkspace = await this.ensureCounterpartiesWorkspace();
      const cpSyncLogs = await this.syncLogRepo.find({
        where: { systemType: 'counterparties' },
        select: ['legacyId', 'entityId'],
      });
      const cpEntityMap = new Map(cpSyncLogs.map((l) => [l.legacyId, l.entityId]));

      if (fullSync) {
        return this.fullSyncLoop('contacts', workspace.id, batchSize,
          () => this.legacyService.getContactsCount(),
          (offset, limit) => this.legacyService.getAllContactsBatch(offset, limit),
          (batch, wsId) => this.syncContactBatch(batch, wsId, cpWorkspace.id, cpEntityMap),
        );
      }

      const lastId = await this.getLastSyncedLegacyId('contacts');
      const totalNew = await this.legacyService.getContactsCountSinceId(lastId);

      if (totalNew === 0) {
        this.logger.log('Контакты: нет новых записей');
        return { created: 0, updated: 0, errors: 0, totalProcessed: 0 };
      }

      this.logger.log(`Контакты: ${totalNew} новых (sinceId=${lastId})`);
      this.initProgress('contacts', totalNew);

      let created = 0, updated = 0, errors = 0, processed = 0;
      let currentMinId = lastId;

      while (processed < totalNew) {
        const batch = await this.withRetry(() =>
          this.legacyService.getContactsSinceId(currentMinId, batchSize),
        );
        if (batch.length === 0) break;

        const result = await this.syncContactBatch(batch, workspace.id, cpWorkspace.id, cpEntityMap);
        created += result.created;
        updated += result.updated;
        errors += result.errors;
        processed += batch.length;
        currentMinId = batch[batch.length - 1].id;

        this.updateProgress('contacts', processed, created, errors);
        this.checkCircuitBreaker(errors, processed, 'contacts');
        await this.throttle();
      }

      return { created, updated, errors, totalProcessed: processed };
    });
  }

  async syncProducts(batchSize = DEFAULT_BATCH_SIZE, fullSync = false): Promise<SyncResult> {
    return this.runSync('products', batchSize, fullSync, async (workspace) => {
      // Категории синхронизируем всегда (они лёгкие)
      await this.syncCategories(workspace.id);
      await this.loadCategoryMap();

      if (fullSync) {
        return this.fullSyncLoop('products', workspace.id, batchSize,
          () => this.legacyService.getActiveProductsCount(),
          (offset, limit) => this.legacyService.getAllActiveProductsBatch(offset, limit),
          (batch, wsId) => this.syncProductBatch(batch, wsId),
        );
      }

      const lastId = await this.getLastSyncedLegacyId('products');
      const totalNew = await this.legacyService.getProductsCountSinceId(lastId);

      if (totalNew === 0) {
        this.logger.log('Товары: нет новых записей');
        return { created: 0, updated: 0, errors: 0, totalProcessed: 0 };
      }

      this.logger.log(`Товары: ${totalNew} новых (sinceId=${lastId})`);
      this.initProgress('products', totalNew);

      let created = 0, updated = 0, errors = 0, processed = 0;
      let currentMinId = lastId;

      while (processed < totalNew) {
        const batch = await this.withRetry(() =>
          this.legacyService.getProductsSinceId(currentMinId, batchSize),
        );
        if (batch.length === 0) break;

        const result = await this.syncProductBatch(batch, workspace.id);
        created += result.created;
        updated += result.updated;
        errors += result.errors;
        processed += batch.length;
        currentMinId = batch[batch.length - 1].id;

        this.updateProgress('products', processed, created, errors);
        this.checkCircuitBreaker(errors, processed, 'products');
        await this.throttle();
      }

      return { created, updated, errors, totalProcessed: processed };
    });
  }

  /**
   * Синхронизация сделок.
   * Сделки имеют updated_at — используем delta sync по дате.
   * fullSync=false: только записи, изменённые после последней синхронизации.
   * fullSync=true: полная переповторная синхронизация.
   */
  async syncDeals(batchSize = DEFAULT_BATCH_SIZE, fullSync = false): Promise<SyncResult> {
    return this.runSync('deals', batchSize, fullSync, async (workspace) => {
      const cpSyncLogs = await this.syncLogRepo.find({
        where: { systemType: 'counterparties' },
        select: ['legacyId', 'entityId'],
      });
      const cpEntityMap = new Map(cpSyncLogs.map((l) => [l.legacyId, l.entityId]));
      const cpWorkspace = await this.ensureCounterpartiesWorkspace();

      // Загружаем deal stages если ещё нет
      if (this.dealStageMap.size === 0) {
        const stages = await this.legacyService.getAllDealStages();
        for (const s of stages) {
          this.dealStageMap.set(s.id, { alias: s.alias || `stage-${s.id}`, title: s.title });
        }
      }

      if (fullSync) {
        return this.fullSyncLoop('deals', workspace.id, batchSize,
          () => this.legacyService.getDealsCount(),
          (offset, limit) => this.legacyService.getAllDealsBatch(offset, limit),
          (batch, wsId) => this.syncDealBatch(batch, wsId, cpWorkspace.id, cpEntityMap),
        );
      }

      // Delta sync: deals имеют updated_at
      const lastSyncTime = await this.getLastSyncTime('deals');
      const totalNew = await this.legacyService.getDealsCountSinceDate(lastSyncTime);

      if (totalNew === 0) {
        this.logger.log('Сделки: нет изменений');
        return { created: 0, updated: 0, errors: 0, totalProcessed: 0 };
      }

      this.logger.log(`Сделки: ${totalNew} изменений (since=${lastSyncTime.toISOString()})`);
      this.initProgress('deals', totalNew);

      let created = 0, updated = 0, errors = 0, processed = 0;

      // Для delta sync по дате используем offset-based пагинацию
      while (processed < totalNew) {
        const batch = await this.withRetry(() =>
          this.legacyService.getDealsSinceDate(lastSyncTime, batchSize),
        );
        if (batch.length === 0) break;

        const result = await this.syncDealBatch(batch, workspace.id, cpWorkspace.id, cpEntityMap);
        created += result.created;
        updated += result.updated;
        errors += result.errors;
        processed += batch.length;

        this.updateProgress('deals', processed, created, errors);
        this.checkCircuitBreaker(errors, processed, 'deals');

        // Если получили меньше batchSize — это последний батч
        if (batch.length < batchSize) break;
        await this.throttle();
      }

      return { created, updated, errors, totalProcessed: processed };
    });
  }

  // ==================== CRON ====================

  /**
   * Ночная инкрементальная синхронизация (02:00).
   * Обрабатывает ТОЛЬКО новые записи — щадящая нагрузка на legacy.
   */
  @Cron('0 2 * * *')
  async scheduledSync(): Promise<void> {
    if (!this.cronEnabled || !this.legacyService.isAvailable()) return;

    this.logger.log('Запуск ночной инкрементальной синхронизации...');
    this.lastCronRunAt = new Date();

    const results: SyncResult[] = [];
    const errors: string[] = [];

    for (const syncFn of [
      () => this.syncCounterparties(),   // incremental
      () => this.syncProducts(),          // incremental
      () => this.syncContacts(),          // incremental
      () => this.syncDeals(),             // delta by updated_at
    ]) {
      try {
        results.push(await syncFn());
      } catch (e) {
        errors.push(e.message);
        this.logger.warn(`Cron sync ошибка: ${e.message}`);
      }
    }

    const summary = this.formatSyncSummary(results, errors, false);
    this.logger.log(summary);
    await this.sendTelegramAlert(summary);
  }

  /**
   * Еженедельная полная синхронизация (воскресенье 03:00).
   * Обновляет ВСЕ записи — ловит изменения в legacy.
   * Entities без updated_at (counterparties, products, contacts) обновляются только здесь.
   */
  @Cron('0 3 * * 0')
  async scheduledFullSync(): Promise<void> {
    if (!this.cronEnabled || !this.legacyService.isAvailable()) return;

    this.logger.log('Запуск еженедельной полной синхронизации...');

    const results: SyncResult[] = [];
    const errors: string[] = [];

    for (const syncFn of [
      () => this.syncCounterparties(DEFAULT_BATCH_SIZE, true),
      () => this.syncProducts(DEFAULT_BATCH_SIZE, true),
      () => this.syncContacts(DEFAULT_BATCH_SIZE, true),
      () => this.syncDeals(DEFAULT_BATCH_SIZE, true),
    ]) {
      try {
        results.push(await syncFn());
      } catch (e) {
        errors.push(e.message);
        this.logger.warn(`Full sync ошибка: ${e.message}`);
      }
    }

    const summary = this.formatSyncSummary(results, errors, true);
    this.logger.log(summary);
    await this.sendTelegramAlert(summary);
  }

  enableCron(): void { this.cronEnabled = true; }
  disableCron(): void { this.cronEnabled = false; }

  // ==================== STATUS ====================

  getSyncStatus(): SyncStatus {
    return {
      counterparties: { ...this.progress.counterparties },
      contacts: { ...this.progress.contacts },
      products: { ...this.progress.products },
      deals: { ...this.progress.deals },
      cronEnabled: this.cronEnabled,
      lastCronRunAt: this.lastCronRunAt,
    };
  }

  getProgress(systemType: SystemType): SyncProgress {
    return { ...this.progress[systemType] };
  }

  async getPreview(systemType: SystemType): Promise<{
    totalLegacy: number;
    alreadySynced: number;
    remaining: number;
    workspaceExists: boolean;
    workspaceId: string | null;
  }> {
    let totalLegacy = 0;
    switch (systemType) {
      case 'counterparties':
        totalLegacy = await this.legacyService.getCounterpartiesCount();
        break;
      case 'contacts':
        totalLegacy = await this.legacyService.getContactsCount();
        break;
      case 'products':
        totalLegacy = await this.legacyService.getActiveProductsCount();
        break;
      case 'deals':
        totalLegacy = await this.legacyService.getDealsCount();
        break;
    }

    const alreadySynced = await this.syncLogRepo.count({
      where: { systemType, status: 'completed' },
    });

    const ws = await this.workspaceRepo.findOne({ where: { systemType } });

    return {
      totalLegacy,
      alreadySynced,
      remaining: Math.max(0, totalLegacy - alreadySynced),
      workspaceExists: !!ws,
      workspaceId: ws?.id ?? null,
    };
  }

  // ==================== PRIVATE: SYNC INFRASTRUCTURE ====================

  /** Обёртка sync-операции: ensure workspace, track progress, handle errors */
  private async runSync(
    systemType: SystemType,
    _batchSize: number,
    incremental: boolean,
    syncFn: (workspace: Workspace) => Promise<{ created: number; updated: number; errors: number; totalProcessed: number }>,
  ): Promise<SyncResult> {
    const startTime = Date.now();

    if (this.progress[systemType].isRunning) {
      throw new Error(`Синхронизация ${systemType} уже запущена`);
    }

    try {
      const workspace = systemType === 'deals'
        ? await this.ensureDealsWorkspace()
        : systemType === 'products'
        ? await this.ensureProductsWorkspace()
        : systemType === 'contacts'
        ? await this.ensureContactsWorkspace()
        : await this.ensureCounterpartiesWorkspace();

      const result = await syncFn(workspace);

      this.progress[systemType].isRunning = false;
      this.progress[systemType].completedAt = new Date();

      const syncResult: SyncResult = {
        systemType,
        ...result,
        durationMs: Date.now() - startTime,
        incremental: !incremental,
      };

      this.logger.log(
        `Sync ${systemType}: ${result.created} создано, ${result.updated} обновлено, ${result.errors} ошибок за ${syncResult.durationMs}ms`,
      );

      return syncResult;
    } catch (error) {
      this.progress[systemType].isRunning = false;
      this.progress[systemType].lastError = error.message;
      this.logger.error(`Ошибка sync ${systemType}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Общий цикл полной синхронизации (full resync).
   * Используется для всех типов при fullSync=true.
   */
  private async fullSyncLoop(
    systemType: SystemType,
    workspaceId: string,
    batchSize: number,
    getCount: () => Promise<number>,
    getBatch: (offset: number, limit: number) => Promise<any[]>,
    processBatch: (batch: any[], wsId: string) => Promise<{ created: number; updated: number; errors: number }>,
  ): Promise<{ created: number; updated: number; errors: number; totalProcessed: number }> {
    const totalCount = await getCount();
    this.initProgress(systemType, totalCount);

    let offset = 0;
    let created = 0, updated = 0, errors = 0;

    while (offset < totalCount) {
      const batch = await this.withRetry(() => getBatch(offset, batchSize));
      if (batch.length === 0) break;

      const result = await processBatch(batch, workspaceId);
      created += result.created;
      updated += result.updated;
      errors += result.errors;
      this.updateProgress(systemType, offset + batch.length, created, errors);

      this.checkCircuitBreaker(errors, offset + batch.length, systemType);

      offset += batchSize;
      await this.throttle();
    }

    return { created, updated, errors, totalProcessed: offset };
  }

  /** Retry с exponential backoff — защита от transient failures legacy DB */
  private async withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === maxAttempts - 1) throw err;
        const delay = 1000 * Math.pow(2, i);
        this.logger.warn(`Retry ${i + 1}/${maxAttempts} через ${delay}ms: ${err.message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw new Error('Unreachable');
  }

  /** Пауза между батчами — щадящая нагрузка на legacy DB */
  private throttle(): Promise<void> {
    return new Promise((r) => setTimeout(r, BATCH_THROTTLE_MS));
  }

  /**
   * Circuit breaker: прерывает sync если % ошибок слишком высокий.
   * Защита от каскадных отказов — если legacy DB нестабильна, не нужно
   * продолжать бомбить её запросами.
   */
  private checkCircuitBreaker(errors: number, processed: number, systemType: SystemType): void {
    if (processed < CIRCUIT_BREAKER_MIN_PROCESSED) return;
    const errorRate = errors / processed;
    if (errorRate > CIRCUIT_BREAKER_ERROR_RATE) {
      const msg = `Circuit breaker ${systemType}: ${errors}/${processed} ошибок (${Math.round(errorRate * 100)}% > ${CIRCUIT_BREAKER_ERROR_RATE * 100}%)`;
      this.sendTelegramAlert(`🚨 ${msg}`).catch(() => {});
      throw new Error(msg);
    }
  }

  /** Максимальный legacyId, который мы уже синхронизировали для данного типа */
  private async getLastSyncedLegacyId(systemType: SystemType): Promise<number> {
    const result = await this.syncLogRepo
      .createQueryBuilder('log')
      .select('MAX(log.legacyId)', 'maxId')
      .where('log.systemType = :systemType', { systemType })
      .andWhere('log.status = :status', { status: 'completed' })
      .getRawOne();
    return result?.maxId ?? 0;
  }

  /** Время последней успешной синхронизации (для delta sync сделок по updated_at) */
  private async getLastSyncTime(systemType: SystemType): Promise<Date> {
    const result = await this.syncLogRepo
      .createQueryBuilder('log')
      .select('MAX(log.syncedAt)', 'maxDate')
      .where('log.systemType = :systemType', { systemType })
      .andWhere('log.status = :status', { status: 'completed' })
      .getRawOne();
    return result?.maxDate ? new Date(result.maxDate) : new Date(0);
  }

  private initProgress(systemType: SystemType, totalItems: number): void {
    this.progress[systemType] = {
      ...this.emptyProgress(systemType),
      isRunning: true,
      totalItems,
      startedAt: new Date(),
    };
  }

  private updateProgress(systemType: SystemType, processed: number, created: number, errors: number): void {
    this.progress[systemType].processedItems = processed;
    this.progress[systemType].createdItems = created;
    this.progress[systemType].errors = errors;
  }

  // ==================== PRIVATE: TELEGRAM ALERTS ====================

  /**
   * Отправка уведомления в Telegram.
   * Используется для алертов при ошибках синхронизации и ежедневных отчётов.
   */
  private async sendTelegramAlert(message: string): Promise<void> {
    if (!this.telegramBotToken || !this.telegramChatId) return;

    try {
      await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.telegramChatId,
          text: message,
          parse_mode: 'HTML',
          disable_notification: false,
        }),
      });
    } catch (e) {
      this.logger.warn(`Telegram alert failed: ${e.message}`);
    }
  }

  /** Форматирование отчёта о синхронизации */
  private formatSyncSummary(results: SyncResult[], errors: string[], isFull: boolean): string {
    const mode = isFull ? '📊 Полная' : '🔄 Инкрементальная';
    const lines = [`<b>${mode} синхронизация CRM</b>`];

    for (const r of results) {
      const icon = r.errors > 0 ? '⚠️' : r.created > 0 || r.updated > 0 ? '✅' : '➖';
      const parts = [];
      if (r.created > 0) parts.push(`+${r.created}`);
      if (r.updated > 0) parts.push(`${r.updated} обн.`);
      if (r.errors > 0) parts.push(`${r.errors} ош.`);
      if (parts.length === 0) parts.push('без изменений');
      lines.push(`${icon} ${r.systemType}: ${parts.join(', ')} (${Math.round(r.durationMs / 1000)}с)`);
    }

    for (const err of errors) {
      lines.push(`❌ ${err}`);
    }

    return lines.join('\n');
  }

  // ==================== PRIVATE: WORKSPACE ====================

  private async ensureSystemWorkspace(
    systemType: SystemType,
    name: string,
    icon: string,
    prefix: string,
    sections: any[],
    statuses?: any[],
  ): Promise<Workspace> {
    let ws = await this.workspaceRepo.findOne({ where: { systemType } });
    if (ws) {
      const currentFieldIds = new Set(
        (ws.sections as any[])?.flatMap((s: any) => s.fields?.map((f: any) => f.id) ?? []) ?? [],
      );
      const newFieldIds = sections.flatMap((s: any) => s.fields?.map((f: any) => f.id) ?? []);
      const hasNewFields = newFieldIds.some((id: string) => !currentFieldIds.has(id));
      if (hasNewFields) {
        ws.sections = sections;
        ws = await this.workspaceRepo.save(ws);
        this.logger.log(`Обновлены секции workspace "${name}" (${prefix}): +${newFieldIds.filter((id: string) => !currentFieldIds.has(id)).join(', ')}`);
      }
      return ws;
    }

    const wsData: any = {
      name,
      icon,
      prefix,
      lastEntityNumber: 0,
      isArchived: false,
      isInternal: false,
      isSystem: true,
      systemType,
      showInMenu: true,
      orderInSection: 0,
      sections,
    };

    if (statuses) {
      wsData.statuses = statuses;
    }

    const newWs = this.workspaceRepo.create(wsData as Partial<Workspace>);
    const saved = await this.workspaceRepo.save(newWs);
    this.logger.log(`Создан системный workspace "${name}" (${prefix}), id=${saved.id}`);
    return saved;
  }

  // ==================== PRIVATE: BATCH SYNC ====================

  private async syncCounterpartyBatch(
    batch: LegacyCounterparty[],
    workspaceId: string,
  ): Promise<{ created: number; updated: number; errors: number }> {
    let created = 0, updated = 0, errors = 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const cp of batch) {
        try {
          const existingLog = await this.syncLogRepo.findOne({
            where: { systemType: 'counterparties', legacyId: cp.id },
          });

          const title = cp.name || `Контрагент #${cp.id}`;
          const status = this.mapCounterpartyStatus(cp.status);
          const data: Record<string, any> = {
            inn: cp.inn || null,
            kpp: cp.kpp || null,
            ogrn: cp.ogrn || null,
            orgType: this.mapCounterpartyType(cp.type),
            director: cp.director || null,
            address: cp.address || null,
            bankName: cp.bankName || null,
            bankBik: cp.bankBik || null,
            employeeCount: cp.employeeCount || null,
            legacyId: cp.id,
            legacyUrl: this.legacyUrlService.getCounterpartyUrl(cp.id),
          };

          if (existingLog) {
            await queryRunner.query(
              `UPDATE "entities" SET "title" = $1, "status" = $2, "data" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
              [title, status, JSON.stringify(data), existingLog.entityId],
            );
            updated++;
          } else {
            const entityId = uuidv4();
            const customId = `CO-${cp.id}`;
            await queryRunner.query(
              `INSERT INTO "entities" ("id", "customId", "workspaceId", "title", "status", "data", "linkedEntityIds", "commentCount", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, '[]', 0, NOW(), NOW())
               ON CONFLICT ("customId") DO NOTHING`,
              [entityId, customId, workspaceId, title, status, JSON.stringify(data)],
            );
            await queryRunner.query(
              `INSERT INTO "system_sync_log" ("id", "systemType", "legacyId", "entityId", "status", "syncedAt")
               VALUES ($1, 'counterparties', $2, $3, 'completed', NOW())
               ON CONFLICT ("systemType", "legacyId") DO NOTHING`,
              [uuidv4(), cp.id, entityId],
            );
            created++;
          }
        } catch (e) {
          errors++;
          this.logger.warn(`Ошибка sync контрагента ${cp.id}: ${e.message}`);
        }
      }
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    return { created, updated, errors };
  }

  private async syncContactBatch(
    batch: LegacyCustomer[],
    workspaceId: string,
    cpWorkspaceId: string,
    cpEntityMap: Map<number, string>,
  ): Promise<{ created: number; updated: number; errors: number }> {
    let created = 0, updated = 0, errors = 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const customer of batch) {
        try {
          const existingLog = await this.syncLogRepo.findOne({
            where: { systemType: 'contacts', legacyId: customer.id },
          });

          const firstName = customer.firstName || '';
          const lastName = customer.lastName || '';
          const title = [firstName, lastName].filter(Boolean).join(' ') || customer.email || `Контакт #${customer.id}`;
          const status = 'active';

          let counterpartyRelation: any = null;
          if (customer.defaultCounterpartyId && customer.defaultCounterpartyId > 0) {
            const cpEntityId = cpEntityMap.get(customer.defaultCounterpartyId);
            if (cpEntityId) {
              counterpartyRelation = {
                id: cpEntityId,
                customId: `CO-${customer.defaultCounterpartyId}`,
                workspaceId: cpWorkspaceId,
              };
            }
          }

          const data: Record<string, any> = {
            email: customer.email || null,
            phone: customer.phone || null,
            position: customer.position || null,
            counterparty: counterpartyRelation,
            legacyId: customer.id,
            isEmployee: customer.isManager === 1,
            legacyUrl: this.legacyUrlService.getCustomerUrl(customer.id),
          };

          if (existingLog) {
            await queryRunner.query(
              `UPDATE "entities" SET "title" = $1, "status" = $2, "data" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
              [title, status, JSON.stringify(data), existingLog.entityId],
            );
            updated++;
          } else {
            const entityId = uuidv4();
            const customId = `CT-${customer.id}`;
            await queryRunner.query(
              `INSERT INTO "entities" ("id", "customId", "workspaceId", "title", "status", "data", "linkedEntityIds", "commentCount", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, '[]', 0, NOW(), NOW())
               ON CONFLICT ("customId") DO NOTHING`,
              [entityId, customId, workspaceId, title, status, JSON.stringify(data)],
            );
            await queryRunner.query(
              `INSERT INTO "system_sync_log" ("id", "systemType", "legacyId", "entityId", "status", "syncedAt")
               VALUES ($1, 'contacts', $2, $3, 'completed', NOW())
               ON CONFLICT ("systemType", "legacyId") DO NOTHING`,
              [uuidv4(), customer.id, entityId],
            );
            created++;
          }
        } catch (e) {
          errors++;
          this.logger.warn(`Ошибка sync контакта ${customer.id}: ${e.message}`);
        }
      }
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    return { created, updated, errors };
  }

  private async syncProductBatch(
    batch: LegacyProduct[],
    workspaceId: string,
  ): Promise<{ created: number; updated: number; errors: number }> {
    let created = 0, updated = 0, errors = 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const product of batch) {
        try {
          const existingLog = await this.syncLogRepo.findOne({
            where: { systemType: 'products', legacyId: product.id },
          });

          const title = product.name || `Товар #${product.id}`;
          const status = this.mapProductStatus(product);
          const categoryName = product.categoryId ? this.categoryMap.get(product.categoryId) : null;

          const data: Record<string, any> = {
            productCode: product.productCode || null,
            description: product.briefDescription || null,
            price: Number(product.price) || 0,
            basePrice: Number(product.basePrice) || 0,
            fobPrice: Number(product.fobPrice) || 0,
            warranty: product.warranty ?? 12,
            category: categoryName || null,
            factoryName: product.factoryName || null,
            inStock: product.inStock || 0,
            legacyId: product.id,
            legacyUrl: this.legacyUrlService.getProductUrl(product.uri),
          };

          if (existingLog) {
            await queryRunner.query(
              `UPDATE "entities" SET "title" = $1, "status" = $2, "data" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
              [title, status, JSON.stringify(data), existingLog.entityId],
            );
            updated++;
          } else {
            const entityId = uuidv4();
            const customId = `PR-${product.id}`;
            await queryRunner.query(
              `INSERT INTO "entities" ("id", "customId", "workspaceId", "title", "status", "data", "linkedEntityIds", "commentCount", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, '[]', 0, NOW(), NOW())
               ON CONFLICT ("customId") DO NOTHING`,
              [entityId, customId, workspaceId, title, status, JSON.stringify(data)],
            );
            await queryRunner.query(
              `INSERT INTO "system_sync_log" ("id", "systemType", "legacyId", "entityId", "status", "syncedAt")
               VALUES ($1, 'products', $2, $3, 'completed', NOW())
               ON CONFLICT ("systemType", "legacyId") DO NOTHING`,
              [uuidv4(), product.id, entityId],
            );
            created++;
          }
        } catch (e) {
          errors++;
          this.logger.warn(`Ошибка sync товара ${product.id}: ${e.message}`);
        }
      }
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    return { created, updated, errors };
  }

  private async syncDealBatch(
    batch: LegacyDeal[],
    workspaceId: string,
    cpWorkspaceId: string,
    cpEntityMap: Map<number, string>,
  ): Promise<{ created: number; updated: number; errors: number }> {
    let created = 0, updated = 0, errors = 0;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const deal of batch) {
        try {
          const existingLog = await this.syncLogRepo.findOne({
            where: { systemType: 'deals', legacyId: deal.id },
          });

          const title = deal.title || `Сделка #${deal.id}`;
          const stageInfo = deal.dealStageId ? this.dealStageMap.get(deal.dealStageId) : null;
          const status = stageInfo?.alias || 'new';

          // Relation к контрагенту
          let counterpartyRelation: any = null;
          if (deal.counterpartyId && deal.counterpartyId > 0) {
            const cpEntityId = cpEntityMap.get(deal.counterpartyId);
            if (cpEntityId) {
              counterpartyRelation = {
                id: cpEntityId,
                customId: `CO-${deal.counterpartyId}`,
                workspaceId: cpWorkspaceId,
              };
            }
          }

          const completion = deal.completion === 'won' ? 'won'
            : deal.completion === 'lost' ? 'lost'
            : 'in_progress';

          const data: Record<string, any> = {
            amount: Number(deal.amount) || 0,
            counterparty: counterpartyRelation,
            completion,
            legacyId: deal.id,
            legacyUrl: this.legacyUrlService.getDealUrl(deal.id),
          };

          if (existingLog) {
            await queryRunner.query(
              `UPDATE "entities" SET "title" = $1, "status" = $2, "data" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
              [title, status, JSON.stringify(data), existingLog.entityId],
            );
            updated++;
          } else {
            const entityId = uuidv4();
            const customId = `DL-${deal.id}`;
            await queryRunner.query(
              `INSERT INTO "entities" ("id", "customId", "workspaceId", "title", "status", "data", "linkedEntityIds", "commentCount", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, '[]', 0, $7, NOW())
               ON CONFLICT ("customId") DO NOTHING`,
              [entityId, customId, workspaceId, title, status, JSON.stringify(data), deal.createdAt || new Date()],
            );
            await queryRunner.query(
              `INSERT INTO "system_sync_log" ("id", "systemType", "legacyId", "entityId", "status", "syncedAt")
               VALUES ($1, 'deals', $2, $3, 'completed', NOW())
               ON CONFLICT ("systemType", "legacyId") DO NOTHING`,
              [uuidv4(), deal.id, entityId],
            );
            created++;
          }
        } catch (e) {
          errors++;
          this.logger.warn(`Ошибка sync сделки ${deal.id}: ${e.message}`);
        }
      }
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    return { created, updated, errors };
  }

  // ==================== PRIVATE: CATEGORY SYNC ====================

  /**
   * Синхронизация legacy категорий → product_categories.
   * Двухпроходная: сначала все без parent, потом обновляем parent.
   */
  private async syncCategories(workspaceId: string): Promise<void> {
    try {
      const legacyCategories = await this.legacyService.getAllActiveCategories();
      if (legacyCategories.length === 0) return;

      // Первый проход: upsert все категории (parent ещё может не существовать)
      for (const cat of legacyCategories) {
        await this.productCategoryService.upsertFromLegacy(
          workspaceId, cat.id, cat.name, null, cat.uri || null, cat.sortOrder,
        );
      }

      // Второй проход: обновляем parent-связи
      for (const cat of legacyCategories) {
        if (cat.parent && cat.parent > 0) {
          await this.productCategoryService.upsertFromLegacy(
            workspaceId, cat.id, cat.name, cat.parent, cat.uri || null, cat.sortOrder,
          );
        }
      }

      await this.productCategoryService.recalculateCounts(workspaceId);
      this.logger.log(`Синхронизировано ${legacyCategories.length} категорий товаров`);
    } catch (error) {
      this.logger.warn(`Ошибка sync категорий: ${error.message}`);
    }
  }

  private async loadCategoryMap(): Promise<void> {
    const categories = await this.legacyService.getAllActiveCategories();
    this.categoryMap.clear();
    for (const cat of categories) {
      this.categoryMap.set(cat.id, cat.name);
    }
  }

  // ==================== PRIVATE: MAPPERS ====================

  private mapCounterpartyStatus(dadataStatus?: string | null): string {
    if (!dadataStatus) return 'active';
    const s = dadataStatus.toLowerCase();
    if (s === 'liquidated' || s === 'liquidating') return 'liquidated';
    if (s === 'inactive' || s === 'reorganizing') return 'inactive';
    return 'active';
  }

  private mapCounterpartyType(type?: string | null): string {
    if (!type) return 'legal';
    const t = type.toLowerCase();
    if (t === 'individual' || t === 'ип') return 'individual';
    if (t === 'person' || t === 'фл') return 'person';
    return 'legal';
  }

  private mapProductStatus(product: LegacyProduct): string {
    if (product.enabled !== 1) return 'disabled';
    if ((product.inStock ?? 0) <= 0) return 'out_of_stock';
    return 'active';
  }

  private emptyProgress(systemType: SystemType): SyncProgress {
    return {
      systemType,
      isRunning: false,
      totalItems: 0,
      processedItems: 0,
      createdItems: 0,
      errors: 0,
      startedAt: null,
      completedAt: null,
      lastError: null,
    };
  }
}
