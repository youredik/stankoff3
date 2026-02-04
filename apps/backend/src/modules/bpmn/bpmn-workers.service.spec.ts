import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { BpmnWorkersService } from './bpmn-workers.service';
import { BpmnService } from './bpmn.service';
import { EntityService } from '../entity/entity.service';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EventsGateway } from '../websocket/events.gateway';
import { ProcessInstanceStatus } from './entities/process-instance.entity';

// Тип для обработчика задач Zeebe
type ZeebeJobHandler = (job: Record<string, unknown>) => Promise<void>;

describe('BpmnWorkersService', () => {
  let service: BpmnWorkersService;
  let bpmnService: any;
  let entityService: any;
  let emailService: any;
  let auditLogService: any;
  let eventsGateway: any;
  let mockZeebeClient: any;
  let registeredWorkers: Map<string, ZeebeJobHandler>;

  beforeEach(async () => {
    registeredWorkers = new Map();

    mockZeebeClient = {
      createWorker: jest.fn((config: { taskType: string; taskHandler: ZeebeJobHandler }) => {
        registeredWorkers.set(config.taskType, config.taskHandler);
      }),
    };

    const mockBpmnService = {
      updateInstanceStatus: jest.fn(),
    };

    const mockEntityService = {
      updateStatus: jest.fn(),
      updateAssignee: jest.fn(),
    };

    const mockEmailService = {
      send: jest.fn().mockResolvedValue(true),
    };

    const mockAuditLogService = {
      log: jest.fn(),
    };

    const mockEventsGateway = {
      emitEntityUpdated: jest.fn(),
    };

    const mockModuleRef = {
      get: jest.fn((type) => {
        if (type === EntityService) return mockEntityService;
        if (type === EmailService) return mockEmailService;
        if (type === AuditLogService) return mockAuditLogService;
        if (type === EventsGateway) return mockEventsGateway;
        throw new Error(`Unknown type`);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BpmnWorkersService,
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: BpmnService, useValue: mockBpmnService },
      ],
    }).compile();

    service = module.get<BpmnWorkersService>(BpmnWorkersService);
    bpmnService = module.get(BpmnService);

    // Initialize the service (loads lazy dependencies)
    await service.onModuleInit();

    // Get references to mocked services
    entityService = mockModuleRef.get(EntityService);
    emailService = mockModuleRef.get(EmailService);
    auditLogService = mockModuleRef.get(AuditLogService);
    eventsGateway = mockModuleRef.get(EventsGateway);

    // Set Zeebe client to register workers
    service.setZeebeClient(mockZeebeClient);
  });

  describe('setZeebeClient', () => {
    it('должен зарегистрировать все воркеры', () => {
      expect(registeredWorkers.size).toBe(6);
      expect(registeredWorkers.has('update-entity-status')).toBe(true);
      expect(registeredWorkers.has('send-notification')).toBe(true);
      expect(registeredWorkers.has('send-email')).toBe(true);
      expect(registeredWorkers.has('log-activity')).toBe(true);
      expect(registeredWorkers.has('set-assignee')).toBe(true);
      expect(registeredWorkers.has('process-completed')).toBe(true);
    });
  });

  describe('update-entity-status worker', () => {
    it('должен обновить статус entity', async () => {
      const handler = registeredWorkers.get('update-entity-status')!;
      const mockJob = {
        variables: { entityId: 'entity-1', newStatus: 'in_progress' },
        complete: jest.fn().mockReturnValue({ statusUpdated: true }),
        fail: jest.fn(),
      };

      await handler(mockJob);

      expect(entityService.updateStatus).toHaveBeenCalledWith('entity-1', 'in_progress');
      expect(mockJob.complete).toHaveBeenCalledWith(
        expect.objectContaining({ statusUpdated: true }),
      );
    });

    it('должен обработать ошибку', async () => {
      entityService.updateStatus.mockRejectedValue(new Error('Update failed'));

      const handler = registeredWorkers.get('update-entity-status')!;
      const mockJob = {
        variables: { entityId: 'entity-1', newStatus: 'error' },
        complete: jest.fn(),
        fail: jest.fn().mockReturnValue({}),
        retries: 3,
      };

      await handler(mockJob);

      expect(mockJob.fail).toHaveBeenCalledWith({
        errorMessage: 'Update failed',
        retries: 2,
      });
    });
  });

  describe('send-notification worker', () => {
    it('должен отправить уведомление', async () => {
      const handler = registeredWorkers.get('send-notification')!;
      const mockJob = {
        variables: {
          userId: 'user-1',
          message: 'Test notification',
          entityId: 'entity-1',
          workspaceId: 'ws-1',
        },
        complete: jest.fn().mockReturnValue({ notificationSent: true }),
      };

      await handler(mockJob);

      expect(eventsGateway.emitEntityUpdated).toHaveBeenCalled();
      expect(mockJob.complete).toHaveBeenCalledWith({ notificationSent: true });
    });

    it('должен обработать ошибку без падения', async () => {
      eventsGateway.emitEntityUpdated.mockImplementation(() => {
        throw new Error('Gateway error');
      });

      const handler = registeredWorkers.get('send-notification')!;
      const mockJob = {
        variables: { userId: 'user-1', message: 'Test' },
        complete: jest.fn().mockReturnValue({}),
      };

      await handler(mockJob);

      expect(mockJob.complete).toHaveBeenCalledWith({
        notificationSent: false,
        error: 'Gateway error',
      });
    });
  });

  describe('send-email worker', () => {
    it('должен отправить email', async () => {
      const handler = registeredWorkers.get('send-email')!;
      const mockJob = {
        variables: {
          to: 'test@example.com',
          subject: 'Test Subject',
          body: 'Test body',
        },
        complete: jest.fn().mockReturnValue({ emailSent: true }),
      };

      await handler(mockJob);

      expect(emailService.send).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test body',
        html: 'Test body',
      });
      expect(mockJob.complete).toHaveBeenCalledWith({ emailSent: true });
    });

    it('должен обработать ошибку отправки', async () => {
      emailService.send.mockRejectedValue(new Error('SMTP error'));

      const handler = registeredWorkers.get('send-email')!;
      const mockJob = {
        variables: { to: 'test@example.com', subject: 'Test', body: 'Body' },
        complete: jest.fn().mockReturnValue({}),
      };

      await handler(mockJob);

      expect(mockJob.complete).toHaveBeenCalledWith({
        emailSent: false,
        error: 'SMTP error',
      });
    });
  });

  describe('log-activity worker', () => {
    it('должен записать в audit log', async () => {
      const handler = registeredWorkers.get('log-activity')!;
      const mockJob = {
        variables: {
          entityId: 'entity-1',
          workspaceId: 'ws-1',
          action: 'entity_updated',
          details: { description: 'Test log' },
          actorId: 'user-1',
        },
        complete: jest.fn().mockReturnValue({ logged: true }),
      };

      await handler(mockJob);

      expect(auditLogService.log).toHaveBeenCalled();
      expect(mockJob.complete).toHaveBeenCalledWith({ logged: true });
    });

    it('должен обработать ошибку', async () => {
      auditLogService.log.mockRejectedValue(new Error('DB error'));

      const handler = registeredWorkers.get('log-activity')!;
      const mockJob = {
        variables: {
          entityId: 'entity-1',
          workspaceId: 'ws-1',
          action: 'test',
        },
        complete: jest.fn().mockReturnValue({}),
      };

      await handler(mockJob);

      expect(mockJob.complete).toHaveBeenCalledWith({
        logged: false,
        error: 'DB error',
      });
    });
  });

  describe('set-assignee worker', () => {
    it('должен назначить исполнителя', async () => {
      const handler = registeredWorkers.get('set-assignee')!;
      const mockJob = {
        variables: { entityId: 'entity-1', assigneeId: 'user-2' },
        complete: jest.fn().mockReturnValue({ assigneeSet: true }),
        fail: jest.fn(),
      };

      await handler(mockJob);

      expect(entityService.updateAssignee).toHaveBeenCalledWith('entity-1', 'user-2');
      expect(mockJob.complete).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeSet: true }),
      );
    });

    it('должен снять исполнителя (null)', async () => {
      const handler = registeredWorkers.get('set-assignee')!;
      const mockJob = {
        variables: { entityId: 'entity-1', assigneeId: null },
        complete: jest.fn().mockReturnValue({ assigneeSet: true }),
        fail: jest.fn(),
      };

      await handler(mockJob);

      expect(entityService.updateAssignee).toHaveBeenCalledWith('entity-1', null);
    });

    it('должен обработать ошибку', async () => {
      entityService.updateAssignee.mockRejectedValue(new Error('Assignee error'));

      const handler = registeredWorkers.get('set-assignee')!;
      const mockJob = {
        variables: { entityId: 'entity-1', assigneeId: 'user-2' },
        complete: jest.fn(),
        fail: jest.fn().mockReturnValue({}),
        retries: 3,
      };

      await handler(mockJob);

      expect(mockJob.fail).toHaveBeenCalledWith({
        errorMessage: 'Assignee error',
        retries: 2,
      });
    });
  });

  describe('process-completed worker', () => {
    it('должен обновить статус процесса на COMPLETED', async () => {
      const handler = registeredWorkers.get('process-completed')!;
      const mockJob = {
        processInstanceKey: 123456789,
        complete: jest.fn().mockReturnValue({ completed: true }),
      };

      await handler(mockJob);

      expect(bpmnService.updateInstanceStatus).toHaveBeenCalledWith(
        '123456789',
        ProcessInstanceStatus.COMPLETED,
      );
      expect(mockJob.complete).toHaveBeenCalledWith({ completed: true });
    });

    it('должен обработать ошибку', async () => {
      bpmnService.updateInstanceStatus.mockRejectedValue(new Error('DB error'));

      const handler = registeredWorkers.get('process-completed')!;
      const mockJob = {
        processInstanceKey: 123456789,
        complete: jest.fn().mockReturnValue({}),
      };

      await handler(mockJob);

      expect(mockJob.complete).toHaveBeenCalledWith({
        completed: false,
        error: 'DB error',
      });
    });
  });

  describe('onModuleInit - service loading errors', () => {
    it('должен обработать отсутствие сервисов', async () => {
      const mockModuleRefWithErrors = {
        get: jest.fn(() => {
          throw new Error('Service not found');
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BpmnWorkersService,
          { provide: ModuleRef, useValue: mockModuleRefWithErrors },
          { provide: BpmnService, useValue: { updateInstanceStatus: jest.fn() } },
        ],
      }).compile();

      const serviceWithErrors = module.get<BpmnWorkersService>(BpmnWorkersService);

      // Should not throw
      await serviceWithErrors.onModuleInit();
    });
  });

  describe('registerWorkers without Zeebe client', () => {
    it('не должен регистрировать воркеры без клиента', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BpmnWorkersService,
          {
            provide: ModuleRef,
            useValue: {
              get: jest.fn(() => {
                throw new Error('Not found');
              }),
            },
          },
          { provide: BpmnService, useValue: { updateInstanceStatus: jest.fn() } },
        ],
      }).compile();

      const newService = module.get<BpmnWorkersService>(BpmnWorkersService);
      await newService.onModuleInit();

      // Вызываем setZeebeClient с null
      newService.setZeebeClient(null as any);

      // Не должно быть ошибок
    });
  });
});
