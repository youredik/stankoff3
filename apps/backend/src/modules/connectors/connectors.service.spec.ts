import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { ConnectorsService } from './connectors.service';
import { EmailConnector } from './implementations/email.connector';
import { TelegramConnector } from './implementations/telegram.connector';
import { RestConnector } from './implementations/rest.connector';
import { ConfigService } from '@nestjs/config';

describe('ConnectorsService', () => {
  let service: ConnectorsService;
  let emailConnector: EmailConnector;
  let telegramConnector: TelegramConnector;
  let restConnector: RestConnector;

  beforeEach(async () => {
    const mockModuleRef = {
      get: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectorsService,
        {
          provide: EmailConnector,
          useValue: {
            type: 'connector:email',
            name: 'Email',
            description: 'Email connector',
            configSchema: {},
            inputSchema: { required: ['to', 'subject', 'body'] },
            outputSchema: {},
            execute: jest.fn(),
            validate: jest.fn(),
          },
        },
        {
          provide: TelegramConnector,
          useValue: {
            type: 'connector:telegram',
            name: 'Telegram',
            description: 'Telegram connector',
            configSchema: {},
            inputSchema: { required: ['chatId', 'message'] },
            outputSchema: {},
            execute: jest.fn(),
            validate: jest.fn(),
          },
        },
        {
          provide: RestConnector,
          useValue: {
            type: 'connector:rest',
            name: 'REST API',
            description: 'REST connector',
            configSchema: {},
            inputSchema: { required: ['url'] },
            outputSchema: {},
            execute: jest.fn(),
            validate: jest.fn(),
          },
        },
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ConnectorsService>(ConnectorsService);
    emailConnector = module.get<EmailConnector>(EmailConnector);
    telegramConnector = module.get<TelegramConnector>(TelegramConnector);
    restConnector = module.get<RestConnector>(RestConnector);

    // Trigger onModuleInit to register connectors
    await service.onModuleInit();
  });

  describe('onModuleInit', () => {
    it('should register all connectors', () => {
      const connectors = service.getAllConnectors();
      expect(connectors).toHaveLength(3);
      expect(connectors.map((c) => c.type)).toContain('connector:email');
      expect(connectors.map((c) => c.type)).toContain('connector:telegram');
      expect(connectors.map((c) => c.type)).toContain('connector:rest');
    });
  });

  describe('getConnector', () => {
    it('should return connector by type', () => {
      const connector = service.getConnector('connector:email');
      expect(connector).toBeDefined();
      expect(connector?.type).toBe('connector:email');
    });

    it('should return undefined for unknown connector', () => {
      const connector = service.getConnector('unknown:connector');
      expect(connector).toBeUndefined();
    });
  });

  describe('getAllConnectors', () => {
    it('should return metadata for all connectors', () => {
      const connectors = service.getAllConnectors();

      expect(connectors).toHaveLength(3);

      const email = connectors.find((c) => c.type === 'connector:email');
      expect(email).toBeDefined();
      expect(email?.name).toBe('Email');
      expect(email?.category).toBe('communication');

      const telegram = connectors.find((c) => c.type === 'connector:telegram');
      expect(telegram).toBeDefined();
      expect(telegram?.category).toBe('communication');

      const rest = connectors.find((c) => c.type === 'connector:rest');
      expect(rest).toBeDefined();
      expect(rest?.category).toBe('integration');
    });
  });

  describe('executeConnector', () => {
    it('should execute email connector with input', async () => {
      const mockResult = { success: true, data: { sent: true } };
      (emailConnector.execute as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.executeConnector('connector:email', {
        to: 'test@example.com',
        subject: 'Test',
        body: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(emailConnector.execute).toHaveBeenCalled();
    });

    it('should return error for unknown connector', async () => {
      const result = await service.executeConnector('unknown', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should pass context variables to connector', async () => {
      const mockResult = { success: true };
      (restConnector.execute as jest.Mock).mockResolvedValue(mockResult);

      await service.executeConnector(
        'connector:rest',
        { url: 'https://api.example.com/{entityId}' },
        { entityId: 'entity-123', workspaceId: 'ws-1' },
      );

      expect(restConnector.execute).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          entityId: 'entity-123',
          workspaceId: 'ws-1',
        }),
      );
    });
  });

  describe('validateConnector', () => {
    it('should validate connector configuration', async () => {
      (emailConnector.validate as jest.Mock).mockResolvedValue({ valid: true });

      const result = await service.validateConnector('connector:email', {});

      expect(result.valid).toBe(true);
    });

    it('should return error for unknown connector', async () => {
      const result = await service.validateConnector('unknown', {});

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
