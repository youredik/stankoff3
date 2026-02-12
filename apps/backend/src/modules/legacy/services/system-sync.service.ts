import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';
import { Workspace } from '../../workspace/workspace.entity';
import { SystemSyncLog } from '../entities/system-sync-log.entity';
import { LegacyService } from './legacy.service';
import { LegacyUrlService } from './legacy-url.service';
import { LegacyCounterparty, LegacyCustomer, LegacyProduct, LegacyCategory } from '../entities';

export type SystemType = 'counterparties' | 'contacts' | 'products';

export interface SyncResult {
  systemType: SystemType;
  created: number;
  updated: number;
  errors: number;
  totalProcessed: number;
  durationMs: number;
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
  cronEnabled: boolean;
  lastCronRunAt: Date | null;
}

/** Определения секций для системных workspace */
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
    id: 'legacy',
    name: 'Legacy CRM',
    order: 2,
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
      {
        id: 'price', name: 'Цена', type: 'number' as const, system: true,
        config: { type: 'number', subtype: 'money', suffix: '₽' },
      },
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
    id: 'legacy',
    name: 'Legacy CRM',
    order: 1,
    fields: [
      { id: 'legacyId', name: 'Legacy ID', type: 'number' as const, system: true },
      { id: 'legacyUrl', name: 'Ссылка в каталоге', type: 'url' as const, system: true },
    ],
  },
];

@Injectable()
export class SystemSyncService {
  private readonly logger = new Logger(SystemSyncService.name);
  private cronEnabled = true;
  private lastCronRunAt: Date | null = null;

  private progress: Record<SystemType, SyncProgress> = {
    counterparties: this.emptyProgress('counterparties'),
    contacts: this.emptyProgress('contacts'),
    products: this.emptyProgress('products'),
  };

  // Кэш категорий для маппинга
  private categoryMap = new Map<number, string>();

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    @InjectRepository(SystemSyncLog)
    private readonly syncLogRepo: Repository<SystemSyncLog>,
    private readonly dataSource: DataSource,
    private readonly legacyService: LegacyService,
    private readonly legacyUrlService: LegacyUrlService,
  ) {}

  // ==================== WORKSPACE MANAGEMENT ====================

  /**
   * Создать или получить workspace для контрагентов
   */
  async ensureCounterpartiesWorkspace(): Promise<Workspace> {
    return this.ensureSystemWorkspace(
      'counterparties',
      'Контрагенты',
      '🏢',
      'CO',
      COUNTERPARTY_SECTIONS,
    );
  }

  /**
   * Создать или получить workspace для контактов
   */
  async ensureContactsWorkspace(): Promise<Workspace> {
    // Нужен ID workspace контрагентов для relation-поля
    const cpWs = await this.ensureCounterpartiesWorkspace();

    const sections = JSON.parse(JSON.stringify(CONTACT_SECTIONS));
    // Проставляем relatedWorkspaceId для поля "Контрагент"
    const mainSection = sections.find((s: { id: string }) => s.id === 'main');
    if (mainSection) {
      const counterpartyField = mainSection.fields.find((f: { id: string }) => f.id === 'counterparty');
      if (counterpartyField) {
        counterpartyField.relatedWorkspaceId = cpWs.id;
      }
    }

    return this.ensureSystemWorkspace(
      'contacts',
      'Контакты',
      '👤',
      'CT',
      sections,
    );
  }

  /**
   * Создать или получить workspace для товаров
   */
  async ensureProductsWorkspace(): Promise<Workspace> {
    return this.ensureSystemWorkspace(
      'products',
      'Товары',
      '📦',
      'PR',
      PRODUCT_SECTIONS,
    );
  }

  /**
   * Создать все системные workspace
   */
  async ensureAllWorkspaces(): Promise<{
    counterparties: Workspace;
    contacts: Workspace;
    products: Workspace;
  }> {
    const counterparties = await this.ensureCounterpartiesWorkspace();
    const contacts = await this.ensureContactsWorkspace();
    const products = await this.ensureProductsWorkspace();
    return { counterparties, contacts, products };
  }

  // ==================== SYNC OPERATIONS ====================

  /**
   * Синхронизировать контрагентов из legacy
   */
  async syncCounterparties(batchSize = 500): Promise<SyncResult> {
    const systemType: SystemType = 'counterparties';
    const startTime = Date.now();

    if (this.progress[systemType].isRunning) {
      throw new Error('Синхронизация контрагентов уже запущена');
    }

    try {
      const workspace = await this.ensureCounterpartiesWorkspace();
      const totalCount = await this.legacyService.getCounterpartiesCount();

      this.progress[systemType] = {
        ...this.emptyProgress(systemType),
        isRunning: true,
        totalItems: totalCount,
        startedAt: new Date(),
      };

      let offset = 0;
      let created = 0;
      let updated = 0;
      let errors = 0;

      while (offset < totalCount) {
        const batch = await this.legacyService.getAllCounterpartiesBatch(offset, batchSize);
        if (batch.length === 0) break;

        const result = await this.syncCounterpartyBatch(batch, workspace.id);
        created += result.created;
        updated += result.updated;
        errors += result.errors;

        this.progress[systemType].processedItems = offset + batch.length;
        this.progress[systemType].createdItems = created;
        this.progress[systemType].errors = errors;

        offset += batchSize;
      }

      this.progress[systemType].isRunning = false;
      this.progress[systemType].completedAt = new Date();

      const syncResult: SyncResult = {
        systemType,
        created,
        updated,
        errors,
        totalProcessed: offset,
        durationMs: Date.now() - startTime,
      };

      this.logger.log(
        `Sync контрагентов завершён: ${created} создано, ${updated} обновлено, ${errors} ошибок за ${syncResult.durationMs}ms`,
      );

      return syncResult;
    } catch (error) {
      this.progress[systemType].isRunning = false;
      this.progress[systemType].lastError = error.message;
      this.logger.error(`Ошибка sync контрагентов: ${error.message}`);
      throw error;
    }
  }

  /**
   * Синхронизировать контакты из legacy
   */
  async syncContacts(batchSize = 500, activeOnly = false): Promise<SyncResult> {
    const systemType: SystemType = 'contacts';
    const startTime = Date.now();

    if (this.progress[systemType].isRunning) {
      throw new Error('Синхронизация контактов уже запущена');
    }

    try {
      const workspace = await this.ensureContactsWorkspace();
      const cpWorkspace = await this.ensureCounterpartiesWorkspace();
      const totalCount = await this.legacyService.getContactsCount(activeOnly);

      this.progress[systemType] = {
        ...this.emptyProgress(systemType),
        isRunning: true,
        totalItems: totalCount,
        startedAt: new Date(),
      };

      // Строим маппинг legacyCounterpartyId → entityId для relation
      const cpSyncLogs = await this.syncLogRepo.find({
        where: { systemType: 'counterparties' },
        select: ['legacyId', 'entityId'],
      });
      const cpEntityMap = new Map(cpSyncLogs.map((l) => [l.legacyId, l.entityId]));

      let offset = 0;
      let created = 0;
      let updated = 0;
      let errors = 0;

      while (offset < totalCount) {
        const batch = activeOnly
          ? await this.legacyService.getContactsWithCounterpartyBatch(offset, batchSize)
          : await this.legacyService.getAllContactsBatch(offset, batchSize);
        if (batch.length === 0) break;

        const result = await this.syncContactBatch(batch, workspace.id, cpWorkspace.id, cpEntityMap);
        created += result.created;
        updated += result.updated;
        errors += result.errors;

        this.progress[systemType].processedItems = offset + batch.length;
        this.progress[systemType].createdItems = created;
        this.progress[systemType].errors = errors;

        offset += batchSize;
      }

      this.progress[systemType].isRunning = false;
      this.progress[systemType].completedAt = new Date();

      const syncResult: SyncResult = {
        systemType,
        created,
        updated,
        errors,
        totalProcessed: offset,
        durationMs: Date.now() - startTime,
      };

      this.logger.log(
        `Sync контактов завершён: ${created} создано, ${updated} обновлено, ${errors} ошибок за ${syncResult.durationMs}ms`,
      );

      return syncResult;
    } catch (error) {
      this.progress[systemType].isRunning = false;
      this.progress[systemType].lastError = error.message;
      this.logger.error(`Ошибка sync контактов: ${error.message}`);
      throw error;
    }
  }

  /**
   * Синхронизировать товары из legacy
   */
  async syncProducts(batchSize = 500): Promise<SyncResult> {
    const systemType: SystemType = 'products';
    const startTime = Date.now();

    if (this.progress[systemType].isRunning) {
      throw new Error('Синхронизация товаров уже запущена');
    }

    try {
      const workspace = await this.ensureProductsWorkspace();
      const totalCount = await this.legacyService.getActiveProductsCount();

      // Загружаем категории для маппинга ID → name
      await this.loadCategoryMap();

      this.progress[systemType] = {
        ...this.emptyProgress(systemType),
        isRunning: true,
        totalItems: totalCount,
        startedAt: new Date(),
      };

      let offset = 0;
      let created = 0;
      let updated = 0;
      let errors = 0;

      while (offset < totalCount) {
        const batch = await this.legacyService.getAllActiveProductsBatch(offset, batchSize);
        if (batch.length === 0) break;

        const result = await this.syncProductBatch(batch, workspace.id);
        created += result.created;
        updated += result.updated;
        errors += result.errors;

        this.progress[systemType].processedItems = offset + batch.length;
        this.progress[systemType].createdItems = created;
        this.progress[systemType].errors = errors;

        offset += batchSize;
      }

      this.progress[systemType].isRunning = false;
      this.progress[systemType].completedAt = new Date();

      const syncResult: SyncResult = {
        systemType,
        created,
        updated,
        errors,
        totalProcessed: offset,
        durationMs: Date.now() - startTime,
      };

      this.logger.log(
        `Sync товаров завершён: ${created} создано, ${updated} обновлено, ${errors} ошибок за ${syncResult.durationMs}ms`,
      );

      return syncResult;
    } catch (error) {
      this.progress[systemType].isRunning = false;
      this.progress[systemType].lastError = error.message;
      this.logger.error(`Ошибка sync товаров: ${error.message}`);
      throw error;
    }
  }

  // ==================== CRON ====================

  /**
   * Периодическая синхронизация (каждые 30 минут)
   * Запускает полную синхронизацию всех справочников последовательно
   */
  @Cron('0 */30 * * *')
  async scheduledSync(): Promise<void> {
    if (!this.cronEnabled || !this.legacyService.isAvailable()) return;

    this.logger.log('Запуск cron-синхронизации системных справочников...');
    this.lastCronRunAt = new Date();

    try {
      await this.syncCounterparties();
    } catch (e) {
      this.logger.warn(`Cron sync контрагентов: ${e.message}`);
    }

    try {
      await this.syncProducts();
    } catch (e) {
      this.logger.warn(`Cron sync товаров: ${e.message}`);
    }

    // Контакты — только с привязкой к контрагентам (чтобы не перегружать)
    try {
      await this.syncContacts(500, true);
    } catch (e) {
      this.logger.warn(`Cron sync контактов: ${e.message}`);
    }

    this.logger.log('Cron-синхронизация системных справочников завершена');
  }

  enableCron(): void {
    this.cronEnabled = true;
  }

  disableCron(): void {
    this.cronEnabled = false;
  }

  // ==================== STATUS ====================

  getSyncStatus(): SyncStatus {
    return {
      counterparties: { ...this.progress.counterparties },
      contacts: { ...this.progress.contacts },
      products: { ...this.progress.products },
      cronEnabled: this.cronEnabled,
      lastCronRunAt: this.lastCronRunAt,
    };
  }

  getProgress(systemType: SystemType): SyncProgress {
    return { ...this.progress[systemType] };
  }

  /**
   * Предварительная оценка объёма данных
   */
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
    }

    const alreadySynced = await this.syncLogRepo.count({
      where: { systemType, status: 'completed' },
    });

    const ws = await this.workspaceRepo.findOne({
      where: { systemType },
    });

    return {
      totalLegacy,
      alreadySynced,
      remaining: Math.max(0, totalLegacy - alreadySynced),
      workspaceExists: !!ws,
      workspaceId: ws?.id ?? null,
    };
  }

  // ==================== PRIVATE METHODS ====================

  private async ensureSystemWorkspace(
    systemType: SystemType,
    name: string,
    icon: string,
    prefix: string,
    sections: any[],
  ): Promise<Workspace> {
    let ws = await this.workspaceRepo.findOne({ where: { systemType } });
    if (ws) return ws;

    ws = this.workspaceRepo.create({
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
    });

    ws = await this.workspaceRepo.save(ws);
    this.logger.log(`Создан системный workspace "${name}" (${prefix}), id=${ws.id}`);
    return ws;
  }

  private async syncCounterpartyBatch(
    batch: LegacyCounterparty[],
    workspaceId: string,
  ): Promise<{ created: number; updated: number; errors: number }> {
    let created = 0;
    let updated = 0;
    let errors = 0;

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
            legacyId: cp.id,
            legacyUrl: this.legacyUrlService.getCounterpartyUrl(cp.id),
          };

          if (existingLog) {
            // Обновляем существующую entity
            await queryRunner.query(
              `UPDATE "entities" SET "title" = $1, "status" = $2, "data" = $3, "updatedAt" = NOW() WHERE "id" = $4`,
              [title, status, JSON.stringify(data), existingLog.entityId],
            );
            updated++;
          } else {
            // Создаём новую entity
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
    let created = 0;
    let updated = 0;
    let errors = 0;

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

          // Строим relation-значение для контрагента
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
    let created = 0;
    let updated = 0;
    let errors = 0;

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
            price: product.price || 0,
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

  private async loadCategoryMap(): Promise<void> {
    const categories = await this.legacyService.getAllActiveCategories();
    this.categoryMap.clear();
    for (const cat of categories) {
      this.categoryMap.set(cat.id, cat.name);
    }
  }

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
