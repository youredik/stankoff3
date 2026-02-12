import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SystemSyncService, SystemType } from './system-sync.service';
import { LegacyService } from './legacy.service';
import { LegacyUrlService } from './legacy-url.service';
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
  let dataSource: jest.Mocked<Partial<DataSource>>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(async () => {
    workspaceRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    syncLogRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };

    legacyService = {
      isAvailable: jest.fn().mockReturnValue(true),
      getCounterpartiesCount: jest.fn().mockResolvedValue(0),
      getAllCounterpartiesBatch: jest.fn().mockResolvedValue([]),
      getContactsCount: jest.fn().mockResolvedValue(0),
      getAllContactsBatch: jest.fn().mockResolvedValue([]),
      getContactsWithCounterpartyBatch: jest.fn().mockResolvedValue([]),
      getActiveProductsCount: jest.fn().mockResolvedValue(0),
      getAllActiveProductsBatch: jest.fn().mockResolvedValue([]),
      getAllActiveCategories: jest.fn().mockResolvedValue([]),
    };

    legacyUrlService = {
      getCounterpartyUrl: jest.fn().mockReturnValue('https://test.com/cp/1'),
      getCustomerUrl: jest.fn().mockReturnValue('https://test.com/c/1'),
      getProductUrl: jest.fn().mockReturnValue('https://test.com/p/1'),
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSyncService,
        { provide: getRepositoryToken(Workspace), useValue: workspaceRepo },
        { provide: getRepositoryToken(SystemSyncLog), useValue: syncLogRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: LegacyService, useValue: legacyService },
        { provide: LegacyUrlService, useValue: legacyUrlService },
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

      // Проверяем наличие ключевых полей
      const allFields = createArg.sections.flatMap((s: any) => s.fields);
      const fieldIds = allFields.map((f: any) => f.id);
      expect(fieldIds).toContain('inn');
      expect(fieldIds).toContain('kpp');
      expect(fieldIds).toContain('ogrn');
      expect(fieldIds).toContain('orgType');
      expect(fieldIds).toContain('status');
      expect(fieldIds).toContain('legacyId');

      // Все поля должны быть system: true
      expect(allFields.every((f: any) => f.system === true)).toBe(true);
    });
  });

  describe('ensureContactsWorkspace', () => {
    it('должен создать workspace с relation на контрагентов', async () => {
      const cpWs = mockWorkspace({ id: 'cp-ws-id' });
      // Первый вызов findOne — для counterparties (ensureCounterpartiesWorkspace)
      // Второй — для contacts
      (workspaceRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(cpWs) // counterparties exists
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
    it('должен создать все три workspace', async () => {
      const cpWs = mockWorkspace({ id: 'cp', systemType: 'counterparties' });
      const ctWs = mockWorkspace({ id: 'ct', systemType: 'contacts', name: 'Контакты', prefix: 'CT' });
      const prWs = mockWorkspace({ id: 'pr', systemType: 'products', name: 'Товары', prefix: 'PR' });

      // Mock: counterparties, contacts, products — все существуют
      (workspaceRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(cpWs)   // counterparties (from ensureCounterparties)
        .mockResolvedValueOnce(cpWs)   // counterparties (from ensureContacts)
        .mockResolvedValueOnce(ctWs)   // contacts
        .mockResolvedValueOnce(prWs);  // products

      const result = await service.ensureAllWorkspaces();
      expect(result.counterparties.id).toBe('cp');
      expect(result.contacts.id).toBe('ct');
      expect(result.products.id).toBe('pr');
    });
  });

  // ==================== SYNC OPERATIONS ====================

  describe('syncCounterparties', () => {
    it('должен создать entity для каждого контрагента', async () => {
      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      (legacyService.getCounterpartiesCount as jest.Mock).mockResolvedValue(2);
      (legacyService.getAllCounterpartiesBatch as jest.Mock).mockResolvedValueOnce([
        { id: 1, name: 'ООО Тест', inn: '1234567890', status: null, type: null },
        { id: 2, name: 'ИП Иванов', inn: '772345678901', status: null, type: 'individual' },
      ]).mockResolvedValueOnce([]);
      (syncLogRepo.findOne as jest.Mock).mockResolvedValue(null); // Нет ранее синхронизированных

      const result = await service.syncCounterparties(500);

      expect(result.systemType).toBe('counterparties');
      expect(result.created).toBe(2);
      expect(result.errors).toBe(0);
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

      const result = await service.syncCounterparties(500);
      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });

    it('должен бросить ошибку при повторном запуске', async () => {
      const ws = mockWorkspace();
      (workspaceRepo.findOne as jest.Mock).mockResolvedValue(ws);
      (legacyService.getCounterpartiesCount as jest.Mock).mockResolvedValue(2);

      let resolveBatch: (v: any[]) => void;
      const batchPromise = new Promise<any[]>((resolve) => { resolveBatch = resolve; });
      (legacyService.getAllCounterpartiesBatch as jest.Mock).mockReturnValueOnce(batchPromise);
      (syncLogRepo.findOne as jest.Mock).mockResolvedValue(null);

      // Запускаем первую без await — она застрянет на getAllCounterpartiesBatch
      const promise1 = service.syncCounterparties(500);
      // Даём микротаскам обработаться, чтобы isRunning стал true
      await new Promise((r) => setTimeout(r, 50));

      // Пробуем запустить вторую
      await expect(service.syncCounterparties(500)).rejects.toThrow(
        'Синхронизация контрагентов уже запущена',
      );

      // Разрешаем первую — пустой batch чтобы завершить цикл
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
      expect(legacyService.getCounterpartiesCount).not.toHaveBeenCalled();
    });

    it('не должен запускать sync если legacy недоступен', async () => {
      (legacyService.isAvailable as jest.Mock).mockReturnValue(false);
      await service.scheduledSync();
      expect(legacyService.getCounterpartiesCount).not.toHaveBeenCalled();
    });
  });
});
