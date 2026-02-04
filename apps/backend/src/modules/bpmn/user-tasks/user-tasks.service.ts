import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  UserTask,
  UserTaskStatus,
  UserTaskComment,
} from '../entities/user-task.entity';
import { UserGroup } from '../entities/user-group.entity';
import { FormDefinition } from '../entities/form-definition.entity';

export interface TaskFilter {
  workspaceId?: string;
  status?: UserTaskStatus | UserTaskStatus[];
  assigneeId?: string;
  candidateGroups?: string[];
  processInstanceId?: string;
  entityId?: string;
}

export interface TaskWithForm extends UserTask {
  formDefinition?: FormDefinition | null;
}

@Injectable()
export class UserTasksService {
  private readonly logger = new Logger(UserTasksService.name);

  constructor(
    @InjectRepository(UserTask)
    private taskRepository: Repository<UserTask>,
    @InjectRepository(UserTaskComment)
    private commentRepository: Repository<UserTaskComment>,
    @InjectRepository(UserGroup)
    private groupRepository: Repository<UserGroup>,
    @InjectRepository(FormDefinition)
    private formRepository: Repository<FormDefinition>,
  ) {}

  // ==================== Task Queries ====================

  /**
   * Find tasks by filter criteria
   */
  async findTasks(filter: TaskFilter, limit = 100): Promise<UserTask[]> {
    const qb = this.taskRepository.createQueryBuilder('task')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.entity', 'entity')
      .leftJoinAndSelect('task.processInstance', 'processInstance');

    if (filter.workspaceId) {
      qb.andWhere('task.workspaceId = :workspaceId', { workspaceId: filter.workspaceId });
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        qb.andWhere('task.status IN (:...statuses)', { statuses: filter.status });
      } else {
        qb.andWhere('task.status = :status', { status: filter.status });
      }
    }

    if (filter.assigneeId) {
      qb.andWhere('task.assigneeId = :assigneeId', { assigneeId: filter.assigneeId });
    }

    if (filter.processInstanceId) {
      qb.andWhere('task.processInstanceId = :processInstanceId', {
        processInstanceId: filter.processInstanceId,
      });
    }

    if (filter.entityId) {
      qb.andWhere('task.entityId = :entityId', { entityId: filter.entityId });
    }

    // Filter by candidate groups - user must be member of at least one group
    if (filter.candidateGroups && filter.candidateGroups.length > 0) {
      qb.andWhere(
        '(task.candidateGroups && ARRAY[:...groups]::varchar[] OR task.assigneeId IS NOT NULL)',
        { groups: filter.candidateGroups },
      );
    }

    qb.orderBy('task.createdAt', 'DESC').take(limit);

    return qb.getMany();
  }

  /**
   * Get user's inbox - tasks assigned to user or available for claim
   */
  async getInbox(
    userId: string,
    workspaceId?: string,
    includeCompleted = false,
  ): Promise<UserTask[]> {
    // Get user's groups
    const userGroups = await this.getUserGroups(userId, workspaceId);
    const groupNames = userGroups.map((g) => g.name);

    const statuses = includeCompleted
      ? [UserTaskStatus.CREATED, UserTaskStatus.CLAIMED, UserTaskStatus.COMPLETED]
      : [UserTaskStatus.CREATED, UserTaskStatus.CLAIMED];

    const qb = this.taskRepository.createQueryBuilder('task')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.entity', 'entity')
      .leftJoinAndSelect('task.processInstance', 'processInstance')
      .where('task.status IN (:...statuses)', { statuses });

    if (workspaceId) {
      qb.andWhere('task.workspaceId = :workspaceId', { workspaceId });
    }

    // Task is in inbox if:
    // 1. Assigned to user, OR
    // 2. User is in candidateUsers array, OR
    // 3. User is member of a candidate group
    qb.andWhere(
      '(task.assigneeId = :userId OR :userId = ANY(task.candidateUsers) OR task.candidateGroups && ARRAY[:...groups]::varchar[])',
      { userId, groups: groupNames.length > 0 ? groupNames : ['__none__'] },
    );

    qb.orderBy('task.priority', 'DESC')
      .addOrderBy('task.dueDate', 'ASC', 'NULLS LAST')
      .addOrderBy('task.createdAt', 'DESC');

    return qb.getMany();
  }

  /**
   * Get single task with form definition
   */
  async findOne(taskId: string): Promise<TaskWithForm> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
      relations: ['assignee', 'entity', 'processInstance', 'processInstance.processDefinition'],
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    // Load form definition if specified
    let formDefinition: FormDefinition | null = null;
    if (task.formKey) {
      // Find workspace-specific form first, then global
      formDefinition = await this.formRepository.findOne({
        where: { key: task.formKey, workspaceId: task.workspaceId },
      });
      if (!formDefinition) {
        // Try global form
        formDefinition = await this.formRepository
          .createQueryBuilder('form')
          .where('form.key = :key AND form.workspaceId IS NULL', { key: task.formKey })
          .getOne();
      }
    }

    return { ...task, formDefinition };
  }

  /**
   * Get task by Zeebe job key
   */
  async findByJobKey(jobKey: string): Promise<UserTask | null> {
    return this.taskRepository.findOne({
      where: { jobKey },
      relations: ['assignee', 'entity'],
    });
  }

  // ==================== Task Actions ====================

  /**
   * Claim a task - assign it to the current user
   */
  async claim(taskId: string, userId: string): Promise<UserTask> {
    const task = await this.findOne(taskId);

    if (task.status !== UserTaskStatus.CREATED) {
      throw new BadRequestException(
        `Task cannot be claimed. Current status: ${task.status}`,
      );
    }

    // Verify user can claim (is in candidates)
    const canClaim = await this.canUserClaimTask(task, userId);
    if (!canClaim) {
      throw new ForbiddenException('You are not a candidate for this task');
    }

    task.assigneeId = userId;
    task.status = UserTaskStatus.CLAIMED;
    task.claimedAt = new Date();

    const saved = await this.taskRepository.save(task);
    this.logger.log(`Task ${taskId} claimed by user ${userId}`);

    return saved;
  }

  /**
   * Unclaim a task - release it back to pool
   */
  async unclaim(taskId: string, userId: string): Promise<UserTask> {
    const task = await this.findOne(taskId);

    if (task.assigneeId !== userId) {
      throw new ForbiddenException('You can only unclaim tasks assigned to you');
    }

    if (task.status !== UserTaskStatus.CLAIMED) {
      throw new BadRequestException(
        `Task cannot be unclaimed. Current status: ${task.status}`,
      );
    }

    task.assigneeId = null;
    task.status = UserTaskStatus.CREATED;
    task.claimedAt = null;

    const saved = await this.taskRepository.save(task);
    this.logger.log(`Task ${taskId} unclaimed by user ${userId}`);

    return saved;
  }

  /**
   * Complete a task with form data
   */
  async complete(
    taskId: string,
    userId: string,
    formData: Record<string, any>,
  ): Promise<UserTask> {
    const task = await this.findOne(taskId);

    // Only assignee can complete
    if (task.assigneeId !== userId) {
      throw new ForbiddenException('Only the assignee can complete this task');
    }

    if (task.status === UserTaskStatus.COMPLETED) {
      throw new BadRequestException('Task is already completed');
    }

    if (task.status === UserTaskStatus.CANCELLED) {
      throw new BadRequestException('Cannot complete a cancelled task');
    }

    // Validate form data if form is specified
    if (task.formKey) {
      await this.validateFormData(task.formKey, task.workspaceId, formData);
    }

    task.status = UserTaskStatus.COMPLETED;
    task.completedAt = new Date();
    task.formData = formData;

    const saved = await this.taskRepository.save(task);
    this.logger.log(`Task ${taskId} completed by user ${userId}`);

    return saved;
  }

  /**
   * Delegate task to another user
   */
  async delegate(
    taskId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<UserTask> {
    const task = await this.findOne(taskId);

    if (task.assigneeId !== fromUserId) {
      throw new ForbiddenException('Only the assignee can delegate this task');
    }

    if ([UserTaskStatus.COMPLETED, UserTaskStatus.CANCELLED].includes(task.status)) {
      throw new BadRequestException(`Cannot delegate task with status: ${task.status}`);
    }

    task.assigneeId = toUserId;
    task.status = UserTaskStatus.DELEGATED;

    // Record delegation in history
    task.history = [
      ...task.history,
      {
        action: 'delegated',
        userId: fromUserId,
        timestamp: new Date().toISOString(),
        data: { toUserId },
      },
    ];

    const saved = await this.taskRepository.save(task);
    this.logger.log(`Task ${taskId} delegated from ${fromUserId} to ${toUserId}`);

    return saved;
  }

  // ==================== Task Creation (from Zeebe) ====================

  /**
   * Create a user task from Zeebe job
   */
  async createFromZeebe(data: {
    jobKey: string;
    processInstanceId: string;
    elementId: string;
    elementName?: string;
    workspaceId: string;
    entityId?: string;
    taskType?: string;
    formKey?: string;
    candidateGroups?: string[];
    candidateUsers?: string[];
    assigneeId?: string;
    dueDate?: Date;
    followUpDate?: Date;
    priority?: number;
    processVariables?: Record<string, any>;
  }): Promise<UserTask> {
    // Check if task already exists
    const existing = await this.findByJobKey(data.jobKey);
    if (existing) {
      this.logger.warn(`Task with job key ${data.jobKey} already exists`);
      return existing;
    }

    const task = this.taskRepository.create({
      jobKey: data.jobKey,
      processInstanceId: data.processInstanceId,
      elementId: data.elementId,
      elementName: data.elementName,
      workspaceId: data.workspaceId,
      entityId: data.entityId,
      taskType: data.taskType || 'custom',
      formKey: data.formKey,
      candidateGroups: data.candidateGroups || [],
      candidateUsers: data.candidateUsers || [],
      assigneeId: data.assigneeId,
      dueDate: data.dueDate,
      followUpDate: data.followUpDate,
      priority: data.priority || 50,
      processVariables: data.processVariables || {},
      status: data.assigneeId ? UserTaskStatus.CLAIMED : UserTaskStatus.CREATED,
      claimedAt: data.assigneeId ? new Date() : null,
    });

    const saved = await this.taskRepository.save(task);
    this.logger.log(`Created user task ${saved.id} from job key ${data.jobKey}`);

    return saved;
  }

  /**
   * Cancel a task (from Zeebe)
   */
  async cancel(taskId: string, reason?: string): Promise<UserTask> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    task.status = UserTaskStatus.CANCELLED;
    task.completedAt = new Date();
    if (reason) {
      task.processVariables = { ...task.processVariables, cancellationReason: reason };
    }

    const saved = await this.taskRepository.save(task);
    this.logger.log(`Task ${taskId} cancelled`);

    return saved;
  }

  // ==================== Task Comments ====================

  async addComment(
    taskId: string,
    userId: string,
    content: string,
  ): Promise<UserTaskComment> {
    const task = await this.findOne(taskId);

    const comment = this.commentRepository.create({
      taskId: task.id,
      userId,
      content,
    });

    return this.commentRepository.save(comment);
  }

  async getComments(taskId: string): Promise<UserTaskComment[]> {
    return this.commentRepository.find({
      where: { taskId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  // ==================== User Groups ====================

  async getUserGroups(userId: string, workspaceId?: string): Promise<UserGroup[]> {
    const qb = this.groupRepository.createQueryBuilder('group')
      .innerJoin('group.members', 'member')
      .where('member.id = :userId', { userId });

    if (workspaceId) {
      qb.andWhere('(group.workspaceId = :workspaceId OR group.workspaceId IS NULL)', {
        workspaceId,
      });
    }

    return qb.getMany();
  }

  // ==================== Helper Methods ====================

  private async canUserClaimTask(task: UserTask, userId: string): Promise<boolean> {
    // User is already in candidate users
    if (task.candidateUsers?.includes(userId)) {
      return true;
    }

    // Check if user is member of any candidate group
    if (task.candidateGroups && task.candidateGroups.length > 0) {
      const userGroups = await this.getUserGroups(userId, task.workspaceId);
      const userGroupNames = userGroups.map((g) => g.name);

      return task.candidateGroups.some((cg) => userGroupNames.includes(cg));
    }

    // No candidates specified = anyone can claim
    if (
      (!task.candidateUsers || task.candidateUsers.length === 0) &&
      (!task.candidateGroups || task.candidateGroups.length === 0)
    ) {
      return true;
    }

    return false;
  }

  private async validateFormData(
    formKey: string,
    workspaceId: string,
    data: Record<string, any>,
  ): Promise<void> {
    // Find workspace-specific form first
    let form = await this.formRepository.findOne({
      where: { key: formKey, workspaceId },
    });

    if (!form) {
      // Try global form
      form = await this.formRepository
        .createQueryBuilder('form')
        .where('form.key = :key AND form.workspaceId IS NULL', { key: formKey })
        .getOne();
    }

    if (!form) {
      // No form definition = no validation
      return;
    }

    // Basic validation against JSON Schema required fields
    const required = form.schema.required || [];
    for (const field of required) {
      if (data[field] === undefined || data[field] === null || data[field] === '') {
        throw new BadRequestException(`Field "${field}" is required`);
      }
    }

    // Type validation
    for (const [fieldName, fieldSchema] of Object.entries(form.schema.properties)) {
      const value = data[fieldName];
      if (value === undefined || value === null) continue;

      switch (fieldSchema.type) {
        case 'string':
          if (typeof value !== 'string') {
            throw new BadRequestException(`Field "${fieldName}" must be a string`);
          }
          if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
            throw new BadRequestException(
              `Field "${fieldName}" must be at least ${fieldSchema.minLength} characters`,
            );
          }
          if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
            throw new BadRequestException(
              `Field "${fieldName}" must be at most ${fieldSchema.maxLength} characters`,
            );
          }
          break;

        case 'number':
          if (typeof value !== 'number') {
            throw new BadRequestException(`Field "${fieldName}" must be a number`);
          }
          if (fieldSchema.minimum !== undefined && value < fieldSchema.minimum) {
            throw new BadRequestException(
              `Field "${fieldName}" must be at least ${fieldSchema.minimum}`,
            );
          }
          if (fieldSchema.maximum !== undefined && value > fieldSchema.maximum) {
            throw new BadRequestException(
              `Field "${fieldName}" must be at most ${fieldSchema.maximum}`,
            );
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            throw new BadRequestException(`Field "${fieldName}" must be a boolean`);
          }
          break;

        case 'array':
          if (!Array.isArray(value)) {
            throw new BadRequestException(`Field "${fieldName}" must be an array`);
          }
          if (fieldSchema.minItems && value.length < fieldSchema.minItems) {
            throw new BadRequestException(
              `Field "${fieldName}" must have at least ${fieldSchema.minItems} items`,
            );
          }
          if (fieldSchema.maxItems && value.length > fieldSchema.maxItems) {
            throw new BadRequestException(
              `Field "${fieldName}" must have at most ${fieldSchema.maxItems} items`,
            );
          }
          break;
      }

      // Enum validation
      if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
        throw new BadRequestException(
          `Field "${fieldName}" must be one of: ${fieldSchema.enum.join(', ')}`,
        );
      }
    }
  }

  // ==================== Statistics ====================

  async getTaskStatistics(workspaceId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    overdue: number;
    avgCompletionTimeMs: number | null;
  }> {
    const stats = await this.taskRepository
      .createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('task.workspaceId = :workspaceId', { workspaceId })
      .groupBy('task.status')
      .getRawMany();

    const byStatus: Record<string, number> = {};
    let total = 0;

    for (const row of stats) {
      byStatus[row.status] = parseInt(row.count, 10);
      total += parseInt(row.count, 10);
    }

    // Count overdue tasks
    const overdue = await this.taskRepository
      .createQueryBuilder('task')
      .where('task.workspaceId = :workspaceId', { workspaceId })
      .andWhere('task.status IN (:...statuses)', {
        statuses: [UserTaskStatus.CREATED, UserTaskStatus.CLAIMED],
      })
      .andWhere('task.dueDate < NOW()')
      .getCount();

    // Calculate average completion time
    const avgResult = await this.taskRepository
      .createQueryBuilder('task')
      .select(
        'AVG(EXTRACT(EPOCH FROM (task.completedAt - task.createdAt)) * 1000)',
        'avgTime',
      )
      .where('task.workspaceId = :workspaceId', { workspaceId })
      .andWhere('task.status = :status', { status: UserTaskStatus.COMPLETED })
      .getRawOne();

    return {
      total,
      byStatus,
      overdue,
      avgCompletionTimeMs: avgResult?.avgTime ? Math.round(parseFloat(avgResult.avgTime)) : null,
    };
  }
}
