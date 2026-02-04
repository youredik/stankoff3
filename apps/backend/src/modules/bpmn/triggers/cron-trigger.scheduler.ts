import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import {
  ProcessTrigger,
  TriggerType,
  TriggerExecution,
  TriggerExecutionStatus,
} from '../entities/process-trigger.entity';
import { BpmnService } from '../bpmn.service';

@Injectable()
export class CronTriggerScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronTriggerScheduler.name);
  private readonly registeredJobs = new Map<string, CronJob>();

  constructor(
    @InjectRepository(ProcessTrigger)
    private triggerRepository: Repository<ProcessTrigger>,
    @InjectRepository(TriggerExecution)
    private executionRepository: Repository<TriggerExecution>,
    private schedulerRegistry: SchedulerRegistry,
    private bpmnService: BpmnService,
  ) {}

  async onModuleInit() {
    // Load and register all active cron triggers on startup
    await this.loadCronTriggers();
  }

  onModuleDestroy() {
    // Clean up all registered jobs
    for (const [triggerId, job] of this.registeredJobs) {
      try {
        job.stop();
        this.schedulerRegistry.deleteCronJob(`bpmn-cron-${triggerId}`);
      } catch {
        // Job might not exist in registry
      }
    }
    this.registeredJobs.clear();
  }

  /**
   * Load all active cron triggers and register them
   */
  async loadCronTriggers(): Promise<void> {
    try {
      const cronTriggers = await this.triggerRepository.find({
        where: {
          triggerType: TriggerType.CRON,
          isActive: true,
        },
        relations: ['processDefinition'],
      });

      this.logger.log(`Loading ${cronTriggers.length} cron triggers`);

      for (const trigger of cronTriggers) {
        this.registerCronJob(trigger);
      }
    } catch (error) {
      this.logger.error(`Failed to load cron triggers: ${error.message}`);
    }
  }

  /**
   * Register a cron job for a trigger
   */
  registerCronJob(trigger: ProcessTrigger): void {
    const cronExpression = trigger.conditions?.expression;
    if (!cronExpression) {
      this.logger.warn(`Trigger ${trigger.id} has no cron expression`);
      return;
    }

    const jobName = `bpmn-cron-${trigger.id}`;

    // Remove existing job if any
    this.unregisterCronJob(trigger.id);

    try {
      const job = new CronJob(
        cronExpression,
        () => this.executeCronTrigger(trigger),
        null,
        false, // Don't start immediately
        trigger.conditions?.timezone || 'Europe/Moscow',
      );

      this.schedulerRegistry.addCronJob(jobName, job);
      job.start();
      this.registeredJobs.set(trigger.id, job);

      this.logger.log(
        `Registered cron job for trigger ${trigger.id}: ${cronExpression}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to register cron job for trigger ${trigger.id}: ${error.message}`,
      );
    }
  }

  /**
   * Unregister a cron job for a trigger
   */
  unregisterCronJob(triggerId: string): void {
    const jobName = `bpmn-cron-${triggerId}`;

    const existingJob = this.registeredJobs.get(triggerId);
    if (existingJob) {
      existingJob.stop();
      this.registeredJobs.delete(triggerId);
    }

    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch {
      // Job might not exist
    }
  }

  /**
   * Execute a cron trigger - start the associated process
   */
  private async executeCronTrigger(trigger: ProcessTrigger): Promise<void> {
    this.logger.log(
      `Executing cron trigger ${trigger.id} (${trigger.name || 'unnamed'})`,
    );

    const execution = this.executionRepository.create({
      triggerId: trigger.id,
      triggerContext: {
        triggerType: 'cron',
        expression: trigger.conditions?.expression,
        executedAt: new Date().toISOString(),
      },
      status: TriggerExecutionStatus.PENDING,
    });

    try {
      // Reload trigger to get fresh process definition data
      const freshTrigger = await this.triggerRepository.findOne({
        where: { id: trigger.id },
        relations: ['processDefinition'],
      });

      if (!freshTrigger || !freshTrigger.isActive) {
        this.logger.warn(`Trigger ${trigger.id} is no longer active, skipping`);
        this.unregisterCronJob(trigger.id);
        return;
      }

      if (!freshTrigger.processDefinition?.deployedKey) {
        throw new Error(
          `Process definition ${freshTrigger.processDefinitionId} is not deployed`,
        );
      }

      // Prepare variables for the process
      const variables = {
        ...freshTrigger.variableMappings,
        workspaceId: freshTrigger.workspaceId,
        triggeredBy: 'cron-scheduler',
        triggerType: 'cron',
        expression: trigger.conditions?.expression,
        scheduledTime: new Date().toISOString(),
      };

      // Start the process
      const instance = await this.bpmnService.startProcess(
        freshTrigger.processDefinitionId,
        variables,
        {
          businessKey: `cron-${trigger.id}-${Date.now()}`,
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
        `Cron trigger ${trigger.id} executed successfully, started process instance ${instance.id}`,
      );
    } catch (error) {
      execution.status = TriggerExecutionStatus.FAILED;
      execution.errorMessage = error.message;

      this.logger.error(
        `Failed to execute cron trigger ${trigger.id}: ${error.message}`,
        error.stack,
      );
    }

    await this.executionRepository.save(execution);
  }

  /**
   * Refresh cron triggers - called periodically to pick up changes
   * Also handles triggers that may have been created/modified/deleted
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshCronTriggers(): Promise<void> {
    this.logger.debug('Refreshing cron triggers...');

    try {
      const activeTriggers = await this.triggerRepository.find({
        where: {
          triggerType: TriggerType.CRON,
          isActive: true,
        },
        relations: ['processDefinition'],
      });

      const activeIds = new Set(activeTriggers.map((t) => t.id));

      // Remove jobs for deactivated/deleted triggers
      for (const triggerId of this.registeredJobs.keys()) {
        if (!activeIds.has(triggerId)) {
          this.logger.log(`Removing deactivated cron trigger ${triggerId}`);
          this.unregisterCronJob(triggerId);
        }
      }

      // Add/update jobs for active triggers
      for (const trigger of activeTriggers) {
        if (!this.registeredJobs.has(trigger.id)) {
          this.logger.log(`Adding new cron trigger ${trigger.id}`);
          this.registerCronJob(trigger);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to refresh cron triggers: ${error.message}`);
    }
  }

  /**
   * Called when a trigger is created/updated/deleted
   * to update the scheduler immediately
   */
  async onTriggerChanged(trigger: ProcessTrigger, deleted = false): Promise<void> {
    if (trigger.triggerType !== TriggerType.CRON) {
      return;
    }

    if (deleted || !trigger.isActive) {
      this.unregisterCronJob(trigger.id);
    } else {
      this.registerCronJob(trigger);
    }
  }

  /**
   * Get status of all registered cron jobs
   */
  getCronJobsStatus(): {
    triggerId: string;
    active: boolean;
    nextRun: Date | null;
  }[] {
    const result: { triggerId: string; active: boolean; nextRun: Date | null }[] = [];

    for (const [triggerId, job] of this.registeredJobs) {
      result.push({
        triggerId,
        active: this.registeredJobs.has(triggerId),
        nextRun: job.nextDate()?.toJSDate() || null,
      });
    }

    return result;
  }
}
