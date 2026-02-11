import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { AiNotificationService } from './ai-notification.service';
import { AiNotification } from '../entities/ai-notification.entity';
import { WorkspaceEntity } from '../../entity/entity.entity';
import { KnowledgeBaseService } from './knowledge-base.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';

describe('AiNotificationService', () => {
  let service: AiNotificationService;
  let notificationRepo: jest.Mocked<Repository<AiNotification>>;
  let entityRepo: jest.Mocked<Repository<WorkspaceEntity>>;
  let providerRegistry: jest.Mocked<AiProviderRegistry>;

  const mockNotification = {
    id: 'notif-1',
    type: 'cluster_detected',
    title: '3 похожих заявок за последние 10 минут',
    message: 'Обнаружен кластер заявок',
    workspaceId: 'ws-1',
    entityId: 'entity-1',
    metadata: { keyword: 'подшипник серводвигатель', count: 3 },
    confidence: 0.9,
    targetUserId: null,
    read: false,
    dismissed: false,
    createdAt: new Date(),
  } as unknown as AiNotification;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiNotificationService,
        {
          provide: getRepositoryToken(AiNotification),
          useValue: {
            create: jest.fn().mockReturnValue(mockNotification),
            save: jest.fn().mockResolvedValue(mockNotification),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            find: jest.fn().mockResolvedValue([mockNotification]),
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[mockNotification], 1]),
              getCount: jest.fn().mockResolvedValue(1),
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 1 }),
            }),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: KnowledgeBaseService,
          useValue: {
            isAvailable: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: AiProviderRegistry,
          useValue: {
            isCompletionAvailable: jest.fn().mockReturnValue(false),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<AiNotificationService>(AiNotificationService);
    notificationRepo = module.get(getRepositoryToken(AiNotification));
    entityRepo = module.get(getRepositoryToken(WorkspaceEntity));
    providerRegistry = module.get(AiProviderRegistry) as jest.Mocked<AiProviderRegistry>;
  });

  describe('enable/disable', () => {
    it('должен быть отключён по умолчанию', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('должен включаться и выключаться', () => {
      service.setEnabled(true);
      expect(service.isEnabled()).toBe(true);

      service.setEnabled(false);
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('getNotifications', () => {
    it('должен возвращать уведомления с пагинацией', async () => {
      const result = await service.getNotifications({ limit: 10, offset: 0 });

      expect(result.notifications).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.notifications[0].type).toBe('cluster_detected');
    });

    it('должен фильтровать по workspaceId', async () => {
      await service.getNotifications({ workspaceId: 'ws-1' });

      const qb = notificationRepo.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('должен отметить уведомление прочитанным', async () => {
      await service.markRead('notif-1');

      expect(notificationRepo.update).toHaveBeenCalledWith('notif-1', { read: true });
    });
  });

  describe('markAllRead', () => {
    it('должен отметить все уведомления прочитанными', async () => {
      await service.markAllRead('ws-1', 'user-1');

      const qb = notificationRepo.createQueryBuilder();
      expect(qb.execute).toHaveBeenCalled();
    });
  });

  describe('dismiss', () => {
    it('должен скрыть уведомление', async () => {
      await service.dismiss('notif-1');

      expect(notificationRepo.update).toHaveBeenCalledWith('notif-1', { dismissed: true });
    });
  });

  describe('getUnreadCount', () => {
    it('должен вернуть количество непрочитанных', async () => {
      const count = await service.getUnreadCount();

      expect(count).toBe(1);
    });
  });

  describe('analyzeNewEntities', () => {
    it('не должен анализировать если отключён', async () => {
      await service.analyzeNewEntities();

      expect(entityRepo.find).not.toHaveBeenCalled();
    });

    it('не должен анализировать если AI недоступен', async () => {
      service.setEnabled(true);
      providerRegistry.isCompletionAvailable.mockReturnValue(false);

      await service.analyzeNewEntities();

      expect(entityRepo.find).not.toHaveBeenCalled();
    });

    it('должен анализировать если включён и AI доступен', async () => {
      service.setEnabled(true);
      providerRegistry.isCompletionAvailable.mockReturnValue(true);
      entityRepo.find.mockResolvedValue([]);

      await service.analyzeNewEntities();

      expect(entityRepo.find).toHaveBeenCalled();
    });

    it('должен обнаруживать кластеры похожих заявок', async () => {
      service.setEnabled(true);
      providerRegistry.isCompletionAvailable.mockReturnValue(true);

      const mockEntities = [
        { id: 'e1', title: 'подшипник серводвигатель замена', workspaceId: 'ws-1', createdAt: new Date() },
        { id: 'e2', title: 'подшипник серводвигатель замена запчасти', workspaceId: 'ws-1', createdAt: new Date() },
        { id: 'e3', title: 'подшипник серводвигатель замена ремонт', workspaceId: 'ws-1', createdAt: new Date() },
      ] as unknown as WorkspaceEntity[];

      entityRepo.find.mockResolvedValue(mockEntities);

      await service.analyzeNewEntities();

      expect(notificationRepo.save).toHaveBeenCalled();
    });

    it('должен обнаруживать критические заявки', async () => {
      service.setEnabled(true);
      providerRegistry.isCompletionAvailable.mockReturnValue(true);

      const mockEntities = [
        { id: 'e1', title: 'Авария на линии — срочно!', workspaceId: 'ws-1', data: {}, createdAt: new Date() },
      ] as unknown as WorkspaceEntity[];

      // First call for clusters (returns few), second for critical detection
      entityRepo.find
        .mockResolvedValueOnce(mockEntities) // detectClusters
        .mockResolvedValueOnce(mockEntities); // detectCriticalEntities

      await service.analyzeNewEntities();

      expect(notificationRepo.save).toHaveBeenCalled();
    });
  });
});
