import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseConnector } from '../base/base-connector';
import {
  ConnectorResult,
  ConnectorContext,
  ConnectorConfig,
} from '../interfaces/connector.interface';

export interface TelegramConnectorInput {
  chatId: string | number;
  message: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableNotification?: boolean;
  replyToMessageId?: number;
  // Кнопки
  inlineKeyboard?: Array<
    Array<{
      text: string;
      url?: string;
      callbackData?: string;
    }>
  >;
}

/**
 * Telegram коннектор для BPMN
 * Позволяет отправлять сообщения в Telegram из BPMN процессов
 */
@Injectable()
export class TelegramConnector extends BaseConnector {
  readonly type = 'connector:telegram';
  readonly name = 'Telegram';
  readonly description = 'Отправка сообщений в Telegram из BPMN процессов';

  readonly configSchema = {
    type: 'object',
    required: ['botToken'],
    properties: {
      botToken: {
        type: 'string',
        description: 'Токен Telegram бота',
      },
      defaultChatId: {
        type: 'string',
        description: 'Chat ID по умолчанию',
      },
    },
  };

  readonly inputSchema = {
    type: 'object',
    required: ['chatId', 'message'],
    properties: {
      chatId: {
        oneOf: [{ type: 'string' }, { type: 'number' }],
        description: 'ID чата или username (с @)',
      },
      message: {
        type: 'string',
        description: 'Текст сообщения (поддерживает шаблоны {variable})',
      },
      parseMode: {
        type: 'string',
        enum: ['HTML', 'Markdown', 'MarkdownV2'],
        default: 'HTML',
        description: 'Режим форматирования',
      },
      disableNotification: {
        type: 'boolean',
        default: false,
        description: 'Отключить звук уведомления',
      },
      inlineKeyboard: {
        type: 'array',
        description: 'Inline кнопки',
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['text'],
            properties: {
              text: { type: 'string' },
              url: { type: 'string' },
              callbackData: { type: 'string' },
            },
          },
        },
      },
    },
  };

  readonly outputSchema = {
    type: 'object',
    properties: {
      sent: { type: 'boolean', description: 'Успешно ли отправлено' },
      messageId: { type: 'number', description: 'ID сообщения в Telegram' },
      chatId: { type: 'string', description: 'ID чата' },
    },
  };

  private botToken: string | null = null;
  private defaultChatId: string | null = null;
  private readonly telegramApiUrl = 'https://api.telegram.org/bot';

  constructor(private readonly configService: ConfigService) {
    super();
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || null;
    this.defaultChatId =
      this.configService.get<string>('TELEGRAM_DEFAULT_CHAT_ID') || null;
  }

  protected async doExecute(
    input: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    if (!this.botToken) {
      return {
        success: false,
        error: 'Telegram bot token not configured (TELEGRAM_BOT_TOKEN)',
      };
    }

    const telegramInput = input as unknown as TelegramConnectorInput;
    const chatId = telegramInput.chatId || this.defaultChatId;

    if (!chatId) {
      return {
        success: false,
        error: 'Chat ID not specified and no default configured',
      };
    }

    // Интерполяция переменных
    const message = this.interpolate(telegramInput.message, context.variables);

    // Формируем payload
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: message,
      parse_mode: telegramInput.parseMode || 'HTML',
      disable_notification: telegramInput.disableNotification || false,
    };

    if (telegramInput.replyToMessageId) {
      payload.reply_to_message_id = telegramInput.replyToMessageId;
    }

    // Inline keyboard
    if (telegramInput.inlineKeyboard && telegramInput.inlineKeyboard.length > 0) {
      payload.reply_markup = {
        inline_keyboard: telegramInput.inlineKeyboard.map((row) =>
          row.map((button) => {
            const btn: Record<string, string> = { text: button.text };
            if (button.url) btn.url = button.url;
            if (button.callbackData) btn.callback_data = button.callbackData;
            return btn;
          }),
        ),
      };
    }

    // Отправляем запрос
    try {
      const response = await fetch(`${this.telegramApiUrl}${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };

      if (result.ok) {
        return {
          success: true,
          data: {
            sent: true,
            messageId: result.result?.message_id,
            chatId: String(chatId),
          },
        };
      } else {
        return {
          success: false,
          error: result.description || 'Telegram API error',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Валидация конфигурации - проверяем токен бота
   */
  async validate(config?: ConnectorConfig): Promise<{ valid: boolean; error?: string }> {
    const token = (config?.botToken as string) || this.botToken;

    if (!token) {
      return { valid: false, error: 'Bot token not configured' };
    }

    try {
      const response = await fetch(`${this.telegramApiUrl}${token}/getMe`);
      const result = (await response.json()) as { ok: boolean; description?: string };

      if (result.ok) {
        return { valid: true };
      } else {
        return { valid: false, error: result.description || 'Invalid bot token' };
      }
    } catch {
      return { valid: false, error: 'Failed to connect to Telegram API' };
    }
  }
}
