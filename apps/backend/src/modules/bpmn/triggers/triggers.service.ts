import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProcessTrigger,
  TriggerType,
  TriggerConditions,
  TriggerExecution,
  TriggerExecutionStatus,
} from '../entities/process-trigger.entity';
import { BpmnService } from '../bpmn.service';
import { CreateTriggerDto, UpdateTriggerDto } from './dto/trigger.dto';
import { CronTriggerScheduler } from './cron-trigger.scheduler';

@Injectable()
export class TriggersService {
  private readonly logger = new Logger(TriggersService.name);

  constructor(
    @InjectRepository(ProcessTrigger)
    private triggerRepository: Repository<ProcessTrigger>,
    @InjectRepository(TriggerExecution)
    private executionRepository: Repository<TriggerExecution>,
    @Inject(forwardRef(() => BpmnService))
    private bpmnService: BpmnService,
    @Optional()
    @Inject(forwardRef(() => CronTriggerScheduler))
    private cronScheduler: CronTriggerScheduler,
  ) {}

  // ==================== CRUD Operations ====================

  async create(dto: CreateTriggerDto, userId: string): Promise<ProcessTrigger> {
    // Validate that process definition exists
    await this.bpmnService.findDefinition(dto.processDefinitionId);

    const trigger = this.triggerRepository.create({
      ...dto,
      createdById: userId,
    });

    const saved = await this.triggerRepository.save(trigger);
    this.logger.log(`Created trigger ${saved.id} for process ${dto.processDefinitionId}`);

    // Notify cron scheduler if it's a cron trigger
    if (this.cronScheduler) {
      await this.cronScheduler.onTriggerChanged(saved);
    }

    return saved;
  }

  async findByWorkspace(workspaceId: string): Promise<ProcessTrigger[]> {
    return this.triggerRepository.find({
      where: { workspaceId },
      relations: ['processDefinition', 'createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByDefinition(processDefinitionId: string): Promise<ProcessTrigger[]> {
    return this.triggerRepository.find({
      where: { processDefinitionId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ProcessTrigger> {
    const trigger = await this.triggerRepository.findOne({
      where: { id },
      relations: ['processDefinition', 'createdBy'],
    });

    if (!trigger) {
      throw new NotFoundException(`Trigger ${id} not found`);
    }

    return trigger;
  }

  async update(id: string, dto: UpdateTriggerDto): Promise<ProcessTrigger> {
    const trigger = await this.findOne(id);

    Object.assign(trigger, dto);
    trigger.updatedAt = new Date();

    const saved = await this.triggerRepository.save(trigger);

    // Notify cron scheduler if it's a cron trigger
    if (this.cronScheduler) {
      await this.cronScheduler.onTriggerChanged(saved);
    }

    return saved;
  }

  async delete(id: string): Promise<void> {
    const trigger = await this.findOne(id);

    // Notify cron scheduler before deletion
    if (this.cronScheduler) {
      await this.cronScheduler.onTriggerChanged(trigger, true);
    }

    await this.triggerRepository.remove(trigger);
    this.logger.log(`Deleted trigger ${id}`);
  }

  async toggle(id: string): Promise<ProcessTrigger> {
    const trigger = await this.findOne(id);
    trigger.isActive = !trigger.isActive;
    trigger.updatedAt = new Date();

    const saved = await this.triggerRepository.save(trigger);
    this.logger.log(`Trigger ${id} is now ${saved.isActive ? 'active' : 'inactive'}`);

    // Notify cron scheduler
    if (this.cronScheduler) {
      await this.cronScheduler.onTriggerChanged(saved);
    }

    return saved;
  }

  // ==================== Trigger Evaluation ====================

  async evaluateTriggers(
    triggerType: TriggerType,
    context: Record<string, any>,
    workspaceId: string,
  ): Promise<void> {
    const triggers = await this.triggerRepository.find({
      where: {
        workspaceId,
        triggerType,
        isActive: true,
      },
      relations: ['processDefinition'],
    });

    this.logger.debug(
      `Evaluating ${triggers.length} triggers of type ${triggerType} for workspace ${workspaceId}`,
    );

    for (const trigger of triggers) {
      try {
        const shouldFire = this.evaluateConditions(trigger.conditions, context);

        if (shouldFire) {
          await this.fireTrigger(trigger, context);
        }
      } catch (error) {
        this.logger.error(
          `Error evaluating trigger ${trigger.id}: ${error.message}`,
          error.stack,
        );
      }
    }
  }

  /**
   * Evaluate if trigger conditions match the context
   */
  private evaluateConditions(
    conditions: TriggerConditions,
    context: Record<string, any>,
  ): boolean {
    // Empty conditions = always match
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }

    // Check fromStatus (for status_changed)
    if (conditions.fromStatus !== undefined) {
      if (context.oldStatus !== conditions.fromStatus) {
        return false;
      }
    }

    // Check toStatus (for status_changed)
    if (conditions.toStatus !== undefined) {
      if (context.newStatus !== conditions.toStatus) {
        return false;
      }
    }

    // Check priority filter
    if (conditions.priority !== undefined) {
      if (context.priority !== conditions.priority) {
        return false;
      }
    }

    // Check category filter
    if (conditions.category !== undefined) {
      if (context.category !== conditions.category) {
        return false;
      }
    }

    // Check entity types (for entity_created)
    if (conditions.entityTypes && conditions.entityTypes.length > 0) {
      if (!conditions.entityTypes.includes(context.entityType)) {
        return false;
      }
    }

    // Check onlyWhenAssigned (for assignee_changed)
    if (conditions.onlyWhenAssigned) {
      if (!context.newAssigneeId) {
        return false;
      }
    }

    // Custom expression evaluation (simple JSONPath-like)
    if (conditions.customExpression) {
      try {
        return this.evaluateExpression(conditions.customExpression, context);
      } catch {
        this.logger.warn(`Failed to evaluate custom expression: ${conditions.customExpression}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Fire a trigger - start the associated process
   */
  private async fireTrigger(
    trigger: ProcessTrigger,
    context: Record<string, any>,
  ): Promise<void> {
    this.logger.log(`Firing trigger ${trigger.id} (${trigger.name || trigger.triggerType})`);

    const execution = this.executionRepository.create({
      triggerId: trigger.id,
      triggerContext: context,
      status: TriggerExecutionStatus.SUCCESS,
    });

    try {
      // Check if process definition is deployed
      if (!trigger.processDefinition?.deployedKey) {
        throw new BadRequestException(
          `Process definition ${trigger.processDefinitionId} is not deployed`,
        );
      }

      // Map variables from context
      const variables = this.mapVariables(trigger.variableMappings, context);

      // Start the process
      const instance = await this.bpmnService.startProcess(
        trigger.processDefinitionId,
        variables,
        {
          entityId: context.entityId,
          startedById: context.userId || context.createdById,
        },
      );

      execution.processInstanceId = instance.id;
      execution.status = TriggerExecutionStatus.SUCCESS;

      // Update trigger stats
      await this.triggerRepository.update(trigger.id, {
        lastTriggeredAt: new Date(),
        triggerCount: () => '"triggerCount" + 1',
      });

      this.logger.log(
        `Trigger ${trigger.id} fired successfully, started process instance ${instance.id}`,
      );
    } catch (error) {
      execution.status = TriggerExecutionStatus.FAILED;
      execution.errorMessage = error.message;

      this.logger.error(
        `Failed to fire trigger ${trigger.id}: ${error.message}`,
        error.stack,
      );
    }

    await this.executionRepository.save(execution);
  }

  /**
   * Map variables from context using variable mappings
   */
  private mapVariables(
    mappings: Record<string, string>,
    context: Record<string, any>,
  ): Record<string, any> {
    const result: Record<string, any> = {};

    if (!mappings || Object.keys(mappings).length === 0) {
      // Default mappings if none specified
      return {
        entityId: context.entityId,
        workspaceId: context.workspaceId,
        triggeredBy: context.userId || context.createdById,
        triggerType: context.triggerType,
      };
    }

    for (const [variableName, path] of Object.entries(mappings)) {
      const value = this.resolvePath(path, context);
      if (value !== undefined) {
        result[variableName] = value;
      }
    }

    return result;
  }

  /**
   * Resolve a JSONPath-like expression
   * Supports: $.entity.id, $.priority, literal values
   */
  private resolvePath(path: string, context: Record<string, any>): any {
    if (!path) return undefined;

    // Literal value (not a path)
    if (!path.startsWith('$.')) {
      return path;
    }

    // Remove $. prefix and split
    const parts = path.slice(2).split('.');
    let current: any = context;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Simple expression evaluation
   * Supports: field == value, field != value, field > value
   */
  private evaluateExpression(
    expression: string,
    context: Record<string, any>,
  ): boolean {
    // Parse expression: "$.priority == 'high'" or "$.amount > 1000"
    const operators = ['==', '!=', '>=', '<=', '>', '<'];

    for (const op of operators) {
      if (expression.includes(op)) {
        const [leftRaw, rightRaw] = expression.split(op).map((s) => s.trim());
        const left = this.resolvePath(leftRaw, context);
        const right = rightRaw.replace(/['"]/g, ''); // Remove quotes

        switch (op) {
          case '==':
            return String(left) === right;
          case '!=':
            return String(left) !== right;
          case '>':
            return Number(left) > Number(right);
          case '>=':
            return Number(left) >= Number(right);
          case '<':
            return Number(left) < Number(right);
          case '<=':
            return Number(left) <= Number(right);
        }
      }
    }

    return false;
  }

  // ==================== Executions ====================

  async getExecutions(triggerId: string, limit = 50): Promise<TriggerExecution[]> {
    return this.executionRepository.find({
      where: { triggerId },
      order: { executedAt: 'DESC' },
      take: limit,
    });
  }

  async getRecentExecutions(workspaceId: string, limit = 100): Promise<TriggerExecution[]> {
    return this.executionRepository
      .createQueryBuilder('execution')
      .innerJoin('execution.trigger', 'trigger')
      .where('trigger.workspaceId = :workspaceId', { workspaceId })
      .orderBy('execution.executedAt', 'DESC')
      .take(limit)
      .getMany();
  }
}
