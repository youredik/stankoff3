import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { Camunda8 } from '@camunda8/sdk';
import { EntityService } from '../entity/entity.service';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EventsGateway } from '../websocket/events.gateway';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { BpmnService } from './bpmn.service';
import { ProcessInstanceStatus, ProcessInstance } from './entities/process-instance.entity';
import { ProcessActivityLog } from './entities/process-activity-log.entity';
import { UserTasksWorker } from './user-tasks/user-tasks.worker';
import { CreateEntityWorker } from './entity-links/create-entity.worker';
import { IncidentService } from './incidents/incident.service';
import { AiAssistantService } from '../ai/services/ai-assistant.service';

@Injectable()
export class BpmnWorkersService implements OnModuleInit {
  private readonly logger = new Logger(BpmnWorkersService.name);
  private zeebeClient: ReturnType<Camunda8['getZeebeGrpcApiClient']> | null =
    null;

  // Cache: processInstanceKey → { processInstanceId, processDefinitionId }
  private instanceCache = new Map<string, { instanceId: string; definitionId: string }>();

  // Lazy-loaded services to avoid circular dependencies
  private entityService?: EntityService;
  private emailService?: EmailService;
  private auditLogService?: AuditLogService;
  private eventsGateway?: EventsGateway;
  private aiClassifierService?: any;
  private aiAssistantService?: any;
  private incidentService?: IncidentService;
  private userTasksWorker?: UserTasksWorker;
  private createEntityWorker?: CreateEntityWorker;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(forwardRef(() => BpmnService))
    private readonly bpmnService: BpmnService,
    @InjectRepository(ProcessActivityLog)
    private readonly activityLogRepository: Repository<ProcessActivityLog>,
    @InjectRepository(ProcessInstance)
    private readonly processInstanceRepository: Repository<ProcessInstance>,
  ) {}

  async onModuleInit() {
    // Lazy load services to avoid circular dependencies
    try {
      this.entityService = this.moduleRef.get(EntityService, { strict: false });
    } catch {
      this.logger.warn('EntityService not available for workers');
    }

    try {
      this.emailService = this.moduleRef.get(EmailService, { strict: false });
    } catch {
      this.logger.warn('EmailService not available for workers');
    }

    try {
      this.auditLogService = this.moduleRef.get(AuditLogService, {
        strict: false,
      });
    } catch {
      this.logger.warn('AuditLogService not available for workers');
    }

    try {
      this.eventsGateway = this.moduleRef.get(EventsGateway, { strict: false });
    } catch {
      this.logger.warn('EventsGateway not available for workers');
    }

    try {
      // Dynamically resolve AI classifier (may not be available)
      this.aiClassifierService = this.moduleRef.get('AiClassifierService', {
        strict: false,
      });
    } catch {
      this.logger.warn('AiClassifierService not available for workers');
    }

    try {
      this.aiAssistantService = this.moduleRef.get('AiAssistantService', { strict: false });
    } catch {
      this.logger.warn('AiAssistantService not available for workers');
    }

    try {
      this.incidentService = this.moduleRef.get(IncidentService, { strict: false });
    } catch {
      this.logger.warn('IncidentService not available for workers');
    }

    try {
      this.userTasksWorker = this.moduleRef.get(UserTasksWorker, { strict: false });
    } catch {
      this.logger.warn('UserTasksWorker not available for workers');
    }

    try {
      this.createEntityWorker = this.moduleRef.get(CreateEntityWorker, { strict: false });
    } catch {
      this.logger.warn('CreateEntityWorker not available for workers');
    }
  }

  /**
   * Log element execution for per-element heat map statistics.
   * Silently catches errors — logging must never break the main worker flow.
   */
  async logElementExecution(
    job: { processInstanceKey: string | number; elementId?: string; type?: string },
    status: 'success' | 'failed',
    startTime: number,
  ): Promise<void> {
    try {
      const processInstanceKey = String(job.processInstanceKey);
      const elementId = (job as any).elementId;
      if (!elementId) return;

      // Resolve processInstanceId and processDefinitionId (with cache)
      let cached = this.instanceCache.get(processInstanceKey);
      if (!cached) {
        const instance = await this.processInstanceRepository.findOne({
          where: { processInstanceKey },
          select: ['id', 'processDefinitionId'],
        });
        if (!instance) return;
        cached = { instanceId: instance.id, definitionId: instance.processDefinitionId };
        this.instanceCache.set(processInstanceKey, cached);
        // Keep cache bounded
        if (this.instanceCache.size > 1000) {
          const firstKey = this.instanceCache.keys().next().value;
          if (firstKey) this.instanceCache.delete(firstKey);
        }
      }

      const now = new Date();
      const durationMs = Math.round(now.getTime() - startTime);

      await this.activityLogRepository.save({
        processInstanceId: cached.instanceId,
        processDefinitionId: cached.definitionId,
        elementId,
        elementType: 'serviceTask',
        status,
        startedAt: new Date(startTime),
        completedAt: now,
        durationMs,
        workerType: job.type || null,
      });
    } catch (error) {
      this.logger.warn(`Failed to log element execution: ${error.message}`);
    }
  }

  /**
   * Fail a job and mark as incident when retries exhausted
   */
  private async failJobWithIncidentCheck(
    job: any,
    errorMessage: string,
  ) {
    const newRetries = job.retries - 1;
    if (newRetries <= 0 && this.incidentService) {
      try {
        await this.incidentService.markAsIncident(
          String(job.processInstanceKey),
          errorMessage,
        );
      } catch (e) {
        this.logger.warn(`Failed to mark incident: ${e.message}`);
      }
    }
    return job.fail({ errorMessage, retries: newRetries });
  }

  /**
   * Called by BpmnService after Zeebe connection is established
   */
  setZeebeClient(client: ReturnType<Camunda8['getZeebeGrpcApiClient']>) {
    this.zeebeClient = client;
    this.registerWorkers();
  }

  private registerWorkers() {
    if (!this.zeebeClient) {
      this.logger.warn('Zeebe client not available, skipping worker registration');
      return;
    }

    this.registerUpdateStatusWorker();
    this.registerSendNotificationWorker();
    this.registerSendEmailWorker();
    this.registerLogActivityWorker();
    this.registerSetAssigneeWorker();
    this.registerProcessCompletedWorker();
    this.registerClassifyEntityWorker();
    this.registerUserTasksWorker();
    this.registerCreateEntityWorker();
    this.registerSuggestAssigneeWorker();
    this.registerCheckDuplicateWorker();

    this.logger.log(
      'BPMN workers registered: update-entity-status, send-notification, send-email, log-activity, set-assignee, process-completed, classify-entity, io.camunda.zeebe:userTask, create-entity, suggest-assignee, check-duplicate',
    );
  }

  /**
   * Worker: Update entity status
   * Variables: { entityId: string, newStatus: string }
   */
  private registerUpdateStatusWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'update-entity-status',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const { entityId, newStatus } = job.variables as {
          entityId: string;
          newStatus: string;
        };

        this.logger.log(
          `[Worker] update-entity-status: entity=${entityId}, status=${newStatus}`,
        );

        try {
          if (this.entityService && entityId && newStatus) {
            await this.entityService.updateStatus(entityId, newStatus);
            this.logger.log(`Entity ${entityId} status updated to ${newStatus}`);
          }
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({
            statusUpdated: true,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to update entity status: ${error.message}`,
            error.stack,
          );
          return this.failJobWithIncidentCheck(job, error.message);
        }
      },
    });
  }

  /**
   * Worker: Send in-app notification
   * Variables: { userId: string, message: string, entityId?: string, workspaceId?: string }
   */
  private registerSendNotificationWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'send-notification',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const { userId, message, entityId, workspaceId } = job.variables as {
          userId: string;
          message: string;
          entityId?: string;
          workspaceId?: string;
        };

        this.logger.log(
          `[Worker] send-notification: user=${userId}, entity=${entityId}`,
        );

        try {
          if (this.eventsGateway && userId && message) {
            this.eventsGateway.emitEntityUpdated({
              id: entityId,
              workspaceId,
              notification: { userId, message },
            } as any);
          }
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({ notificationSent: true });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to send notification: ${error.message}`,
            error.stack,
          );
          return job.complete({ notificationSent: false, error: error.message });
        }
      },
    });
  }

  /**
   * Worker: Send email
   * Variables: { to: string, subject: string, body: string, entityId?: string }
   */
  private registerSendEmailWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'send-email',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const { to, subject, body, entityId: _entityId } = job.variables as {
          to: string;
          subject: string;
          body: string;
          entityId?: string;
        };

        this.logger.log(`[Worker] send-email: to=${to}, subject=${subject}`);

        try {
          if (this.emailService && to && subject) {
            const sent = await this.emailService.send({
              to,
              subject,
              text: body,
              html: body,
            });
            await this.logElementExecution(job, 'success', startTime);
            return job.complete({ emailSent: sent });
          }
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({ emailSent: false, reason: 'EmailService not available' });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(`Failed to send email: ${error.message}`, error.stack);
          return job.complete({ emailSent: false, error: error.message });
        }
      },
    });
  }

  /**
   * Worker: Log activity to audit log
   * Variables: { entityId: string, workspaceId: string, action: string, details?: object, actorId?: string }
   */
  private registerLogActivityWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'log-activity',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const { entityId, workspaceId, action, details, actorId } =
          job.variables as {
            entityId: string;
            workspaceId: string;
            action: string;
            details?: Record<string, any>;
            actorId?: string;
          };

        this.logger.log(
          `[Worker] log-activity: entity=${entityId}, action=${action}`,
        );

        try {
          if (this.auditLogService && workspaceId && action) {
            await this.auditLogService.log(
              (action as AuditActionType) || AuditActionType.ENTITY_UPDATED,
              workspaceId,
              actorId || null,
              {
                description: details?.description || `BPMN: ${action}`,
                oldValues: details?.oldValues,
                newValues: details?.newValues,
                changedFields: details?.changedFields,
              },
              entityId || null,
            );
          }
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({ logged: true });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to log activity: ${error.message}`,
            error.stack,
          );
          return job.complete({ logged: false, error: error.message });
        }
      },
    });
  }

  /**
   * Worker: Set entity assignee
   * Variables: { entityId: string, assigneeId: string | null }
   */
  private registerSetAssigneeWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'set-assignee',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const { entityId, assigneeId } = job.variables as {
          entityId: string;
          assigneeId: string | null;
        };

        this.logger.log(
          `[Worker] set-assignee: entity=${entityId}, assignee=${assigneeId}`,
        );

        try {
          if (this.entityService && entityId) {
            await this.entityService.updateAssignee(entityId, assigneeId || null);
            this.logger.log(`Entity ${entityId} assignee set to ${assigneeId}`);
          }
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({
            assigneeSet: true,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to set assignee: ${error.message}`,
            error.stack,
          );
          return this.failJobWithIncidentCheck(job, error.message);
        }
      },
    });
  }

  /**
   * Worker: Classify entity using AI
   * Calls AiClassifierService to auto-classify entity (category, priority, skills)
   * Variables: { entityId: string }
   */
  private registerClassifyEntityWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'classify-entity',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const { entityId } = job.variables as { entityId: string };

        this.logger.log(`[Worker] classify-entity: entity=${entityId}`);

        try {
          if (this.aiClassifierService && entityId) {
            const classification =
              await this.aiClassifierService.classifyAndSave(entityId);
            this.logger.log(
              `Entity ${entityId} classified: category=${classification?.category}, priority=${classification?.priority}`,
            );
            await this.logElementExecution(job, 'success', startTime);
            return job.complete({
              classified: true,
              category: classification?.category || 'other',
              aiPriority: classification?.priority || 'medium',
              confidence: classification?.confidence || 0,
            });
          }
          this.logger.warn(
            'AiClassifierService not available, skipping classification',
          );
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({
            classified: false,
            reason: 'AI service not available',
          });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to classify entity: ${error.message}`,
            error.stack,
          );
          return job.complete({
            classified: false,
            error: error.message,
          });
        }
      },
    });
  }

  /**
   * Worker: Handle user tasks from Zeebe
   * Creates UserTask records in DB; does NOT complete the job —
   * the job stays active until the user completes the task via the API.
   */
  private registerUserTasksWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'io.camunda.zeebe:userTask',
      // User tasks can take days/weeks — set a 30-day timeout
      timeout: 30 * 24 * 60 * 60 * 1000,
      taskHandler: async (job) => {
        const startTime = Date.now();
        this.logger.log(
          `[Worker] io.camunda.zeebe:userTask: job=${job.key}, element=${job.elementId}, instance=${job.processInstanceKey}`,
        );

        try {
          if (!this.userTasksWorker) {
            this.logger.warn('UserTasksWorker not available, failing job');
            return this.failJobWithIncidentCheck(job, 'UserTasksWorker not available');
          }

          const result = await this.userTasksWorker.handleUserTask({
            key: String(job.key),
            type: job.type,
            processInstanceKey: String(job.processInstanceKey),
            processDefinitionKey: String((job as any).processDefinitionKey || ''),
            bpmnProcessId: (job as any).bpmnProcessId || '',
            elementId: job.elementId,
            variables: job.variables as Record<string, any>,
            customHeaders: job.customHeaders as Record<string, any>,
          });

          this.logger.log(
            `User task ${result.taskId} created from job ${job.key} (awaiting user completion)`,
          );

          await this.logElementExecution(job, 'success', startTime);

          // Forward: release worker capacity, do NOT complete the job.
          // The job stays active in Zeebe until completeUserTaskJob() is called.
          return job.forward();
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to handle user task: ${error.message}`,
            error.stack,
          );
          return this.failJobWithIncidentCheck(job, error.message);
        }
      },
    });
  }

  /**
   * Worker: Create entity in another workspace (cross-workspace spawn)
   * Variables: { sourceEntityId, targetWorkspaceId, title, status?, priority?, data?, linkType?, createdById? }
   */
  private registerCreateEntityWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'create-entity',
      taskHandler: async (job) => {
        const startTime = Date.now();
        this.logger.log(
          `[Worker] create-entity: job=${job.key}, instance=${job.processInstanceKey}`,
        );

        try {
          if (!this.createEntityWorker) {
            this.logger.warn('CreateEntityWorker not available, failing job');
            return this.failJobWithIncidentCheck(job, 'CreateEntityWorker not available');
          }

          const result = await this.createEntityWorker.handleCreateEntity({
            key: String(job.key),
            variables: job.variables as Record<string, any>,
            processInstanceKey: String(job.processInstanceKey),
          });

          await this.logElementExecution(job, 'success', startTime);
          return job.complete({
            createdEntityId: result.createdEntityId,
            createdEntityCustomId: result.createdEntityCustomId,
            linkId: result.linkId || '',
          });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to create entity: ${error.message}`,
            error.stack,
          );
          return this.failJobWithIncidentCheck(job, error.message);
        }
      },
    });
  }

  /**
   * Worker: Suggest assignee using AI assistant
   * Calls AiAssistantService to find the best expert for the entity
   * Variables: { entityId: string }
   */
  private registerSuggestAssigneeWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'suggest-assignee',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const { entityId } = job.variables as { entityId: string };

        this.logger.log(`[Worker] suggest-assignee: entity=${entityId}`);

        try {
          if (this.aiAssistantService && entityId) {
            const assistance = await this.aiAssistantService.getAssistance(entityId);

            if (assistance.suggestedExperts?.length > 0) {
              const topExpert = assistance.suggestedExperts[0];
              this.logger.log(
                `Entity ${entityId} suggested assignee: ${topExpert.name}`,
              );
              await this.logElementExecution(job, 'success', startTime);
              return job.complete({
                hasSuggestion: true,
                suggestedAssigneeName: topExpert.name,
                suggestedAssigneeManagerId: topExpert.managerId || 0,
                suggestedAssigneeDepartment: topExpert.department || '',
              });
            }
          }
          this.logger.warn(
            'AiAssistantService not available or no suggestions, skipping',
          );
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({
            hasSuggestion: false,
          });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to suggest assignee: ${error.message}`,
            error.stack,
          );
          return job.complete({
            hasSuggestion: false,
            error: error.message,
          });
        }
      },
    });
  }

  /**
   * Worker: Check for duplicate entities using AI assistant
   * Calls AiAssistantService to find similar cases (similarity > 0.95 = duplicate)
   * Variables: { entityId: string }
   */
  private registerCheckDuplicateWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'check-duplicate',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const { entityId } = job.variables as { entityId: string };

        this.logger.log(`[Worker] check-duplicate: entity=${entityId}`);

        try {
          if (this.aiAssistantService && entityId) {
            const assistance = await this.aiAssistantService.getAssistance(entityId);
            const duplicate = assistance.similarCases?.find(
              (c: any) => c.similarity > 0.95,
            );

            if (duplicate) {
              this.logger.log(
                `Entity ${entityId} is a potential duplicate of request ${duplicate.requestId} (similarity: ${duplicate.similarity})`,
              );
              await this.logElementExecution(job, 'success', startTime);
              return job.complete({
                isDuplicate: true,
                duplicateRequestId: duplicate.requestId,
                duplicateSimilarity: duplicate.similarity,
              });
            }
          }
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({
            isDuplicate: false,
            duplicateRequestId: 0,
            duplicateSimilarity: 0,
          });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to check duplicate: ${error.message}`,
            error.stack,
          );
          return job.complete({
            isDuplicate: false,
            duplicateRequestId: 0,
            duplicateSimilarity: 0,
          });
        }
      },
    });
  }

  /**
   * Complete a user task job in Zeebe by its key.
   * Called by UserTasksService when a user completes a task through the API.
   */
  async completeUserTaskJob(
    jobKey: string,
    variables: Record<string, any>,
  ): Promise<boolean> {
    if (!this.zeebeClient) {
      this.logger.warn('Zeebe client not available, cannot complete job');
      return false;
    }

    try {
      await this.zeebeClient.completeJob({ jobKey, variables });
      this.logger.log(`Zeebe job ${jobKey} completed with variables`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to complete Zeebe job ${jobKey}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Worker: Process completed handler
   * Updates process instance status in our DB
   * Variables: { processInstanceKey: string }
   */
  private registerProcessCompletedWorker() {
    this.zeebeClient!.createWorker({
      taskType: 'process-completed',
      taskHandler: async (job) => {
        const startTime = Date.now();
        const processInstanceKey = String(job.processInstanceKey);

        this.logger.log(
          `[Worker] process-completed: instanceKey=${processInstanceKey}`,
        );

        try {
          await this.bpmnService.updateInstanceStatus(
            processInstanceKey,
            ProcessInstanceStatus.COMPLETED,
          );
          await this.logElementExecution(job, 'success', startTime);
          return job.complete({ completed: true });
        } catch (error) {
          await this.logElementExecution(job, 'failed', startTime);
          this.logger.error(
            `Failed to mark process completed: ${error.message}`,
            error.stack,
          );
          return job.complete({ completed: false, error: error.message });
        }
      },
    });
  }
}
