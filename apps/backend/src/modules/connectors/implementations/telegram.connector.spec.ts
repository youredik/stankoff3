import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TelegramConnector } from './telegram.connector';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('TelegramConnector', () => {
  let connector: TelegramConnector;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockFetch.mockClear();

    const mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'TELEGRAM_BOT_TOKEN') return 'test-bot-token';
        if (key === 'TELEGRAM_DEFAULT_CHAT_ID') return null;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramConnector,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    connector = module.get<TelegramConnector>(TelegramConnector);
    configService = mockConfigService as unknown as jest.Mocked<ConfigService>;
  });

  describe('metadata', () => {
    it('should have correct type', () => {
      expect(connector.type).toBe('connector:telegram');
    });

    it('should have correct name', () => {
      expect(connector.name).toBe('Telegram');
    });

    it('should have input schema with required fields', () => {
      expect(connector.inputSchema.required).toContain('chatId');
      expect(connector.inputSchema.required).toContain('message');
    });
  });

  describe('execute', () => {
    const baseContext = {
      processInstanceKey: 'test-123',
      workspaceId: 'ws-1',
      entityId: 'entity-1',
      variables: {},
    };

    it('should send message successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, result: { message_id: 12345 } }),
      });

      const result = await connector.execute(
        {
          chatId: '123456789',
          message: 'Hello World',
        },
        baseContext,
      );

      expect(result.success).toBe(true);
      expect(result.data?.sent).toBe(true);
      expect(result.data?.messageId).toBe(12345);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sendMessage'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Hello World'),
        }),
      );
    });

    it('should interpolate variables in message', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      await connector.execute(
        {
          chatId: '123',
          message: 'Заявка {customId} обновлена',
        },
        {
          ...baseContext,
          variables: { customId: 'REQ-456' },
        },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('Заявка REQ-456 обновлена'),
        }),
      );
    });

    it('should send message with inline keyboard', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      await connector.execute(
        {
          chatId: '123',
          message: 'Select action',
          inlineKeyboard: [
            [
              { text: 'Approve', callbackData: 'approve' },
              { text: 'Reject', callbackData: 'reject' },
            ],
          ],
        },
        baseContext,
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.reply_markup).toBeDefined();
      expect(callBody.reply_markup.inline_keyboard[0][0].text).toBe('Approve');
    });

    it('should handle parseMode parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      await connector.execute(
        {
          chatId: '123',
          message: '<b>Bold</b> text',
          parseMode: 'HTML',
        },
        baseContext,
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.parse_mode).toBe('HTML');
    });

    it('should return error when bot token not configured', async () => {
      // Reset connector without token
      (connector as any).botToken = null;

      const result = await connector.execute(
        {
          chatId: '123',
          message: 'Test',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('bot token');
    });

    it('should return error when chatId not specified', async () => {
      const result = await connector.execute(
        {
          message: 'Test',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('chatId');
    });

    it('should handle Telegram API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            ok: false,
            description: 'Bad Request: chat not found',
          }),
      });

      const result = await connector.execute(
        {
          chatId: 'invalid',
          message: 'Test',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('chat not found');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await connector.execute(
        {
          chatId: '123',
          message: 'Test',
        },
        baseContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('validate', () => {
    it('should validate bot token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true }),
      });

      const result = await connector.validate({ botToken: 'valid-token' });

      expect(result.valid).toBe(true);
    });

    it('should return error for invalid token', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, description: 'Unauthorized' }),
      });

      const result = await connector.validate({ botToken: 'invalid-token' });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });
  });
});
