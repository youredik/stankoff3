import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Camunda8 } from '@camunda8/sdk';
import { EntityService } from '../entity/entity.service';
import { EmailService } from '../email/email.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EventsGateway } from '../websocket/events.gateway';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { BpmnService } from './bpmn.service';
import { ProcessInstanceStatus } from './entities/process-instance.entity';

@Injectable()
export class BpmnWorkersService implements OnModuleInit {
  private readonly logger = new Logger(BpmnWorkersService.name);
  private zeebeClient: ReturnType<Camunda8['getZeebeGrpcApiClient']> | null =
    null;

  // Lazy-loaded services to avoid circular dependencies
  private entityService?: EntityService;
  private emailService?: EmailService;
  private auditLogService?: AuditLogService;
  private eventsGateway?: EventsGateway;
  private aiClassifierService?: any;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(forwardRef(() => BpmnService))
    private readonly bpmnService: BpmnService,
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

    this.logger.log(
      'BPMN workers registered: update-entity-status, send-notification, send-email, log-activity, set-assignee, process-completed, classify-entity',
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
          return job.complete({
            statusUpdated: true,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.error(
            `Failed to update entity status: ${error.message}`,
            error.stack,
          );
          return job.fail({
            errorMessage: error.message,
            retries: job.retries - 1,
          });
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
            // Emit WebSocket event for real-time notification
            this.eventsGateway.emitEntityUpdated({
              id: entityId,
              workspaceId,
              notification: { userId, message },
            } as any);
          }
          return job.complete({ notificationSent: true });
        } catch (error) {
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
            return job.complete({ emailSent: sent });
          }
          return job.complete({ emailSent: false, reason: 'EmailService not available' });
        } catch (error) {
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
          return job.complete({ logged: true });
        } catch (error) {
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
          return job.complete({
            assigneeSet: true,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.error(
            `Failed to set assignee: ${error.message}`,
            error.stack,
          );
          return job.fail({
            errorMessage: error.message,
            retries: job.retries - 1,
          });
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
        const { entityId } = job.variables as { entityId: string };

        this.logger.log(`[Worker] classify-entity: entity=${entityId}`);

        try {
          if (this.aiClassifierService && entityId) {
            const classification =
              await this.aiClassifierService.classifyAndSave(entityId);
            this.logger.log(
              `Entity ${entityId} classified: category=${classification?.category}, priority=${classification?.priority}`,
            );
            return job.complete({
              classified: true,
              category: classification?.category || 'other',
              aiPriority: classification?.priority || 'medium',
              confidence: classification?.confidence || 0,
            });
          }
          // AI not available — continue without classification
          this.logger.warn(
            'AiClassifierService not available, skipping classification',
          );
          return job.complete({
            classified: false,
            reason: 'AI service not available',
          });
        } catch (error) {
          this.logger.error(
            `Failed to classify entity: ${error.message}`,
            error.stack,
          );
          // Don't fail the job — classification is optional
          return job.complete({
            classified: false,
            error: error.message,
          });
        }
      },
    });
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
        const processInstanceKey = String(job.processInstanceKey);

        this.logger.log(
          `[Worker] process-completed: instanceKey=${processInstanceKey}`,
        );

        try {
          await this.bpmnService.updateInstanceStatus(
            processInstanceKey,
            ProcessInstanceStatus.COMPLETED,
          );
          return job.complete({ completed: true });
        } catch (error) {
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
