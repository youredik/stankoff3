import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { AutomationService, AutomationContext } from './automation.service';
import {
  AutomationRule,
  TriggerType,
  ActionType,
  ConditionOperator,
} from './automation-rule.entity';
import { WorkspaceEntity } from '../entity/entity.entity';
import { User } from '../user/user.entity';
import { EventsGateway } from '../websocket/events.gateway';
import { EmailService } from '../email/email.service';
import { DmnService } from '../dmn/dmn.service';

describe('AutomationService', () => {
  let service: AutomationService;
  let ruleRepo: jest.Mocked<Repository<AutomationRule>>;
  let entityRepo: jest.Mocked<Repository<WorkspaceEntity>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let eventsGateway: jest.Mocked<EventsGateway>;
  let emailService: jest.Mocked<EmailService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
  } as unknown as User;

  const mockEntity = {
    id: 'entity-1',
    customId: 'TST-1',
    workspaceId: 'ws-1',
    title: 'Test Entity',
    status: 'new',
    priority: 'medium',
    assigneeId: 'user-1',
    assignee: mockUser,
    data: { field1: 'value1' },
  } as unknown as WorkspaceEntity;

  const mockRule = {
    id: 'rule-1',
    workspaceId: 'ws-1',
    name: 'Test Rule',
    description: 'Test description',
    trigger: TriggerType.ON_CREATE,
    triggerConfig: {},
    conditions: [],
    actions: [{ type: ActionType.SET_STATUS, config: { status: 'in_progress' } }],
    isActive: true,
    priority: 1,
    executionCount: 0,
    createdById: 'user-1',
    createdAt: new Date(),
  } as unknown as AutomationRule;

  beforeEach(async () => {
    const mockRuleRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const mockEntityRepo = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const mockUserRepo = {
      findOne: jest.fn(),
    };

    const mockEventsGateway = {
      emitStatusChanged: jest.fn(),
      emitEntityUpdated: jest.fn(),
      emitToUser: jest.fn(),
    };

    const mockEmailService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const mockDmnService = {
      evaluateQuick: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationService,
        { provide: getRepositoryToken(AutomationRule), useValue: mockRuleRepo },
        { provide: getRepositoryToken(WorkspaceEntity), useValue: mockEntityRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: EventsGateway, useValue: mockEventsGateway },
        { provide: EmailService, useValue: mockEmailService },
        { provide: DmnService, useValue: mockDmnService },
      ],
    }).compile();

    service = module.get<AutomationService>(AutomationService);
    ruleRepo = module.get(getRepositoryToken(AutomationRule));
    entityRepo = module.get(getRepositoryToken(WorkspaceEntity));
    userRepo = module.get(getRepositoryToken(User));
    eventsGateway = module.get(EventsGateway);
    emailService = module.get(EmailService);
  });

  describe('findAll', () => {
    it('должен вернуть все правила для workspace', async () => {
      ruleRepo.find.mockResolvedValue([mockRule]);

      const result = await service.findAll('ws-1');

      expect(result).toEqual([mockRule]);
      expect(ruleRepo.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        order: { priority: 'ASC', createdAt: 'DESC' },
        relations: ['createdBy'],
      });
    });
  });

  describe('findOne', () => {
    it('должен вернуть правило по ID', async () => {
      ruleRepo.findOne.mockResolvedValue(mockRule);

      const result = await service.findOne('rule-1');

      expect(result).toEqual(mockRule);
    });

    it('должен выбросить NotFoundException', async () => {
      ruleRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('должен создать правило', async () => {
      ruleRepo.create.mockReturnValue(mockRule);
      ruleRepo.save.mockResolvedValue(mockRule);

      const dto = {
        workspaceId: 'ws-1',
        name: 'New Rule',
        trigger: TriggerType.ON_CREATE,
        actions: [],
      };
      const result = await service.create(dto as any, 'user-1');

      expect(result).toEqual(mockRule);
    });
  });

  describe('update', () => {
    it('должен обновить правило', async () => {
      ruleRepo.findOne.mockResolvedValue(mockRule);
      ruleRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.update('rule-1', { name: 'Updated' });

      expect(result).toEqual(mockRule);
    });
  });

  describe('remove', () => {
    it('должен удалить правило', async () => {
      ruleRepo.findOne.mockResolvedValue(mockRule);
      ruleRepo.remove.mockResolvedValue(mockRule);

      await service.remove('rule-1');

      expect(ruleRepo.remove).toHaveBeenCalledWith(mockRule);
    });
  });

  describe('toggleActive', () => {
    it('должен переключить isActive', async () => {
      const activeRule = { ...mockRule, isActive: true };
      ruleRepo.findOne.mockResolvedValue(activeRule as any);
      ruleRepo.save.mockResolvedValue({ ...activeRule, isActive: false } as any);

      const result = await service.toggleActive('rule-1');

      expect(result.isActive).toBe(false);
    });
  });

  describe('executeRules', () => {
    it('должен выполнить подходящие правила', async () => {
      ruleRepo.find.mockResolvedValue([mockRule]);
      ruleRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.findOne.mockResolvedValue(mockEntity);

      const context: AutomationContext = {
        entity: mockEntity,
        trigger: TriggerType.ON_CREATE,
      };

      await service.executeRules(context);

      expect(ruleRepo.update).toHaveBeenCalledWith(
        'rule-1',
        expect.objectContaining({ lastExecutedAt: expect.any(Date) }),
      );
    });

    it('не должен выполнять если нет правил', async () => {
      ruleRepo.find.mockResolvedValue([]);

      const context: AutomationContext = {
        entity: mockEntity,
        trigger: TriggerType.ON_CREATE,
      };

      await service.executeRules(context);

      expect(entityRepo.update).not.toHaveBeenCalled();
    });

    it('должен проверять условия', async () => {
      const ruleWithCondition = {
        ...mockRule,
        conditions: [{ field: 'status', operator: ConditionOperator.EQUALS, value: 'done' }],
      };
      ruleRepo.find.mockResolvedValue([ruleWithCondition as any]);

      const context: AutomationContext = {
        entity: { ...mockEntity, status: 'new' } as any,
        trigger: TriggerType.ON_CREATE,
      };

      await service.executeRules(context);

      // Правило не должно выполниться, т.к. status !== 'done'
      expect(entityRepo.update).not.toHaveBeenCalled();
    });

    it('должен проверять fromStatus для ON_STATUS_CHANGE', async () => {
      const ruleWithConfig = {
        ...mockRule,
        trigger: TriggerType.ON_STATUS_CHANGE,
        triggerConfig: { fromStatus: 'new' },
      };
      ruleRepo.find.mockResolvedValue([ruleWithConfig as any]);

      const context: AutomationContext = {
        entity: mockEntity,
        previousEntity: { ...mockEntity, status: 'in_progress' } as any,
        trigger: TriggerType.ON_STATUS_CHANGE,
      };

      await service.executeRules(context);

      // Правило не должно выполниться, т.к. fromStatus !== 'new'
      expect(entityRepo.update).not.toHaveBeenCalled();
    });

    it('должен проверять toStatus для ON_STATUS_CHANGE', async () => {
      const ruleWithConfig = {
        ...mockRule,
        trigger: TriggerType.ON_STATUS_CHANGE,
        triggerConfig: { toStatus: ['done', 'closed'] },
      };
      ruleRepo.find.mockResolvedValue([ruleWithConfig as any]);
      ruleRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.findOne.mockResolvedValue({ ...mockEntity, status: 'done' } as any);

      const context: AutomationContext = {
        entity: { ...mockEntity, status: 'done' } as any,
        previousEntity: mockEntity,
        trigger: TriggerType.ON_STATUS_CHANGE,
      };

      await service.executeRules(context);

      expect(entityRepo.update).toHaveBeenCalled();
    });
  });

  describe('условия (conditions)', () => {
    beforeEach(() => {
      ruleRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.findOne.mockResolvedValue(mockEntity);
    });

    it('EQUALS - должен соответствовать', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'status', operator: ConditionOperator.EQUALS, value: 'new' }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('NOT_EQUALS - должен соответствовать', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'status', operator: ConditionOperator.NOT_EQUALS, value: 'done' }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('CONTAINS - должен соответствовать', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'title', operator: ConditionOperator.CONTAINS, value: 'Test' }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('NOT_CONTAINS - должен соответствовать', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'title', operator: ConditionOperator.NOT_CONTAINS, value: 'XYZ' }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('IS_EMPTY - должен соответствовать', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'description', operator: ConditionOperator.IS_EMPTY, value: null }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      const entityWithoutDesc = { ...mockEntity, description: null } as any;

      await service.executeRules({ entity: entityWithoutDesc, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('IS_NOT_EMPTY - должен соответствовать', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'title', operator: ConditionOperator.IS_NOT_EMPTY, value: null }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('GREATER_THAN - должен соответствовать', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'data.count', operator: ConditionOperator.GREATER_THAN, value: '5' }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      const entityWithCount = { ...mockEntity, data: { count: 10 } } as any;

      await service.executeRules({ entity: entityWithCount, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('LESS_THAN - должен соответствовать', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'data.count', operator: ConditionOperator.LESS_THAN, value: '15' }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      const entityWithCount = { ...mockEntity, data: { count: 10 } } as any;

      await service.executeRules({ entity: entityWithCount, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('должен читать поля из data', async () => {
      const rule = {
        ...mockRule,
        conditions: [{ field: 'field1', operator: ConditionOperator.EQUALS, value: 'value1' }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(ruleRepo.update).toHaveBeenCalled();
    });
  });

  describe('действия (actions)', () => {
    beforeEach(() => {
      ruleRepo.find.mockResolvedValue([mockRule as any]);
      ruleRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.findOne.mockResolvedValue(mockEntity);
    });

    it('SET_STATUS - должен изменить статус', async () => {
      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(entityRepo.update).toHaveBeenCalledWith('entity-1', { status: 'in_progress' });
      expect(eventsGateway.emitStatusChanged).toHaveBeenCalled();
    });

    it('SET_ASSIGNEE - должен назначить исполнителя', async () => {
      const rule = {
        ...mockRule,
        actions: [{ type: ActionType.SET_ASSIGNEE, config: { assigneeMode: 'specific', assigneeId: 'user-2' } }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(entityRepo.update).toHaveBeenCalledWith('entity-1', { assigneeId: 'user-2' });
    });

    it('SET_PRIORITY - должен изменить приоритет', async () => {
      const rule = {
        ...mockRule,
        actions: [{ type: ActionType.SET_PRIORITY, config: { priority: 'high' } }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(entityRepo.update).toHaveBeenCalledWith('entity-1', { priority: 'high' });
    });

    it('SET_FIELD - должен изменить поле', async () => {
      const rule = {
        ...mockRule,
        actions: [{ type: ActionType.SET_FIELD, config: { fieldId: 'customField', fieldValue: 'newValue' } }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(entityRepo.update).toHaveBeenCalledWith('entity-1', {
        data: expect.objectContaining({ customField: 'newValue' }),
      });
    });

    it('SEND_NOTIFICATION - должен отправить уведомление', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.SEND_NOTIFICATION,
          config: { recipientMode: 'assignee', message: 'Test {title}' },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      userRepo.findOne.mockResolvedValue(mockUser);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'notification',
        expect.objectContaining({ text: 'Test Test Entity' }),
      );
    });

    it('SEND_EMAIL - должен отправить email', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.SEND_EMAIL,
          config: {
            recipientMode: 'specific',
            recipientId: 'user-1',
            subject: 'Subject {customId}',
            message: 'Message {status}',
          },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      userRepo.findOne.mockResolvedValue(mockUser);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(emailService.send).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Subject TST-1',
        html: 'Message new',
      });
    });
  });

  describe('ON_FIELD_CHANGE trigger', () => {
    it('должен проверять fieldId', async () => {
      const rule = {
        ...mockRule,
        trigger: TriggerType.ON_FIELD_CHANGE,
        triggerConfig: { fieldId: 'customField' },
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      ruleRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.findOne.mockResolvedValue(mockEntity);

      // Правильное поле
      await service.executeRules({
        entity: mockEntity,
        trigger: TriggerType.ON_FIELD_CHANGE,
        changedField: 'customField',
      });

      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('не должен выполняться если fieldId не совпадает', async () => {
      const rule = {
        ...mockRule,
        trigger: TriggerType.ON_FIELD_CHANGE,
        triggerConfig: { fieldId: 'customField' },
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({
        entity: mockEntity,
        trigger: TriggerType.ON_FIELD_CHANGE,
        changedField: 'otherField',
      });

      expect(entityRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('EVALUATE_DMN действие', () => {
    let dmnService: jest.Mocked<DmnService>;

    beforeEach(() => {
      dmnService = {
        evaluateQuick: jest.fn().mockResolvedValue({}),
      } as any;
      // Re-assign after module compilation
      (service as any).dmnService = dmnService;
      ruleRepo.update.mockResolvedValue({ affected: 1 } as any);
      entityRepo.update.mockResolvedValue({ affected: 1 } as any);
    });

    it('должен вызвать DMN evaluation с входными данными entity', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: { decisionTableId: 'dmn-1' },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      entityRepo.findOne.mockResolvedValue(mockEntity);
      dmnService.evaluateQuick.mockResolvedValue({ resultStatus: 'approved' });

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(dmnService.evaluateQuick).toHaveBeenCalledWith(
        'dmn-1',
        expect.objectContaining({
          status: 'new',
          priority: 'medium',
          title: 'Test Entity',
        }),
      );
    });

    it('должен использовать inputMapping для маппинга полей', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: {
            decisionTableId: 'dmn-1',
            inputMapping: {
              priority: 'requestPriority',
              status: 'currentStatus',
            },
          },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      entityRepo.findOne.mockResolvedValue(mockEntity);
      dmnService.evaluateQuick.mockResolvedValue({});

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(dmnService.evaluateQuick).toHaveBeenCalledWith(
        'dmn-1',
        {
          requestPriority: 'medium',
          currentStatus: 'new',
        },
      );
    });

    it('должен применить результат DMN к entity (status)', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: { decisionTableId: 'dmn-1' },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      entityRepo.findOne.mockResolvedValue(mockEntity);
      dmnService.evaluateQuick.mockResolvedValue({ status: 'in_progress' });

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(entityRepo.update).toHaveBeenCalledWith(
        'entity-1',
        expect.objectContaining({ status: 'in_progress' }),
      );
    });

    it('должен применить результат DMN к entity (priority)', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: { decisionTableId: 'dmn-1' },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      entityRepo.findOne.mockResolvedValue(mockEntity);
      dmnService.evaluateQuick.mockResolvedValue({ priority: 'high' });

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(entityRepo.update).toHaveBeenCalledWith(
        'entity-1',
        expect.objectContaining({ priority: 'high' }),
      );
    });

    it('должен записывать кастомные поля в data', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: { decisionTableId: 'dmn-1' },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      entityRepo.findOne.mockResolvedValue(mockEntity);
      dmnService.evaluateQuick.mockResolvedValue({ riskLevel: 'high', score: 85 });

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(entityRepo.update).toHaveBeenCalledWith(
        'entity-1',
        expect.objectContaining({
          data: expect.objectContaining({
            riskLevel: 'high',
            score: 85,
          }),
        }),
      );
    });

    it('должен использовать outputMapping для маппинга результата', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: {
            decisionTableId: 'dmn-1',
            outputMapping: {
              resultPriority: 'priority',
              resultStatus: 'status',
            },
          },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      entityRepo.findOne.mockResolvedValue(mockEntity);
      dmnService.evaluateQuick.mockResolvedValue({
        resultPriority: 'high',
        resultStatus: 'approved',
      });

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(entityRepo.update).toHaveBeenCalledWith(
        'entity-1',
        expect.objectContaining({
          priority: 'high',
          status: 'approved',
        }),
      );
    });

    it('не должен применять результат если applyOutputToEntity = false', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: {
            decisionTableId: 'dmn-1',
            applyOutputToEntity: false,
          },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      dmnService.evaluateQuick.mockResolvedValue({ status: 'approved' });

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      // update должен быть вызван только для статистики правила, не для entity
      expect(entityRepo.update).not.toHaveBeenCalled();
    });

    it('должен эмитить событие после обновления entity', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: { decisionTableId: 'dmn-1' },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      entityRepo.findOne.mockResolvedValue(mockEntity);
      dmnService.evaluateQuick.mockResolvedValue({ priority: 'high' });

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(eventsGateway.emitEntityUpdated).toHaveBeenCalledWith(mockEntity);
    });

    it('должен обрабатывать ошибки DMN evaluation gracefully', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: { decisionTableId: 'dmn-1' },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      dmnService.evaluateQuick.mockRejectedValue(new Error('DMN evaluation failed'));

      // Не должен выбрасывать исключение
      await expect(service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE }))
        .resolves.not.toThrow();

      // Статистика правила все равно должна обновиться
      expect(ruleRepo.update).toHaveBeenCalled();
    });

    it('не должен выполнять DMN если decisionTableId не задан', async () => {
      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: {},
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);

      await service.executeRules({ entity: mockEntity, trigger: TriggerType.ON_CREATE });

      expect(dmnService.evaluateQuick).not.toHaveBeenCalled();
    });

    it('должен передавать data поля entity как входные данные', async () => {
      const entityWithData = {
        ...mockEntity,
        data: { customField: 'customValue', amount: 1000 },
      } as any;

      const rule = {
        ...mockRule,
        actions: [{
          type: ActionType.EVALUATE_DMN,
          config: { decisionTableId: 'dmn-1' },
        }],
      };
      ruleRepo.find.mockResolvedValue([rule as any]);
      entityRepo.findOne.mockResolvedValue(entityWithData);
      dmnService.evaluateQuick.mockResolvedValue({});

      await service.executeRules({ entity: entityWithData, trigger: TriggerType.ON_CREATE });

      expect(dmnService.evaluateQuick).toHaveBeenCalledWith(
        'dmn-1',
        expect.objectContaining({
          customField: 'customValue',
          amount: 1000,
        }),
      );
    });
  });
});
