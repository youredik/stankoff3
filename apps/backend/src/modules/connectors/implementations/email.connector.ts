import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BaseConnector } from '../base/base-connector';
import { ConnectorResult, ConnectorContext } from '../interfaces/connector.interface';
import { EmailService } from '../../email/email.service';

export interface EmailConnectorInput {
  to: string | string[];
  subject: string;
  body: string;
  bodyType?: 'text' | 'html';
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    contentType?: string;
  }>;
  // Шаблонизация
  template?: string;
  templateVariables?: Record<string, unknown>;
}

/**
 * Email коннектор для BPMN
 * Позволяет отправлять email из BPMN процессов
 */
@Injectable()
export class EmailConnector extends BaseConnector {
  readonly type = 'connector:email';
  readonly name = 'Email';
  readonly description = 'Отправка email сообщений из BPMN процессов';

  readonly configSchema = {
    type: 'object',
    properties: {
      defaultFrom: {
        type: 'string',
        description: 'Email адрес отправителя по умолчанию',
      },
    },
  };

  readonly inputSchema = {
    type: 'object',
    required: ['to', 'subject', 'body'],
    properties: {
      to: {
        oneOf: [
          { type: 'string', format: 'email' },
          { type: 'array', items: { type: 'string', format: 'email' } },
        ],
        description: 'Получатель(и) email',
      },
      subject: {
        type: 'string',
        description: 'Тема письма (поддерживает шаблоны {variable})',
      },
      body: {
        type: 'string',
        description: 'Тело письма (поддерживает шаблоны {variable})',
      },
      bodyType: {
        type: 'string',
        enum: ['text', 'html'],
        default: 'html',
        description: 'Тип тела письма',
      },
      cc: {
        oneOf: [
          { type: 'string', format: 'email' },
          { type: 'array', items: { type: 'string', format: 'email' } },
        ],
        description: 'Копия',
      },
      bcc: {
        oneOf: [
          { type: 'string', format: 'email' },
          { type: 'array', items: { type: 'string', format: 'email' } },
        ],
        description: 'Скрытая копия',
      },
      replyTo: {
        type: 'string',
        format: 'email',
        description: 'Адрес для ответа',
      },
      template: {
        type: 'string',
        enum: ['notification', 'approval', 'status-change', 'custom'],
        description: 'Шаблон письма',
      },
      templateVariables: {
        type: 'object',
        description: 'Переменные для шаблона',
      },
    },
  };

  readonly outputSchema = {
    type: 'object',
    properties: {
      sent: { type: 'boolean', description: 'Успешно ли отправлено' },
      messageId: { type: 'string', description: 'ID сообщения' },
      recipients: { type: 'number', description: 'Количество получателей' },
    },
  };

  private emailService?: EmailService;

  constructor(private readonly moduleRef: ModuleRef) {
    super();
  }

  async onModuleInit() {
    try {
      this.emailService = this.moduleRef.get(EmailService, { strict: false });
    } catch {
      this.logger.warn('EmailService not available');
    }
  }

  protected async doExecute(
    input: Record<string, unknown>,
    context: ConnectorContext,
  ): Promise<ConnectorResult> {
    if (!this.emailService) {
      return {
        success: false,
        error: 'EmailService not available',
      };
    }

    const emailInput = input as unknown as EmailConnectorInput;

    // Интерполяция переменных в subject и body
    const variables = {
      ...context.variables,
      ...(emailInput.templateVariables || {}),
    };

    const subject = this.interpolate(emailInput.subject, variables);
    const body = this.interpolate(emailInput.body, variables);

    // Определяем получателей
    const recipients = Array.isArray(emailInput.to)
      ? emailInput.to
      : [emailInput.to];

    // Применяем шаблон если указан
    const htmlBody = emailInput.template
      ? this.applyTemplate(emailInput.template, body, variables)
      : emailInput.bodyType === 'html'
        ? body
        : `<pre>${body}</pre>`;

    // Отправляем email
    const sent = await this.emailService.send({
      to: recipients.join(', '),
      subject,
      text: body,
      html: htmlBody,
    });

    return {
      success: sent,
      data: {
        sent,
        recipients: recipients.length,
        subject,
      },
    };
  }

  /**
   * Применить шаблон письма
   */
  private applyTemplate(
    template: string,
    content: string,
    variables: Record<string, unknown>,
  ): string {
    const entityTitle = String(variables.entityTitle || variables.title || '');
    const entityId = String(variables.entityId || variables.customId || '');
    const entityUrl = variables.entityUrl
      ? String(variables.entityUrl)
      : variables.entityId
        ? `${variables.frontendUrl || ''}/dashboard?entity=${variables.entityId}`
        : '';

    switch (template) {
      case 'notification':
        return `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #0d9488; color: white; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Уведомление</h1>
            </div>
            <div style="padding: 32px; background: #f0fdfa;">
              <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #99f6e4;">
                ${content}
              </div>
              ${entityUrl ? `
              <div style="margin-top: 24px; text-align: center;">
                <a href="${entityUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                  Открыть
                </a>
              </div>
              ` : ''}
            </div>
            <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
              Автоматическое уведомление от Stankoff Portal
            </div>
          </div>
        `;

      case 'approval':
        return `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #3b82f6; color: white; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Требуется согласование</h1>
            </div>
            <div style="padding: 32px; background: #eff6ff;">
              <h2 style="margin: 0 0 16px; color: #1e40af;">${entityTitle || 'Заявка'} ${entityId}</h2>
              <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #93c5fd;">
                ${content}
              </div>
              ${entityUrl ? `
              <div style="margin-top: 24px; text-align: center;">
                <a href="${entityUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                  Перейти к согласованию
                </a>
              </div>
              ` : ''}
            </div>
            <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
              Автоматическое уведомление от Stankoff Portal
            </div>
          </div>
        `;

      case 'status-change':
        const oldStatus = String(variables.oldStatus || '');
        const newStatus = String(variables.newStatus || variables.status || '');
        return `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #8b5cf6; color: white; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Изменение статуса</h1>
            </div>
            <div style="padding: 32px; background: #f5f3ff;">
              <h2 style="margin: 0 0 16px; color: #5b21b6;">${entityTitle || 'Заявка'} ${entityId}</h2>
              <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #c4b5fd;">
                ${oldStatus && newStatus ? `
                <p style="margin: 0 0 12px; color: #4b5563;">
                  Статус изменён: <strong>${oldStatus}</strong> → <strong>${newStatus}</strong>
                </p>
                ` : ''}
                ${content}
              </div>
              ${entityUrl ? `
              <div style="margin-top: 24px; text-align: center;">
                <a href="${entityUrl}" style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                  Открыть заявку
                </a>
              </div>
              ` : ''}
            </div>
            <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
              Автоматическое уведомление от Stankoff Portal
            </div>
          </div>
        `;

      case 'custom':
      default:
        return content;
    }
  }

  /**
   * Валидация конфигурации - проверяем доступность EmailService
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    if (!this.emailService) {
      return { valid: false, error: 'EmailService not available' };
    }
    return { valid: true };
  }
}
