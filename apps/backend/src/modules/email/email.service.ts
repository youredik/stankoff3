import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { User } from '../user/user.entity';
import type { WorkspaceEntity } from '../entity/entity.entity';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    this.fromEmail = this.configService.get('SMTP_FROM_EMAIL', 'noreply@stankoff.ru');
    this.fromName = this.configService.get('SMTP_FROM_NAME', 'Stankoff Portal');
    this.enabled = this.configService.get('SMTP_ENABLED', 'false') === 'true';

    if (this.enabled) {
      this.initTransporter();
    } else {
      this.logger.warn('Email отправка отключена (SMTP_ENABLED=false)');
    }
  }

  private initTransporter() {
    const host = this.configService.get('SMTP_HOST');
    const port = this.configService.get('SMTP_PORT', '587');
    const user = this.configService.get('SMTP_USER');
    const pass = this.configService.get('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP не настроен: отсутствуют SMTP_HOST, SMTP_USER или SMTP_PASS');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: port === '465',
      auth: { user, pass },
    });

    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('Ошибка подключения к SMTP:', error.message);
      } else {
        this.logger.log('SMTP подключение успешно');
      }
    });
  }

  async send(options: EmailOptions): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      this.logger.debug(`Email не отправлен (disabled): ${options.subject} -> ${options.to}`);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(`Email отправлен: ${options.subject} -> ${options.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Ошибка отправки email: ${error.message}`);
      return false;
    }
  }

  // Уведомление о назначении исполнителем
  async sendAssignmentNotification(
    assignee: User,
    entity: WorkspaceEntity,
    assignedBy: User,
    frontendUrl: string,
  ): Promise<boolean> {
    const entityUrl = `${frontendUrl}/dashboard?entity=${entity.id}`;

    return this.send({
      to: assignee.email,
      subject: `Вам назначена заявка ${entity.customId}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #4f46e5; color: white; padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Stankoff Portal</h1>
          </div>
          <div style="padding: 32px; background: #f9fafb;">
            <h2 style="margin: 0 0 16px; color: #111827;">Вам назначена заявка</h2>
            <p style="margin: 0 0 24px; color: #6b7280;">
              ${assignedBy.firstName} ${assignedBy.lastName} назначил(а) вас исполнителем заявки.
            </p>
            <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px;">
                <strong style="color: #111827;">${entity.customId}</strong>
                <span style="color: #6b7280; margin-left: 8px;">${entity.title}</span>
              </p>
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Статус: ${entity.status}
              </p>
            </div>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${entityUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                Открыть заявку
              </a>
            </div>
          </div>
          <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
            Это автоматическое уведомление от Stankoff Portal
          </div>
        </div>
      `,
      text: `Вам назначена заявка ${entity.customId}: ${entity.title}. Назначил: ${assignedBy.firstName} ${assignedBy.lastName}. Ссылка: ${entityUrl}`,
    });
  }

  // Уведомление о новом комментарии
  async sendCommentNotification(
    recipient: User,
    entity: WorkspaceEntity,
    commentAuthor: User,
    commentPreview: string,
    frontendUrl: string,
  ): Promise<boolean> {
    const entityUrl = `${frontendUrl}/dashboard?entity=${entity.id}`;

    return this.send({
      to: recipient.email,
      subject: `Новый комментарий в заявке ${entity.customId}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #4f46e5; color: white; padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Stankoff Portal</h1>
          </div>
          <div style="padding: 32px; background: #f9fafb;">
            <h2 style="margin: 0 0 16px; color: #111827;">Новый комментарий</h2>
            <p style="margin: 0 0 24px; color: #6b7280;">
              ${commentAuthor.firstName} ${commentAuthor.lastName} оставил(а) комментарий в заявке <strong>${entity.customId}</strong>.
            </p>
            <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #374151; font-style: italic;">
                "${commentPreview.substring(0, 200)}${commentPreview.length > 200 ? '...' : ''}"
              </p>
            </div>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${entityUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                Открыть заявку
              </a>
            </div>
          </div>
          <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
            Это автоматическое уведомление от Stankoff Portal
          </div>
        </div>
      `,
      text: `Новый комментарий в заявке ${entity.customId} от ${commentAuthor.firstName} ${commentAuthor.lastName}: "${commentPreview.substring(0, 200)}". Ссылка: ${entityUrl}`,
    });
  }

  // Уведомление об изменении статуса
  async sendStatusChangeNotification(
    recipient: User,
    entity: WorkspaceEntity,
    changedBy: User,
    oldStatus: string,
    newStatus: string,
    frontendUrl: string,
  ): Promise<boolean> {
    const entityUrl = `${frontendUrl}/dashboard?entity=${entity.id}`;

    return this.send({
      to: recipient.email,
      subject: `Статус заявки ${entity.customId} изменён`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #4f46e5; color: white; padding: 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Stankoff Portal</h1>
          </div>
          <div style="padding: 32px; background: #f9fafb;">
            <h2 style="margin: 0 0 16px; color: #111827;">Статус заявки изменён</h2>
            <p style="margin: 0 0 24px; color: #6b7280;">
              ${changedBy.firstName} ${changedBy.lastName} изменил(а) статус заявки <strong>${entity.customId}</strong>.
            </p>
            <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; color: #111827; font-weight: 500;">${entity.title}</p>
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 12px;">
                <span style="padding: 4px 12px; background: #f3f4f6; border-radius: 4px; color: #6b7280;">${oldStatus}</span>
                <span style="color: #9ca3af;">→</span>
                <span style="padding: 4px 12px; background: #dbeafe; border-radius: 4px; color: #1d4ed8;">${newStatus}</span>
              </div>
            </div>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${entityUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                Открыть заявку
              </a>
            </div>
          </div>
          <div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
            Это автоматическое уведомление от Stankoff Portal
          </div>
        </div>
      `,
      text: `Статус заявки ${entity.customId} изменён: ${oldStatus} → ${newStatus}. Изменил: ${changedBy.firstName} ${changedBy.lastName}. Ссылка: ${entityUrl}`,
    });
  }
}
