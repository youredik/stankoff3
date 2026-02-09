import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WebhookTriggersController, TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';
import { TriggerType } from '../entities/process-trigger.entity';

describe('WebhookTriggersController', () => {
  let controller: WebhookTriggersController;
  let triggersService: jest.Mocked<TriggersService>;

  const webhookSecret = 'test-secret-key-123';

  const mockWebhookTrigger = {
    id: 'trigger-1',
    workspaceId: 'ws-1',
    triggerType: TriggerType.WEBHOOK,
    conditions: { secret: webhookSecret },
    isActive: true,
  };

  const mockWebhookTriggerNoSecret = {
    ...mockWebhookTrigger,
    id: 'trigger-2',
    conditions: {},
  };

  const mockNonWebhookTrigger = {
    ...mockWebhookTrigger,
    id: 'trigger-3',
    triggerType: TriggerType.ENTITY_CREATED,
  };

  beforeEach(async () => {
    const mockTriggersService = {
      findOne: jest.fn(),
      evaluateTriggers: jest.fn(),
      findByWorkspace: jest.fn(),
      findByDefinition: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      toggle: jest.fn(),
      getExecutions: jest.fn(),
      getRecentExecutions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookTriggersController],
      providers: [
        { provide: TriggersService, useValue: mockTriggersService },
      ],
    }).compile();

    controller = module.get<WebhookTriggersController>(WebhookTriggersController);
    triggersService = module.get(TriggersService);
  });

  describe('handleWebhook', () => {
    it('должен принять webhook с валидной HMAC-SHA256 подписью', async () => {
      triggersService.findOne.mockResolvedValue(mockWebhookTrigger as any);

      const body = { event: 'test', data: 'hello' };
      const payload = JSON.stringify(body);
      const hmac = createHmac('sha256', webhookSecret).update(payload).digest('hex');
      const signature = `sha256=${hmac}`;

      const req = { body } as any;
      const result = await controller.handleWebhook('trigger-1', body, req, undefined, signature);

      expect(result).toEqual({ success: true });
      expect(triggersService.evaluateTriggers).toHaveBeenCalledWith(
        TriggerType.WEBHOOK,
        { triggerId: 'trigger-1', payload: body, workspaceId: 'ws-1' },
        'ws-1',
      );
    });

    it('должен принять webhook с валидным plain secret', async () => {
      triggersService.findOne.mockResolvedValue(mockWebhookTrigger as any);

      const body = { event: 'test' };
      const req = { body } as any;
      const result = await controller.handleWebhook('trigger-1', body, req, webhookSecret, undefined);

      expect(result).toEqual({ success: true });
      expect(triggersService.evaluateTriggers).toHaveBeenCalled();
    });

    it('должен отклонить webhook с невалидной HMAC подписью', async () => {
      triggersService.findOne.mockResolvedValue(mockWebhookTrigger as any);

      const body = { event: 'test' };
      const req = { body } as any;
      const wrongSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

      await expect(
        controller.handleWebhook('trigger-1', body, req, undefined, wrongSignature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('должен отклонить webhook с невалидным plain secret', async () => {
      triggersService.findOne.mockResolvedValue(mockWebhookTrigger as any);

      const body = { event: 'test' };
      const req = { body } as any;

      await expect(
        controller.handleWebhook('trigger-1', body, req, 'wrong-secret', undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('должен отклонить webhook без аутентификации когда secret настроен', async () => {
      triggersService.findOne.mockResolvedValue(mockWebhookTrigger as any);

      const body = { event: 'test' };
      const req = { body } as any;

      await expect(
        controller.handleWebhook('trigger-1', body, req, undefined, undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('должен отклонить webhook с некорректным форматом подписи', async () => {
      triggersService.findOne.mockResolvedValue(mockWebhookTrigger as any);

      const body = { event: 'test' };
      const req = { body } as any;

      await expect(
        controller.handleWebhook('trigger-1', body, req, undefined, 'invalid-format'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('должен принять webhook без secret если secret не настроен', async () => {
      triggersService.findOne.mockResolvedValue(mockWebhookTriggerNoSecret as any);

      const body = { event: 'test' };
      const req = { body } as any;
      const result = await controller.handleWebhook('trigger-2', body, req, undefined, undefined);

      expect(result).toEqual({ success: true });
      expect(triggersService.evaluateTriggers).toHaveBeenCalled();
    });

    it('должен отклонить не-webhook триггер', async () => {
      triggersService.findOne.mockResolvedValue(mockNonWebhookTrigger as any);

      const body = { event: 'test' };
      const req = { body } as any;

      await expect(
        controller.handleWebhook('trigger-3', body, req, undefined, undefined),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('HMAC должен предпочитаться plain secret если оба переданы', async () => {
      triggersService.findOne.mockResolvedValue(mockWebhookTrigger as any);

      const body = { event: 'test' };
      const payload = JSON.stringify(body);
      const hmac = createHmac('sha256', webhookSecret).update(payload).digest('hex');
      const signature = `sha256=${hmac}`;

      const req = { body } as any;
      // Pass both valid HMAC and wrong plain secret — HMAC should be used
      const result = await controller.handleWebhook('trigger-1', body, req, 'wrong-secret', signature);

      expect(result).toEqual({ success: true });
    });
  });
});

describe('TriggersController', () => {
  let controller: TriggersController;
  let triggersService: jest.Mocked<TriggersService>;

  beforeEach(async () => {
    const mockTriggersService = {
      findByWorkspace: jest.fn(),
      findByDefinition: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      toggle: jest.fn(),
      getExecutions: jest.fn(),
      getRecentExecutions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TriggersController],
      providers: [
        { provide: TriggersService, useValue: mockTriggersService },
      ],
    }).compile();

    controller = module.get<TriggersController>(TriggersController);
    triggersService = module.get(TriggersService);
  });

  it('findAll должен вызвать findByWorkspace', async () => {
    triggersService.findByWorkspace.mockResolvedValue([]);
    await controller.findAll('ws-1');
    expect(triggersService.findByWorkspace).toHaveBeenCalledWith('ws-1');
  });

  it('create должен передать dto и userId', async () => {
    const dto = { workspaceId: 'ws-1', processDefinitionId: 'pd-1', triggerType: TriggerType.ENTITY_CREATED } as any;
    const user = { id: 'user-1' } as any;
    triggersService.create.mockResolvedValue({} as any);

    await controller.create(dto, user);

    expect(triggersService.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('toggle должен вызвать toggle с id', async () => {
    triggersService.toggle.mockResolvedValue({} as any);
    await controller.toggle('trigger-1');
    expect(triggersService.toggle).toHaveBeenCalledWith('trigger-1');
  });
});
