import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemSyncService, SystemType } from './system-sync.service';
import { LegacyService } from './legacy.service';
import { LegacyUrlService } from './legacy-url.service';
import { ProductCategoryService } from '../../entity/product-category.service';
import { Workspace } from '../../workspace/workspace.entity';
import { SystemSyncLog } from '../entities/system-sync-log.entity';

// Мок-данные
const mockWorkspace = (overrides?: Partial<Workspace>): Workspace => ({
  id: 'ws-001',
  name: 'Контрагенты',
  icon: '🏢',
  prefix: 'CO',
  isSystem: true,
  systemType: 'counterparties',
  lastEntityNumber: 0,
  isArchived: false,
  isInternal: false,
  showInMenu: true,
  orderInSection: 0,
  sections: [],
  ...overrides,
} as Workspace);

describe('SystemSyncService', () => {
  let service: SystemSyncService;
  let workspaceRepo: jest.Mocked<Partial<Repository<Workspace>>>;
  let syncLogRepo: jest.Mocked<Partial<Repository<SystemSyncLog>>>;
  let legacyService: jest.Mocked<Partial<LegacyService>>;
  let legacyUrlService: jest.Mocked<Partial<LegacyUrlService>>;
  let productCategoryService: jest.Mocked<Partial<ProductCategoryService>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let configService: jest.Mocked<Partial<ConfigService>>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: jest.fn(),
  };

  // Mock для syncLogRepo.createQueryBuilder (getLastSyncedLegacyId / getLastSyncTime)
  const mockQb = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ maxId: 0 }),
  };

  beforeEach(async () => {
    // Reset mocks
    mockQb.getRawOne.mockResolvedValue({ maxId: 0 });

    workspaceRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn().mockImplementation(async (data) => data),
      update: jest.fn(),
    };

    syncLogRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    legacyService = {
      isAvailable: jest.fn().mockReturnValue(true),
      // Full sync
      getCounterpartiesCount: jest.fn().mockResolvedValue(0),
      getAllCounterpartiesBatch: jest.fn().mockResolvedValue([]),
      getContactsCount: jest.fn().mockResolvedValue(0),
      getAllContactsBatch: jest.fn().mockResolvedValue([]),
      getContactsWithCounterpartyBatch: jest.fn().mockResolvedValue([]),
      getActiveProductsCount: jest.fn().mockResolvedValue(0),
      getAllActiveProductsBatch: jest.fn().mockResolvedValue([]),
      getAllActiveCategories: jest.fn().mockResolvedValue([]),
      getDealsCount: jest.fn().mockResolvedValue(0),
      getAllDealsBatch: jest.fn().mockResolvedValue([]),
      getAllDealStages: jest.fn().mockResolvedValue([]),
      // Incremental sync
      getCounterpartiesSinceId: jest.fn().mockResolvedValue([]),
      getCounterpartiesCountSinceId: jest.fn().mockResolvedValue(0),
      getContactsSinceId: jest.fn().mockResolvedValue([]),
      getContactsCountSinceId: jest.fn().mockResolvedValue(0),
      getProductsSinceId: jest.fn().mockResolvedValue([]),
      getProductsCountSinceId: jest.fn().mockResolvedValue(0),
      getDealsSinceDate: jest.fn().mockResolvedValue([]),
      getDealsCountSinceDate: jest.fn().mockResolvedValue(0),
    };

    legacyUrlService = {
      getCounterpartyUrl: jest.fn().mockReturnValue('https://test.com/cp/1'),
      getCustomerUrl: jest.fn().mockReturnValue('https://test.com/c/1'),
      getProductUrl: jest.fn().mockReturnValue('https://test.com/p/1'),
      getDealUrl: jest.fn().mockReturnValue('https://test.com/d/1'),
    };

    productCategoryService = {
      upsertFromLegacy: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Test' }),
      recalculateCounts: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    configService = {
      get: jest.fn().mockReturnValue(null), // No Telegram config in tests
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSyncService,
        { provide: getRepositoryToken(Workspace), useValue: workspaceRepo },
        { provide: getRepositoryToken(SystemSyncLog), useValue: syncLogRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: LegacyService, useValue: legacyService },
        { provide: LegacyUrlService, useValue: legacyUrlService },
        { provide: ProductCategoryService, useValue: productCategoryService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<SystemSyncService>(SystemSyncService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== WORKSPACE MANAGEMENT ====================

  describe('ensureCounterpartiesWorkspace', () => {
    it('должен вернуть существующий workspace если уже создан', async () => {
      const existing = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(existing);

      const result = await service.ensureCounterpartiesWorkspace();
      expect(result).toBe(existing);
      expect(workspaceRepo.create).not.toHaveBeenCalled();
    });

    it('должен создать workspace если не существует', async () => {
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(null);
      const created = mockWorkspace();
      (workspaceRepo.create as jest.Mock).mockReturnValue(created);
      (workspaceRepo.save as jest.Mock).mockResolvedValue(created);

      const result = await service.ensureCounterpartiesWorkspace();
      expect(result).toBe(created);
      expect(workspaceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          systemType: 'counterparties',
          isSystem: true,
          prefix: 'CO',
          name: 'Контрагенты',
        }),
      );
    });

    it('workspace должен иметь секции с системными полями', async () => {
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(null);
      (workspaceRepo.create as jest.Mock).mockImplementation((data) => data);
      (workspaceRepo.save as jest.Mock).mockImplementation(async (data) => ({ id: 'new-ws', ...data }));

      await service.ensureCounterpartiesWorkspace();
      const createArg = (workspaceRepo.create as jest.Mock).mock.calls[0][0];

      const allFields = createArg.sections.flatMap((s: any) => s.fields);
      const fieldIds = allFields.map((f: any) => f.id);
      expect(fieldIds).toContain('inn');
      expect(fieldIds).toContain('kpp');
      expect(fieldIds).toContain('ogrn');
      expect(fieldIds).toContain('orgType');
      expect(fieldIds).toContain('status');
      expect(fieldIds).toContain('legacyId');
      expect(fieldIds).toContain('bankName');
      expect(fieldIds).toContain('bankBik');

      expect(allFields.every((f: any) => f.system === true)).toBe(true);
    });
  });

  describe('ensureContactsWorkspace', () => {
    it('должен создать workspace с relation на контрагентов', async () => {
      const cpWs = mockWorkspace({ id: 'cp-ws-id' });
      (workspaceRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(cpWs)  // counterparties exists
        .mockResolvedValueOnce(null); // contacts doesn't exist
      (workspaceRepo.create as jest.Mock).mockImplementation((data) => data);
      (workspaceRepo.save as jest.Mock).mockImplementation(async (data) => ({ id: 'ct-ws', ...data }));

      await service.ensureContactsWorkspace();
      const createArg = (workspaceRepo.create as jest.Mock).mock.calls[0][0];
      const mainSection = createArg.sections.find((s: any) => s.id === 'main');
      const cpField = mainSection?.fields.find((f: any) => f.id === 'counterparty');

      expect(cpField).toBeDefined();
      expect(cpField.type).toBe('relation');
      expect(cpField.relatedWorkspaceId).toBe('cp-ws-id');
    });
  });

  describe('ensureAllWorkspaces', () => {
    it('должен создать все четыре workspace', async () => {
      const cpWs = mockWorkspace({ id: 'cp', systemType: 'counterparties' });
      const ctWs = mockWorkspace({ id: 'ct', systemType: 'contacts', name: 'Контакты', prefix: 'CT' });
      const prWs = mockWorkspace({ id: 'pr', systemType: 'products', name: 'Товары', prefix: 'PR' });
      const dlWs = mockWorkspace({ id: 'dl', systemType: 'deals' as any, name: 'Сделки', prefix: 'DL' });

      (workspaceRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(cpWs)   // counterparties
        .mockResolvedValueOnce(cpWs)   // counterparties (from ensureContacts)
        .mockResolvedValueOnce(ctWs)   // contacts
        .mockResolvedValueOnce(prWs)   // products
        .mockResolvedValueOnce(cpWs)   // counterparties (from ensureDeals)
        .mockResolvedValueOnce(dlWs);  // deals

      const result = await service.ensureAllWorkspaces();
      expect(result.counterparties.id).toBe('cp');
      expect(result.contacts.id).toBe('ct');
      expect(result.products.id).toBe('pr');
      expect(result.deals.id).toBe('dl');
    });
  });

  // ==================== SYNC: FULL MODE ====================

  describe('syncCounterparties (full sync)', () => {
    it('должен создать entity для каждого контрагента', async () => {
      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      (legacyService.getCounterpartiesCount as jest.Mock).mockResolvedValue(2);
      (legacyService.getAllCounterpartiesBatch as jest.Mock).mockResolvedValueOnce([
        { id: 1, name: 'ООО Тест', inn: '1234567890', status: null, type: null },
        { id: 2, name: 'ИП Иванов', inn: '772345678901', status: null, type: 'individual' },
      ]).mockResolvedValueOnce([]);
      (syncLogRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.syncCounterparties(500, true);

      expect(result.systemType).toBe('counterparties');
      expect(result.created).toBe(2);
      expect(result.errors).toBe(0);
      expect(result.incremental).toBe(false);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('должен обновлять существующие entity', async () => {
      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      (legacyService.getCounterpartiesCount as jest.Mock).mockResolvedValue(1);
      (legacyService.getAllCounterpartiesBatch as jest.Mock).mockResolvedValueOnce([
        { id: 1, name: 'ООО Тест', inn: '1234567890' },
      ]).mockResolvedValueOnce([]);
      (syncLogRepo.findOne as jest.Mock).mockResolvedValue({
        legacyId: 1,
        entityId: 'entity-001',
        systemType: 'counterparties',
      });

      const result = await service.syncCounterparties(500, true);
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });
  });

  // ==================== SYNC: INCREMENTAL MODE ====================

  describe('syncCounterparties (incremental)', () => {
    it('должен обработать только новые записи (sinceId)', async () => {
      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      // getLastSyncedLegacyId → maxId=5
      mockQb.getRawOne.mockResolvedValueOnce({ maxId: 5 });
      (legacyService.getCounterpartiesCountSinceId as jest.Mock).mockResolvedValue(2);
      (legacyService.getCounterpartiesSinceId as jest.Mock)
        .mockResolvedValueOnce([
          { id: 6, name: 'Новый 1', inn: '111', status: null, type: null },
          { id: 7, name: 'Новый 2', inn: '222', status: null, type: null },
        ])
        .mockResolvedValueOnce([]);
      (syncLogRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.syncCounterparties(500);

      expect(result.systemType).toBe('counterparties');
      expect(result.incremental).toBe(true);
      expect(result.created).toBe(2);
      expect(legacyService.getCounterpartiesSinceId).toHaveBeenCalledWith(5, 500);
    });

    it('должен пропустить когда нет новых записей', async () => {
      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      mockQb.getRawOne.mockResolvedValueOnce({ maxId: 100 });
      (legacyService.getCounterpartiesCountSinceId as jest.Mock).mockResolvedValue(0);

      const result = await service.syncCounterparties(500);

      expect(result.totalProcessed).toBe(0);
      expect(result.created).toBe(0);
      expect(result.incremental).toBe(true);
    });
  });

  // ==================== CONCURRENCY ====================

  describe('concurrent sync protection', () => {
    it('должен бросить ошибку при повторном запуске', async () => {
      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      (legacyService.getCounterpartiesCount as jest.Mock).mockResolvedValue(2);

      let resolveBatch: (v: any[]) => void;
      const batchPromise = new Promise<any[]>((resolve) => { resolveBatch = resolve; });
      (legacyService.getAllCounterpartiesBatch as jest.Mock).mockReturnValueOnce(batchPromise);
      (syncLogRepo.findOne as jest.Mock).mockResolvedValue(null);

      // Запускаем первую (fullSync — initProgress вызывается сразу после getCount)
      const promise1 = service.syncCounterparties(500, true);
      await new Promise((r) => setTimeout(r, 50));

      await expect(service.syncCounterparties(500, true)).rejects.toThrow(
        'Синхронизация counterparties уже запущена',
      );

      resolveBatch!([]);
      await promise1;
    });
  });

  // ==================== STATUS ====================

  describe('getSyncStatus', () => {
    it('должен вернуть начальное состояние', () => {
      const status = service.getSyncStatus();
      expect(status.cronEnabled).toBe(true);
      expect(status.lastCronRunAt).toBeNull();
      expect(status.counterparties.isRunning).toBe(false);
      expect(status.contacts.isRunning).toBe(false);
      expect(status.products.isRunning).toBe(false);
      expect(status.deals.isRunning).toBe(false);
    });
  });

  describe('getProgress', () => {
    it('должен вернуть прогресс для конкретного типа', () => {
      const progress = service.getProgress('counterparties');
      expect(progress.systemType).toBe('counterparties');
      expect(progress.processedItems).toBe(0);
    });
  });

  describe('getPreview', () => {
    it('должен вернуть preview для контрагентов', async () => {
      (legacyService.getCounterpartiesCount as jest.Mock).mockResolvedValue(29000);
      (syncLogRepo.count as jest.Mock).mockResolvedValue(1000);
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(mockWorkspace());

      const preview = await service.getPreview('counterparties');
      expect(preview.totalLegacy).toBe(29000);
      expect(preview.alreadySynced).toBe(1000);
      expect(preview.remaining).toBe(28000);
      expect(preview.workspaceExists).toBe(true);
    });

    it('должен вернуть preview когда workspace не существует', async () => {
      (legacyService.getActiveProductsCount as jest.Mock).mockResolvedValue(28000);
      (syncLogRepo.count as jest.Mock).mockResolvedValue(0);
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(null);

      const preview = await service.getPreview('products');
      expect(preview.workspaceExists).toBe(false);
      expect(preview.workspaceId).toBeNull();
    });

    it('должен вернуть preview для сделок', async () => {
      (legacyService.getDealsCount as jest.Mock).mockResolvedValue(5000);
      (syncLogRepo.count as jest.Mock).mockResolvedValue(200);
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(
        mockWorkspace({ id: 'dl-ws', systemType: 'deals' as any }),
      );

      const preview = await service.getPreview('deals');
      expect(preview.totalLegacy).toBe(5000);
      expect(preview.alreadySynced).toBe(200);
      expect(preview.remaining).toBe(4800);
    });
  });

  // ==================== CRON ====================

  describe('enableCron / disableCron', () => {
    it('должен включать и выключать cron', () => {
      service.disableCron();
      expect(service.getSyncStatus().cronEnabled).toBe(false);

      service.enableCron();
      expect(service.getSyncStatus().cronEnabled).toBe(true);
    });
  });

  describe('scheduledSync', () => {
    it('не должен запускать sync если cron отключён', async () => {
      service.disableCron();
      await service.scheduledSync();
      expect(legacyService.getCounterpartiesCountSinceId).not.toHaveBeenCalled();
    });

    it('не должен запускать sync если legacy недоступен', async () => {
      (legacyService.isAvailable as jest.Mock).mockReturnValue(false);
      await service.scheduledSync();
      expect(legacyService.getCounterpartiesCountSinceId).not.toHaveBeenCalled();
    });
  });

  describe('scheduledFullSync', () => {
    it('не должен запускать sync если cron отключён', async () => {
      service.disableCron();
      await service.scheduledFullSync();
      expect(legacyService.getCounterpartiesCount).not.toHaveBeenCalled();
    });

    it('не должен запускать sync если legacy недоступен', async () => {
      (legacyService.isAvailable as jest.Mock).mockReturnValue(false);
      await service.scheduledFullSync();
      expect(legacyService.getCounterpartiesCount).not.toHaveBeenCalled();
    });
  });

  // ==================== CIRCUIT BREAKER ====================

  describe('circuit breaker', () => {
    it('должен прервать sync при высоком проценте ошибок', async () => {
      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      (legacyService.getCounterpartiesCount as jest.Mock).mockResolvedValue(30);

      const errorBatch = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1, name: `CP ${i}`, inn: '000', status: null, type: null,
      }));
      (legacyService.getAllCounterpartiesBatch as jest.Mock)
        .mockResolvedValueOnce(errorBatch)
        .mockResolvedValueOnce([]);

      // Каждый findOne бросает ошибку → все 30 записей ошибочны
      (syncLogRepo.findOne as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

      await expect(service.syncCounterparties(500, true)).rejects.toThrow(/Circuit breaker/);
    });
  });

  // ==================== TELEGRAM ALERTS ====================

  describe('telegram alerts', () => {
    it('не должен отправлять алерт если токен не настроен', async () => {
      // configService.get returns null → no telegram
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({} as any);

      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      mockQb.getRawOne.mockResolvedValue({ maxId: 0 });
      (legacyService.getCounterpartiesCountSinceId as jest.Mock).mockResolvedValue(0);

      await service.syncCounterparties(500);

      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
