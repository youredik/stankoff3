import { Test, TestingModule } from '@nestjs/testing';
import { LegacyMigrationController } from './legacy-migration.controller';
import {
  LegacyMigrationService,
  MigrationProgress,
  MigrationPreview,
  ValidationResult,
} from './services/legacy-migration.service';
import { StartMigrationDto, MigrationLogQueryDto } from './dto';

describe('LegacyMigrationController', () => {
  let controller: LegacyMigrationController;
  let migrationService: jest.Mocked<LegacyMigrationService>;

  const mockProgress: MigrationProgress = {
    totalRequests: 1000,
    processedRequests: 250,
    totalComments: 800,
    skippedRequests: 10,
    failedRequests: 5,
    startedAt: new Date('2025-01-15T10:00:00Z'),
    completedAt: null,
    isRunning: true,
    currentBatch: 3,
    totalBatches: 10,
    error: null,
  };

  const mockPreview: MigrationPreview = {
    legacyRequestsCount: 5000,
    legacyAnswersCount: 12000,
    alreadyMigratedCount: 1000,
    remainingCount: 4000,
    employeeMappingCount: 15,
    unmappedEmployeeCount: 3,
    workspaceExists: true,
    workspaceId: 'ws-uuid-123',
  };

  const mockValidation: ValidationResult = {
    entitiesCreated: 950,
    legacyTotal: 1000,
    migrationLogCompleted: 950,
    migrationLogFailed: 50,
    coveragePercent: 95,
    sampleSize: 100,
    integrityErrors: 2,
  };

  beforeEach(async () => {
    const mockMigrationService: Partial<jest.Mocked<LegacyMigrationService>> = {
      getProgress: jest.fn().mockReturnValue(mockProgress),
      getPreview: jest.fn().mockResolvedValue(mockPreview),
      startMigration: jest.fn().mockResolvedValue({ message: 'Миграция запущена: 1000 заявок, батч 500' }),
      stopMigration: jest.fn().mockReturnValue({ message: 'Остановка миграции после текущего батча...' }),
      validateMigration: jest.fn().mockResolvedValue(mockValidation),
      getMigrationLog: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      retryFailed: jest.fn().mockResolvedValue({ message: 'Ретрай завершён', retried: 5 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegacyMigrationController],
      providers: [
        {
          provide: LegacyMigrationService,
          useValue: mockMigrationService,
        },
      ],
    }).compile();

    controller = module.get<LegacyMigrationController>(LegacyMigrationController);
    migrationService = module.get(LegacyMigrationService);
  });

  it('должен быть определён', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus (GET /status)', () => {
    it('должен вернуть текущий прогресс миграции', () => {
      const result = controller.getStatus();

      expect(migrationService.getProgress).toHaveBeenCalled();
      expect(result).toEqual(mockProgress);
      expect(result.isRunning).toBe(true);
      expect(result.processedRequests).toBe(250);
    });
  });

  describe('getPreview (GET /preview)', () => {
    it('должен вернуть preview данные для миграции', async () => {
      const result = await controller.getPreview();

      expect(migrationService.getPreview).toHaveBeenCalled();
      expect(result).toEqual(mockPreview);
      expect(result.legacyRequestsCount).toBe(5000);
      expect(result.remainingCount).toBe(4000);
      expect(result.workspaceExists).toBe(true);
    });

    it('должен пробросить ошибку если сервис выбросил исключение', async () => {
      migrationService.getPreview.mockRejectedValueOnce(
        new Error('Legacy БД недоступна'),
      );

      await expect(controller.getPreview()).rejects.toThrow('Legacy БД недоступна');
    });
  });

  describe('startMigration (POST /start)', () => {
    it('должен делегировать запуск миграции сервису с параметрами', async () => {
      const dto: StartMigrationDto = {
        batchSize: 200,
        maxRequests: 500,
        dryRun: false,
      };

      const result = await controller.startMigration(dto);

      expect(migrationService.startMigration).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        message: 'Миграция запущена: 1000 заявок, батч 500',
      });
    });

    it('должен работать без параметров (пустой DTO)', async () => {
      const dto: StartMigrationDto = {};

      await controller.startMigration(dto);

      expect(migrationService.startMigration).toHaveBeenCalledWith(dto);
    });

    it('должен пробросить ошибку если миграция уже запущена', async () => {
      migrationService.startMigration.mockRejectedValueOnce(
        new Error('Миграция уже запущена'),
      );

      await expect(
        controller.startMigration({ batchSize: 100 }),
      ).rejects.toThrow('Миграция уже запущена');
    });
  });

  describe('stopMigration (POST /stop)', () => {
    it('должен делегировать остановку миграции сервису', () => {
      const result = controller.stopMigration();

      expect(migrationService.stopMigration).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Остановка миграции после текущего батча...',
      });
    });

    it('должен вернуть сообщение если миграция не запущена', () => {
      migrationService.stopMigration.mockReturnValueOnce({
        message: 'Миграция не запущена',
      });

      const result = controller.stopMigration();

      expect(result.message).toBe('Миграция не запущена');
    });
  });

  describe('getProgress (GET /progress)', () => {
    it('должен вернуть прогресс миграции', () => {
      const result = controller.getProgress();

      expect(migrationService.getProgress).toHaveBeenCalled();
      expect(result).toEqual(mockProgress);
      expect(result.currentBatch).toBe(3);
      expect(result.totalBatches).toBe(10);
    });

    it('должен вернуть прогресс с завершённой миграцией', () => {
      const completedProgress: MigrationProgress = {
        ...mockProgress,
        isRunning: false,
        completedAt: new Date('2025-01-15T12:00:00Z'),
        processedRequests: 1000,
        currentBatch: 10,
      };
      migrationService.getProgress.mockReturnValueOnce(completedProgress);

      const result = controller.getProgress();

      expect(result.isRunning).toBe(false);
      expect(result.completedAt).toEqual(new Date('2025-01-15T12:00:00Z'));
    });
  });

  describe('validateMigration (POST /validate)', () => {
    it('должен делегировать валидацию миграции сервису', async () => {
      const result = await controller.validateMigration();

      expect(migrationService.validateMigration).toHaveBeenCalled();
      expect(result).toEqual(mockValidation);
      expect(result.coveragePercent).toBe(95);
      expect(result.integrityErrors).toBe(2);
    });
  });

  describe('getMigrationLog (GET /log)', () => {
    it('должен передавать query параметры в сервис', async () => {
      const query: MigrationLogQueryDto = {
        status: 'failed',
        limit: 20,
        offset: 10,
      };

      const mockLogItems = [
        {
          id: 'log-1',
          legacyRequestId: 101,
          entityId: 'ent-1',
          status: 'failed',
          errorMessage: 'Ошибка вставки',
        },
      ];
      migrationService.getMigrationLog.mockResolvedValueOnce({
        items: mockLogItems as any,
        total: 1,
      });

      const result = await controller.getMigrationLog(query);

      expect(migrationService.getMigrationLog).toHaveBeenCalledWith(query);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('должен работать без query параметров', async () => {
      const query: MigrationLogQueryDto = {};

      await controller.getMigrationLog(query);

      expect(migrationService.getMigrationLog).toHaveBeenCalledWith(query);
    });
  });

  describe('retryFailed (POST /retry-failed)', () => {
    it('должен делегировать повтор ошибочных записей сервису', async () => {
      const result = await controller.retryFailed();

      expect(migrationService.retryFailed).toHaveBeenCalled();
      expect(result).toEqual({
        message: 'Ретрай завершён',
        retried: 5,
      });
    });

    it('должен пробросить ошибку если Legacy БД недоступна', async () => {
      migrationService.retryFailed.mockRejectedValueOnce(
        new Error('Legacy БД недоступна'),
      );

      await expect(controller.retryFailed()).rejects.toThrow(
        'Legacy БД недоступна',
      );
    });

    it('должен вернуть retried: 0 если нет ошибочных записей', async () => {
      migrationService.retryFailed.mockResolvedValueOnce({
        message: 'Нет ошибочных записей',
        retried: 0,
      });

      const result = await controller.retryFailed();

      expect(result.retried).toBe(0);
      expect(result.message).toBe('Нет ошибочных записей');
    });
  });
});
