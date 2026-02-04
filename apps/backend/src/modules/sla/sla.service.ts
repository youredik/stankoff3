import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SlaDefinition, SlaTargetType, SlaConditions } from './entities/sla-definition.entity';
import { SlaInstance, SlaStatus } from './entities/sla-instance.entity';
import { SlaEvent, SlaEventType } from './entities/sla-event.entity';
import { SlaCalculatorService } from './sla-calculator.service';
import { CreateSlaDefinitionDto, UpdateSlaDefinitionDto } from './dto/create-sla-definition.dto';
import { EventsGateway } from '../websocket/events.gateway';
import { EmailService } from '../email/email.service';
import { WorkspaceEntity } from '../entity/entity.entity';

export interface SlaStatusInfo {
  instanceId: string;
  definitionName: string;
  responseStatus: SlaStatus;
  resolutionStatus: SlaStatus;
  responseDueAt: Date | null;
  resolutionDueAt: Date | null;
  responseRemainingMinutes: number | null;
  resolutionRemainingMinutes: number | null;
  responseUsedPercent: number | null;
  resolutionUsedPercent: number | null;
  isPaused: boolean;
  currentEscalationLevel: number;
}

@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectRepository(SlaDefinition)
    private definitionRepository: Repository<SlaDefinition>,
    @InjectRepository(SlaInstance)
    private instanceRepository: Repository<SlaInstance>,
    @InjectRepository(SlaEvent)
    private eventRepository: Repository<SlaEvent>,
    @InjectRepository(WorkspaceEntity)
    private entityRepository: Repository<WorkspaceEntity>,
    private calculator: SlaCalculatorService,
    @Inject(forwardRef(() => EventsGateway))
    private eventsGateway: EventsGateway,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
  }

  // ===================== Definition CRUD =====================

  async createDefinition(dto: CreateSlaDefinitionDto, userId: string): Promise<SlaDefinition> {
    const definition = this.definitionRepository.create({
      ...dto,
      createdById: userId,
    });
    return this.definitionRepository.save(definition);
  }

  async findDefinitions(workspaceId: string): Promise<SlaDefinition[]> {
    return this.definitionRepository.find({
      where: { workspaceId },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async findDefinition(id: string): Promise<SlaDefinition> {
    const definition = await this.definitionRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!definition) {
      throw new NotFoundException(`SLA definition ${id} not found`);
    }
    return definition;
  }

  async updateDefinition(id: string, dto: UpdateSlaDefinitionDto): Promise<SlaDefinition> {
    const definition = await this.findDefinition(id);
    Object.assign(definition, dto);
    return this.definitionRepository.save(definition);
  }

  async deleteDefinition(id: string): Promise<void> {
    const definition = await this.findDefinition(id);
    await this.definitionRepository.remove(definition);
  }

  // ===================== Instance Management =====================

  /**
   * Create SLA instance for a target (entity, task, or process)
   */
  async createInstance(
    workspaceId: string,
    targetType: SlaTargetType,
    targetId: string,
    context: Record<string, unknown> = {},
  ): Promise<SlaInstance | null> {
    // Find matching SLA definition
    const definition = await this.findMatchingDefinition(workspaceId, targetType, context);
    if (!definition) {
      return null;
    }

    const now = new Date();

    // Calculate deadlines
    const responseDueAt = definition.responseTime
      ? this.calculator.calculateDeadline(
          now,
          definition.responseTime,
          definition.businessHours,
          definition.businessHoursOnly,
        )
      : null;

    const resolutionDueAt = definition.resolutionTime
      ? this.calculator.calculateDeadline(
          now,
          definition.resolutionTime,
          definition.businessHours,
          definition.businessHoursOnly,
        )
      : null;

    const instance = this.instanceRepository.create({
      slaDefinitionId: definition.id,
      workspaceId,
      targetType,
      targetId,
      responseDueAt,
      resolutionDueAt,
      responseStatus: responseDueAt ? 'pending' : 'met',
      resolutionStatus: resolutionDueAt ? 'pending' : 'met',
    });

    const saved = await this.instanceRepository.save(instance);

    // Log creation event
    await this.logEvent(saved.id, 'created', {
      definitionId: definition.id,
      definitionName: definition.name,
      responseDueAt,
      resolutionDueAt,
    });

    return saved;
  }

  /**
   * Find matching SLA definition based on conditions
   */
  private async findMatchingDefinition(
    workspaceId: string,
    targetType: SlaTargetType,
    context: Record<string, unknown>,
  ): Promise<SlaDefinition | null> {
    const definitions = await this.definitionRepository.find({
      where: {
        workspaceId,
        appliesTo: targetType,
        isActive: true,
      },
      order: { priority: 'DESC' },
    });

    for (const definition of definitions) {
      if (this.matchesConditions(definition.conditions, context)) {
        return definition;
      }
    }

    return null;
  }

  /**
   * Check if context matches SLA conditions
   */
  private matchesConditions(conditions: SlaConditions, context: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      const contextValue = context[key];
      if (contextValue === undefined) {
        return false;
      }

      // Handle array values (OR condition)
      if (Array.isArray(value)) {
        if (!value.includes(contextValue)) {
          return false;
        }
      } else if (contextValue !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Record first response (e.g., first comment)
   */
  async recordResponse(targetType: SlaTargetType, targetId: string): Promise<void> {
    const instance = await this.instanceRepository.findOne({
      where: { targetType, targetId, responseStatus: 'pending' },
      relations: ['slaDefinition'],
    });

    if (!instance) return;

    const now = new Date();
    const status: SlaStatus = now <= instance.responseDueAt! ? 'met' : 'breached';

    await this.instanceRepository.update(instance.id, {
      firstResponseAt: now,
      responseStatus: status,
    });

    await this.logEvent(instance.id, 'response_recorded', {
      responseTime: now,
      status,
      dueAt: instance.responseDueAt,
    });
  }

  /**
   * Record resolution (e.g., status changed to closed)
   */
  async recordResolution(targetType: SlaTargetType, targetId: string): Promise<void> {
    const instance = await this.instanceRepository.findOne({
      where: { targetType, targetId, resolutionStatus: 'pending' },
      relations: ['slaDefinition'],
    });

    if (!instance) return;

    const now = new Date();
    const status: SlaStatus = now <= instance.resolutionDueAt! ? 'met' : 'breached';

    await this.instanceRepository.update(instance.id, {
      resolvedAt: now,
      resolutionStatus: status,
    });

    await this.logEvent(instance.id, 'resolved', {
      resolvedAt: now,
      status,
      dueAt: instance.resolutionDueAt,
    });
  }

  /**
   * Pause SLA (e.g., waiting for customer response)
   */
  async pauseSla(instanceId: string, reason: string): Promise<SlaInstance> {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) {
      throw new NotFoundException(`SLA instance ${instanceId} not found`);
    }

    if (instance.isPaused) {
      return instance;
    }

    await this.instanceRepository.update(instanceId, {
      isPaused: true,
      pausedAt: new Date(),
    });

    await this.logEvent(instanceId, 'paused', { reason });

    return this.instanceRepository.findOne({ where: { id: instanceId } }) as Promise<SlaInstance>;
  }

  /**
   * Resume paused SLA
   */
  async resumeSla(instanceId: string): Promise<SlaInstance> {
    const instance = await this.instanceRepository.findOne({ where: { id: instanceId } });
    if (!instance) {
      throw new NotFoundException(`SLA instance ${instanceId} not found`);
    }

    if (!instance.isPaused) {
      return instance;
    }

    const pausedMinutes = Math.floor((Date.now() - instance.pausedAt!.getTime()) / 60000);

    await this.instanceRepository.update(instanceId, {
      isPaused: false,
      pausedAt: null,
      totalPausedMinutes: instance.totalPausedMinutes + pausedMinutes,
    });

    await this.logEvent(instanceId, 'resumed', { pausedMinutes });

    return this.instanceRepository.findOne({ where: { id: instanceId } }) as Promise<SlaInstance>;
  }

  /**
   * Get SLA status for a target
   */
  async getStatus(targetType: SlaTargetType, targetId: string): Promise<SlaStatusInfo | null> {
    const instance = await this.instanceRepository.findOne({
      where: { targetType, targetId },
      relations: ['slaDefinition'],
      order: { createdAt: 'DESC' },
    });

    if (!instance) return null;

    const now = new Date();
    const definition = instance.slaDefinition;

    let responseRemainingMinutes: number | null = null;
    let responseUsedPercent: number | null = null;
    let resolutionRemainingMinutes: number | null = null;
    let resolutionUsedPercent: number | null = null;

    if (instance.responseDueAt && instance.responseStatus === 'pending') {
      responseRemainingMinutes = this.calculator.calculateRemainingMinutes(
        instance.responseDueAt,
        now,
        definition.businessHours,
        definition.businessHoursOnly,
        instance.totalPausedMinutes,
      );
      responseUsedPercent = this.calculator.calculateUsedPercent(
        instance.createdAt,
        instance.responseDueAt,
        now,
        definition.businessHours,
        definition.businessHoursOnly,
        instance.totalPausedMinutes,
      );
    }

    if (instance.resolutionDueAt && instance.resolutionStatus === 'pending') {
      resolutionRemainingMinutes = this.calculator.calculateRemainingMinutes(
        instance.resolutionDueAt,
        now,
        definition.businessHours,
        definition.businessHoursOnly,
        instance.totalPausedMinutes,
      );
      resolutionUsedPercent = this.calculator.calculateUsedPercent(
        instance.createdAt,
        instance.resolutionDueAt,
        now,
        definition.businessHours,
        definition.businessHoursOnly,
        instance.totalPausedMinutes,
      );
    }

    return {
      instanceId: instance.id,
      definitionName: definition.name,
      responseStatus: instance.responseStatus,
      resolutionStatus: instance.resolutionStatus,
      responseDueAt: instance.responseDueAt,
      resolutionDueAt: instance.resolutionDueAt,
      responseRemainingMinutes,
      resolutionRemainingMinutes,
      responseUsedPercent,
      resolutionUsedPercent,
      isPaused: instance.isPaused,
      currentEscalationLevel: instance.currentEscalationLevel,
    };
  }

  /**
   * Get dashboard statistics
   */
  async getDashboard(workspaceId: string): Promise<{
    total: number;
    pending: number;
    met: number;
    breached: number;
    atRisk: number;
  }> {
    const instances = await this.instanceRepository.find({
      where: { workspaceId },
      relations: ['slaDefinition'],
    });

    const now = new Date();
    let pending = 0;
    let met = 0;
    let breached = 0;
    let atRisk = 0;

    for (const instance of instances) {
      if (instance.resolutionStatus === 'met') {
        met++;
      } else if (instance.resolutionStatus === 'breached') {
        breached++;
      } else {
        pending++;

        // Check if at risk (> warning threshold)
        if (instance.resolutionDueAt) {
          const usedPercent = this.calculator.calculateUsedPercent(
            instance.createdAt,
            instance.resolutionDueAt,
            now,
            instance.slaDefinition.businessHours,
            instance.slaDefinition.businessHoursOnly,
            instance.totalPausedMinutes,
          );
          if (usedPercent >= instance.slaDefinition.warningThreshold) {
            atRisk++;
          }
        }
      }
    }

    return {
      total: instances.length,
      pending,
      met,
      breached,
      atRisk,
    };
  }

  // ===================== Monitoring =====================

  /**
   * Broadcast SLA timer updates - runs every 10 seconds
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async broadcastSlaUpdates(): Promise<void> {
    try {
      const pendingInstances = await this.instanceRepository
        .createQueryBuilder('instance')
        .leftJoinAndSelect('instance.slaDefinition', 'definition')
        .where('instance.resolutionStatus = :status', { status: 'pending' })
        .orWhere('instance.responseStatus = :status', { status: 'pending' })
        .getMany();

      if (pendingInstances.length === 0) return;

      // Group by workspace
      const byWorkspace = new Map<string, SlaInstance[]>();
      for (const instance of pendingInstances) {
        const list = byWorkspace.get(instance.workspaceId) || [];
        list.push(instance);
        byWorkspace.set(instance.workspaceId, list);
      }

      const now = new Date();

      // Broadcast updates per workspace
      for (const [workspaceId, instances] of byWorkspace) {
        const updates = instances.map((instance) => {
          const definition = instance.slaDefinition;

          let responseRemainingMinutes: number | null = null;
          let responseUsedPercent: number | null = null;
          let resolutionRemainingMinutes: number | null = null;
          let resolutionUsedPercent: number | null = null;

          if (instance.responseDueAt && instance.responseStatus === 'pending') {
            responseRemainingMinutes = this.calculator.calculateRemainingMinutes(
              instance.responseDueAt,
              now,
              definition.businessHours,
              definition.businessHoursOnly,
              instance.totalPausedMinutes,
            );
            responseUsedPercent = this.calculator.calculateUsedPercent(
              instance.createdAt,
              instance.responseDueAt,
              now,
              definition.businessHours,
              definition.businessHoursOnly,
              instance.totalPausedMinutes,
            );
          }

          if (instance.resolutionDueAt && instance.resolutionStatus === 'pending') {
            resolutionRemainingMinutes = this.calculator.calculateRemainingMinutes(
              instance.resolutionDueAt,
              now,
              definition.businessHours,
              definition.businessHoursOnly,
              instance.totalPausedMinutes,
            );
            resolutionUsedPercent = this.calculator.calculateUsedPercent(
              instance.createdAt,
              instance.resolutionDueAt,
              now,
              definition.businessHours,
              definition.businessHoursOnly,
              instance.totalPausedMinutes,
            );
          }

          return {
            targetId: instance.targetId,
            targetType: instance.targetType,
            instanceId: instance.id,
            responseRemainingMinutes,
            resolutionRemainingMinutes,
            responseUsedPercent,
            resolutionUsedPercent,
            isPaused: instance.isPaused,
          };
        });

        this.eventsGateway.emitSlaBatchUpdate(workspaceId, updates);
      }
    } catch (error) {
      this.logger.error(`Failed to broadcast SLA updates: ${error.message}`);
    }
  }

  /**
   * Check SLA violations - runs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkViolations(): Promise<void> {
    const pendingInstances = await this.instanceRepository
      .createQueryBuilder('instance')
      .leftJoinAndSelect('instance.slaDefinition', 'definition')
      .where('instance.resolutionStatus = :status', { status: 'pending' })
      .orWhere('instance.responseStatus = :status', { status: 'pending' })
      .andWhere('instance.isPaused = :paused', { paused: false })
      .getMany();

    const now = new Date();

    for (const instance of pendingInstances) {
      await this.checkInstance(instance, now);
    }
  }

  private async checkInstance(instance: SlaInstance, now: Date): Promise<void> {
    const definition = instance.slaDefinition;
    const warningThreshold = definition.warningThreshold || 80;

    // Check Response SLA
    if (instance.responseStatus === 'pending' && instance.responseDueAt) {
      const remainingMinutes = this.calculator.calculateRemainingMinutes(
        instance.responseDueAt,
        now,
        definition.businessHours,
        definition.businessHoursOnly,
        instance.totalPausedMinutes,
      );

      if (remainingMinutes <= 0) {
        await this.handleBreach(instance, 'response');
      } else {
        const usedPercent = this.calculator.calculateUsedPercent(
          instance.createdAt,
          instance.responseDueAt,
          now,
          definition.businessHours,
          definition.businessHoursOnly,
          instance.totalPausedMinutes,
        );
        if (usedPercent >= warningThreshold) {
          await this.handleWarning(instance, 'response', usedPercent);
        }
      }
    }

    // Check Resolution SLA
    if (instance.resolutionStatus === 'pending' && instance.resolutionDueAt) {
      const remainingMinutes = this.calculator.calculateRemainingMinutes(
        instance.resolutionDueAt,
        now,
        definition.businessHours,
        definition.businessHoursOnly,
        instance.totalPausedMinutes,
      );

      if (remainingMinutes <= 0) {
        await this.handleBreach(instance, 'resolution');
      } else {
        const usedPercent = this.calculator.calculateUsedPercent(
          instance.createdAt,
          instance.resolutionDueAt,
          now,
          definition.businessHours,
          definition.businessHoursOnly,
          instance.totalPausedMinutes,
        );
        if (usedPercent >= warningThreshold) {
          await this.handleWarning(instance, 'resolution', usedPercent);
        }
      }
    }
  }

  private async handleWarning(
    instance: SlaInstance,
    type: 'response' | 'resolution',
    usedPercent: number,
  ): Promise<void> {
    const rules = instance.slaDefinition.escalationRules || [];
    const applicableRule = rules.find(
      (r) => r.threshold <= usedPercent && r.threshold > instance.currentEscalationLevel,
    );

    if (!applicableRule) return;

    await this.instanceRepository.update(instance.id, {
      currentEscalationLevel: applicableRule.threshold,
      lastEscalationAt: new Date(),
    });

    await this.logEvent(instance.id, 'warning_sent', {
      type,
      usedPercent,
      rule: applicableRule,
    });

    const definition = instance.slaDefinition;
    const dueAt = type === 'response' ? instance.responseDueAt : instance.resolutionDueAt;
    const remainingMinutes = this.calculator.calculateRemainingMinutes(
      dueAt!,
      new Date(),
      definition.businessHours,
      definition.businessHoursOnly,
      instance.totalPausedMinutes,
    );

    // Отправляем WebSocket уведомление о приближении дедлайна
    this.eventsGateway.emitToWorkspace(instance.workspaceId, 'sla:warning', {
      instanceId: instance.id,
      targetType: instance.targetType,
      targetId: instance.targetId,
      type,
      usedPercent,
      remainingMinutes,
      threshold: applicableRule.threshold,
      definitionName: definition.name,
      dueAt,
    });

    // Отправляем email уведомление (для entity)
    if (instance.targetType === 'entity') {
      await this.sendSlaWarningEmail(instance, type, remainingMinutes, usedPercent);
    }

    this.logger.warn(
      `SLA warning: ${instance.id} at ${usedPercent.toFixed(1)}% (${type})`,
    );
  }

  private async handleBreach(
    instance: SlaInstance,
    type: 'response' | 'resolution',
  ): Promise<void> {
    const updateData =
      type === 'response'
        ? { responseStatus: 'breached' as SlaStatus }
        : { resolutionStatus: 'breached' as SlaStatus };

    await this.instanceRepository.update(instance.id, updateData);
    await this.logEvent(instance.id, 'breached', { type });

    // Отправляем WebSocket уведомление о нарушении SLA
    this.eventsGateway.emitToWorkspace(instance.workspaceId, 'sla:breached', {
      instanceId: instance.id,
      targetType: instance.targetType,
      targetId: instance.targetId,
      type,
      definitionName: instance.slaDefinition.name,
      dueAt: type === 'response' ? instance.responseDueAt : instance.resolutionDueAt,
    });

    // Отправляем email уведомление (для entity)
    if (instance.targetType === 'entity') {
      await this.sendSlaBreachEmail(instance, type);
    }

    this.logger.error(`SLA breached: ${instance.id} (${type})`);
  }

  private async logEvent(
    instanceId: string,
    eventType: SlaEventType,
    eventData: Record<string, unknown>,
  ): Promise<void> {
    const event = this.eventRepository.create({
      slaInstanceId: instanceId,
      eventType,
      eventData,
    });
    await this.eventRepository.save(event);
  }

  /**
   * Отправляет email уведомление о приближении SLA дедлайна
   */
  private async sendSlaWarningEmail(
    instance: SlaInstance,
    type: 'response' | 'resolution',
    remainingMinutes: number,
    usedPercent: number,
  ): Promise<void> {
    try {
      const entity = await this.entityRepository.findOne({
        where: { id: instance.targetId },
        relations: ['assignee'],
      });

      if (!entity || !entity.assignee) {
        return;
      }

      await this.emailService.sendSlaWarningNotification(
        entity.assignee,
        entity,
        instance.slaDefinition.name,
        type,
        remainingMinutes,
        usedPercent,
        this.frontendUrl,
      );
    } catch (error) {
      this.logger.error(`Failed to send SLA warning email: ${error.message}`);
    }
  }

  /**
   * Отправляет email уведомление о нарушении SLA
   */
  private async sendSlaBreachEmail(
    instance: SlaInstance,
    type: 'response' | 'resolution',
  ): Promise<void> {
    try {
      const entity = await this.entityRepository.findOne({
        where: { id: instance.targetId },
        relations: ['assignee'],
      });

      if (!entity || !entity.assignee) {
        return;
      }

      await this.emailService.sendSlaBreachNotification(
        entity.assignee,
        entity,
        instance.slaDefinition.name,
        type,
        this.frontendUrl,
      );
    } catch (error) {
      this.logger.error(`Failed to send SLA breach email: ${error.message}`);
    }
  }
}
