import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AutomationRule,
  TriggerType,
  ActionType,
  ConditionOperator,
  RuleCondition,
  RuleAction,
} from './automation-rule.entity';
import { CreateAutomationRuleDto } from './dto/create-rule.dto';
import { UpdateAutomationRuleDto } from './dto/update-rule.dto';
import { WorkspaceEntity } from '../entity/entity.entity';
import { User } from '../user/user.entity';
import { EventsGateway } from '../websocket/events.gateway';
import { EmailService } from '../email/email.service';

export interface AutomationContext {
  entity: WorkspaceEntity;
  previousEntity?: WorkspaceEntity;
  actor?: User;
  trigger: TriggerType;
  changedField?: string;
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectRepository(AutomationRule)
    private ruleRepository: Repository<AutomationRule>,
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Inject(forwardRef(() => EventsGateway))
    private eventsGateway: EventsGateway,
    private emailService: EmailService,
  ) {}

  // ==================== CRUD операции ====================

  async findAll(workspaceId: string): Promise<AutomationRule[]> {
    return this.ruleRepository.find({
      where: { workspaceId },
      order: { priority: 'ASC', createdAt: 'DESC' },
      relations: ['createdBy'],
    });
  }

  async findOne(id: string): Promise<AutomationRule> {
    const rule = await this.ruleRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!rule) {
      throw new NotFoundException(`Правило ${id} не найдено`);
    }
    return rule;
  }

  async create(dto: CreateAutomationRuleDto, createdById?: string): Promise<AutomationRule> {
    const rule = this.ruleRepository.create({
      ...dto,
      createdById,
    });
    return this.ruleRepository.save(rule);
  }

  async update(id: string, dto: UpdateAutomationRuleDto): Promise<AutomationRule> {
    await this.findOne(id);
    await this.ruleRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const rule = await this.findOne(id);
    await this.ruleRepository.remove(rule);
  }

  async toggleActive(id: string): Promise<AutomationRule> {
    const rule = await this.findOne(id);
    rule.isActive = !rule.isActive;
    return this.ruleRepository.save(rule);
  }

  // ==================== Выполнение правил ====================

  /**
   * Основной метод - выполняет все подходящие правила для контекста
   */
  async executeRules(context: AutomationContext): Promise<void> {
    const rules = await this.ruleRepository.find({
      where: {
        workspaceId: context.entity.workspaceId,
        isActive: true,
        trigger: context.trigger,
      },
      order: { priority: 'ASC' },
    });

    if (rules.length === 0) return;

    this.logger.debug(
      `Found ${rules.length} rules for trigger ${context.trigger} in workspace ${context.entity.workspaceId}`,
    );

    for (const rule of rules) {
      try {
        const shouldExecute = this.evaluateRule(rule, context);
        if (shouldExecute) {
          this.logger.log(`Executing rule: ${rule.name} (${rule.id})`);
          await this.executeActions(rule, context);

          // Обновляем статистику
          await this.ruleRepository.update(rule.id, {
            executionCount: () => 'execution_count + 1',
            lastExecutedAt: new Date(),
          });
        }
      } catch (error) {
        this.logger.error(`Error executing rule ${rule.id}: ${error.message}`, error.stack);
      }
    }
  }

  /**
   * Проверяет, подходит ли правило для текущего контекста
   */
  private evaluateRule(rule: AutomationRule, context: AutomationContext): boolean {
    // Проверяем триггер-специфичные условия
    if (!this.evaluateTriggerConfig(rule, context)) {
      return false;
    }

    // Проверяем общие условия
    if (rule.conditions && rule.conditions.length > 0) {
      return this.evaluateConditions(rule.conditions, context.entity);
    }

    return true;
  }

  /**
   * Проверяет триггер-специфичную конфигурацию
   */
  private evaluateTriggerConfig(rule: AutomationRule, context: AutomationContext): boolean {
    const config = rule.triggerConfig;
    if (!config) return true;

    switch (rule.trigger) {
      case TriggerType.ON_STATUS_CHANGE:
        // Проверяем fromStatus
        if (config.fromStatus) {
          const fromStatuses = Array.isArray(config.fromStatus)
            ? config.fromStatus
            : [config.fromStatus];
          if (!context.previousEntity || !fromStatuses.includes(context.previousEntity.status)) {
            return false;
          }
        }
        // Проверяем toStatus
        if (config.toStatus) {
          const toStatuses = Array.isArray(config.toStatus)
            ? config.toStatus
            : [config.toStatus];
          if (!toStatuses.includes(context.entity.status)) {
            return false;
          }
        }
        return true;

      case TriggerType.ON_FIELD_CHANGE:
        if (config.fieldId && context.changedField !== config.fieldId) {
          return false;
        }
        return true;

      default:
        return true;
    }
  }

  /**
   * Проверяет условия правила
   */
  private evaluateConditions(conditions: RuleCondition[], entity: WorkspaceEntity): boolean {
    return conditions.every(condition => this.evaluateCondition(condition, entity));
  }

  private evaluateCondition(condition: RuleCondition, entity: WorkspaceEntity): boolean {
    const value = this.getFieldValue(entity, condition.field);

    switch (condition.operator) {
      case ConditionOperator.EQUALS:
        return value === condition.value;

      case ConditionOperator.NOT_EQUALS:
        return value !== condition.value;

      case ConditionOperator.CONTAINS:
        return String(value || '').toLowerCase().includes(String(condition.value || '').toLowerCase());

      case ConditionOperator.NOT_CONTAINS:
        return !String(value || '').toLowerCase().includes(String(condition.value || '').toLowerCase());

      case ConditionOperator.IS_EMPTY:
        return value === null || value === undefined || value === '';

      case ConditionOperator.IS_NOT_EMPTY:
        return value !== null && value !== undefined && value !== '';

      case ConditionOperator.GREATER_THAN:
        return Number(value) > Number(condition.value);

      case ConditionOperator.LESS_THAN:
        return Number(value) < Number(condition.value);

      default:
        return false;
    }
  }

  private getFieldValue(entity: WorkspaceEntity, field: string): any {
    // Системные поля
    if (field in entity) {
      return (entity as any)[field];
    }
    // Кастомные поля из data
    if (field.startsWith('data.')) {
      const fieldId = field.replace('data.', '');
      return entity.data?.[fieldId];
    }
    return entity.data?.[field];
  }

  /**
   * Выполняет действия правила
   */
  private async executeActions(rule: AutomationRule, context: AutomationContext): Promise<void> {
    for (const action of rule.actions) {
      try {
        await this.executeAction(action, context);
      } catch (error) {
        this.logger.error(`Error executing action ${action.type}: ${error.message}`);
      }
    }
  }

  private async executeAction(action: RuleAction, context: AutomationContext): Promise<void> {
    const { entity } = context;
    const config = action.config;

    switch (action.type) {
      case ActionType.SET_STATUS:
        if (config.status && entity.status !== config.status) {
          await this.entityRepository.update(entity.id, { status: config.status });
          this.logger.log(`Set status to ${config.status} for entity ${entity.id}`);

          // Эмитим событие
          const updated = await this.entityRepository.findOne({
            where: { id: entity.id },
            relations: ['assignee'],
          });
          if (updated) {
            this.eventsGateway.emitStatusChanged({ id: entity.id, status: config.status, entity: updated });
          }
        }
        break;

      case ActionType.SET_ASSIGNEE:
        let assigneeId: string | null = null;

        if (config.assigneeMode === 'specific') {
          assigneeId = config.assigneeId || null;
        } else if (config.assigneeMode === 'creator') {
          // TODO: нужно хранить creatorId в entity
          assigneeId = null;
        } else if (config.assigneeMode === 'round_robin') {
          // TODO: реализовать round robin
          assigneeId = config.assigneeId || null;
        } else {
          assigneeId = config.assigneeId || null;
        }

        if (entity.assigneeId !== assigneeId) {
          await this.entityRepository.update(entity.id, { assigneeId });
          this.logger.log(`Set assignee to ${assigneeId} for entity ${entity.id}`);

          const updated = await this.entityRepository.findOne({
            where: { id: entity.id },
            relations: ['assignee'],
          });
          if (updated) {
            this.eventsGateway.emitEntityUpdated(updated);
          }
        }
        break;

      case ActionType.SET_PRIORITY:
        if (config.priority && entity.priority !== config.priority) {
          await this.entityRepository.update(entity.id, { priority: config.priority });
          this.logger.log(`Set priority to ${config.priority} for entity ${entity.id}`);
        }
        break;

      case ActionType.SET_FIELD:
        if (config.fieldId) {
          const newData = { ...entity.data, [config.fieldId]: config.fieldValue };
          await this.entityRepository.update(entity.id, { data: newData });
          this.logger.log(`Set field ${config.fieldId} for entity ${entity.id}`);
        }
        break;

      case ActionType.SEND_NOTIFICATION:
        // Отправляем WebSocket уведомление
        if (config.message) {
          const recipients = await this.getRecipients(config, context);
          for (const recipient of recipients) {
            this.eventsGateway.emitToUser(recipient.id, 'notification', {
              text: this.interpolateMessage(config.message, context),
              entityId: entity.id,
              type: 'automation',
            });
          }
          this.logger.log(`Sent notification to ${recipients.length} users`);
        }
        break;

      case ActionType.SEND_EMAIL:
        if (config.message && config.subject) {
          const recipients = await this.getRecipients(config, context);
          for (const recipient of recipients) {
            await this.emailService.send({
              to: recipient.email,
              subject: this.interpolateMessage(config.subject, context),
              html: this.interpolateMessage(config.message, context),
            });
          }
          this.logger.log(`Sent email to ${recipients.length} users`);
        }
        break;
    }
  }

  private async getRecipients(
    config: RuleAction['config'],
    context: AutomationContext,
  ): Promise<User[]> {
    const recipients: User[] = [];

    switch (config.recipientMode) {
      case 'assignee':
        if (context.entity.assigneeId) {
          const assignee = await this.userRepository.findOne({
            where: { id: context.entity.assigneeId },
          });
          if (assignee) recipients.push(assignee);
        }
        break;

      case 'creator':
        // TODO: добавить creatorId в entity
        break;

      case 'specific':
        if (config.recipientId) {
          const user = await this.userRepository.findOne({
            where: { id: config.recipientId },
          });
          if (user) recipients.push(user);
        }
        break;

      case 'all_workspace_members':
        // TODO: получить всех участников workspace
        break;
    }

    return recipients;
  }

  private interpolateMessage(template: string, context: AutomationContext): string {
    const { entity } = context;
    return template
      .replace(/\{title\}/g, entity.title || '')
      .replace(/\{customId\}/g, entity.customId || '')
      .replace(/\{status\}/g, entity.status || '')
      .replace(/\{priority\}/g, entity.priority || '')
      .replace(/\{assignee\}/g, entity.assignee?.firstName || 'Не назначен');
  }
}
