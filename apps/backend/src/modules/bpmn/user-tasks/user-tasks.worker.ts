import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { UserTasksService } from './user-tasks.service';
import { BpmnService } from '../bpmn.service';
import { UserTaskStatus } from '../entities/user-task.entity';

/**
 * Worker that handles user task jobs from Zeebe
 *
 * In Zeebe/Camunda 8, user tasks are implemented as service tasks with special handling.
 * This worker listens for user task jobs and creates corresponding UserTask records
 * in our database for the inbox functionality.
 */
@Injectable()
export class UserTasksWorker {
  private readonly logger = new Logger(UserTasksWorker.name);

  constructor(
    private readonly tasksService: UserTasksService,
    @Inject(forwardRef(() => BpmnService))
    private readonly bpmnService: BpmnService,
  ) {}

  /**
   * Handle a user task job from Zeebe
   * Called by BpmnWorkersService when a user task is activated
   */
  async handleUserTask(job: {
    key: string;
    type: string;
    processInstanceKey: string;
    processDefinitionKey: string;
    bpmnProcessId: string;
    elementId: string;
    variables: Record<string, any>;
    customHeaders: Record<string, any>;
  }): Promise<{ taskId: string }> {
    this.logger.log(`Handling user task job ${job.key} for element ${job.elementId}`);

    const variables = job.variables;
    const headers = job.customHeaders;

    // Extract task configuration from headers and variables
    const workspaceId = variables.workspaceId;
    const entityId = variables.entityId;

    if (!workspaceId) {
      throw new Error('workspaceId is required in process variables');
    }

    // Parse candidate groups and users from headers
    const candidateGroups = this.parseArray(headers['io.camunda.zeebe:candidateGroups']);
    const candidateUsers = this.parseArray(headers['io.camunda.zeebe:candidateUsers']);
    const assignee = headers['io.camunda.zeebe:assignee'] || variables.assignee;
    const formKey = headers['io.camunda.zeebe:formKey'];
    const dueDate = this.parseDate(headers['io.camunda.zeebe:dueDate'] || variables.dueDate);
    const priority = parseInt(headers['io.camunda.zeebe:priority'] || variables.priority || '0', 10);

    // Create user task in our database
    const followUpDate = this.parseDate(headers['io.camunda.zeebe:followUpDate'] || variables.followUpDate);
    const taskType = headers['io.camunda.zeebe:taskType'] || variables.taskType || 'custom';

    // Resolve process instance and element name
    const processInstanceKey = String(job.processInstanceKey);
    const processInstanceId = await this.getProcessInstanceId(processInstanceKey);
    const elementName = headers.name || await this.resolveElementName(processInstanceKey, job.elementId) || job.elementId;

    const task = await this.tasksService.createFromZeebe({
      jobKey: String(job.key),
      processInstanceId,
      elementId: job.elementId,
      elementName,
      workspaceId,
      entityId,
      taskType,
      formKey,
      candidateGroups,
      candidateUsers,
      assigneeId: assignee,
      dueDate,
      followUpDate,
      priority,
      processVariables: this.filterTaskVariables(variables),
    });

    this.logger.log(`Created user task ${task.id} from Zeebe job ${job.key}`);

    return { taskId: task.id };
  }

  /**
   * Called when a user task is completed in our system
   * This should complete the Zeebe job with the form data
   */
  async completeZeebeJob(
    jobKey: string,
    formData: Record<string, any>,
  ): Promise<void> {
    this.logger.log(`Completing Zeebe job ${jobKey}`);

    // The actual job completion is handled by BpmnWorkersService
    // This method is called to signal completion
    // In a full implementation, we would store the job reference and complete it here
  }

  /**
   * Resolve human-readable element name from BPMN XML definition
   */
  private async resolveElementName(processInstanceKey: string, elementId: string): Promise<string | null> {
    try {
      const instance = await this.bpmnService.findInstanceByKey(processInstanceKey);
      if (instance?.processDefinitionId) {
        return this.bpmnService.getElementNameFromDefinition(instance.processDefinitionId, elementId);
      }
    } catch (error) {
      this.logger.warn(`Could not resolve element name for ${elementId}: ${error.message}`);
    }
    return null;
  }

  /**
   * Get our internal process instance ID from Zeebe's key
   */
  private async getProcessInstanceId(zeebeKey: string): Promise<string> {
    const instance = await this.bpmnService.findInstanceByKey(zeebeKey);
    if (instance) {
      return instance.id;
    }
    // Fallback: return Zeebe key (task will still be created but won't link to instance)
    this.logger.warn(`ProcessInstance not found for key ${zeebeKey}, using key as fallback`);
    return zeebeKey;
  }

  /**
   * Parse a comma-separated string or JSON array into string array
   */
  private parseArray(value: string | string[] | undefined): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;

    // Try JSON parse first
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not JSON, try comma-separated
    }

    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /**
   * Parse various date formats into Date object
   */
  private parseDate(value: string | Date | undefined): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;

    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }

  /**
   * Filter variables to only include relevant ones for the task
   */
  private filterTaskVariables(variables: Record<string, any>): Record<string, any> {
    // Remove internal Zeebe variables
    const filtered: Record<string, any> = {};
    const excludeKeys = ['processInstanceKey', 'processDefinitionKey', 'bpmnProcessId'];

    for (const [key, value] of Object.entries(variables)) {
      if (!excludeKeys.includes(key) && !key.startsWith('_')) {
        filtered[key] = value;
      }
    }

    return filtered;
  }
}
