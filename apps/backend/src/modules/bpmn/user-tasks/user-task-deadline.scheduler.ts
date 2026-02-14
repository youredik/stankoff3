import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, In } from 'typeorm';
import { UserTask, UserTaskStatus } from '../entities/user-task.entity';
import { EventsGateway } from '../../websocket/events.gateway';
import { User, NotificationPreferences } from '../../user/user.entity';

/**
 * Scheduler that checks for approaching deadlines and overdue user tasks.
 * Runs every 5 minutes, sends reminder/overdue notifications via WebSocket.
 */
@Injectable()
export class UserTaskDeadlineScheduler {
  private readonly logger = new Logger(UserTaskDeadlineScheduler.name);

  /** Tasks with dueDate within this window get a reminder */
  private readonly REMINDER_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    @InjectRepository(UserTask)
    private readonly taskRepository: Repository<UserTask>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Check for tasks approaching deadline (reminder) and overdue tasks.
   * Runs every 5 minutes.
   */
  @Cron('0 */5 * * * *')
  async checkDeadlines(): Promise<void> {
    await Promise.all([
      this.sendReminders(),
      this.sendOverdueNotifications(),
    ]);
  }

  /**
   * Find tasks where dueDate is within REMINDER_THRESHOLD_MS
   * and reminder hasn't been sent yet.
   */
  private async sendReminders(): Promise<void> {
    try {
      const now = new Date();
      const threshold = new Date(now.getTime() + this.REMINDER_THRESHOLD_MS);

      const tasks = await this.taskRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.assignee', 'assignee')
        .leftJoinAndSelect('task.entity', 'entity')
        .where('task.status IN (:...statuses)', {
          statuses: [UserTaskStatus.CREATED, UserTaskStatus.CLAIMED],
        })
        .andWhere('task.dueDate IS NOT NULL')
        .andWhere('task.dueDate > :now', { now })
        .andWhere('task.dueDate <= :threshold', { threshold })
        .andWhere('task.reminderSentAt IS NULL')
        .getMany();

      if (tasks.length === 0) return;

      this.logger.log(`Sending deadline reminders for ${tasks.length} task(s)`);

      // Collect all target user IDs to load preferences in batch
      const allUserIds = new Set<string>();
      for (const task of tasks) {
        this.getNotificationTargets(task).forEach((id) => allUserIds.add(id));
      }
      const prefsMap = await this.loadUserPreferences([...allUserIds]);

      for (const task of tasks) {
        const targetUserIds = this.getNotificationTargets(task);
        for (const userId of targetUserIds) {
          if (!this.shouldNotify(prefsMap.get(userId), 'taskReminder')) continue;
          this.eventsGateway.emitToUser(userId, 'task:reminder', {
            taskId: task.id,
            taskName: task.elementName || task.elementId,
            entityTitle: task.entity?.title,
            entityCustomId: task.entity?.customId,
            dueDate: task.dueDate,
            workspaceId: task.workspaceId,
          });
        }

        task.reminderSentAt = now;
      }

      await this.taskRepository.save(tasks);
    } catch (error) {
      this.logger.error('Failed to send deadline reminders', error);
    }
  }

  /**
   * Find tasks where dueDate has passed and overdue notification hasn't been sent.
   */
  private async sendOverdueNotifications(): Promise<void> {
    try {
      const now = new Date();

      const tasks = await this.taskRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.assignee', 'assignee')
        .leftJoinAndSelect('task.entity', 'entity')
        .where('task.status IN (:...statuses)', {
          statuses: [UserTaskStatus.CREATED, UserTaskStatus.CLAIMED],
        })
        .andWhere('task.dueDate IS NOT NULL')
        .andWhere('task.dueDate < :now', { now })
        .andWhere('task.overdueSentAt IS NULL')
        .getMany();

      if (tasks.length === 0) return;

      this.logger.log(`Sending overdue notifications for ${tasks.length} task(s)`);

      const allUserIds = new Set<string>();
      for (const task of tasks) {
        this.getNotificationTargets(task).forEach((id) => allUserIds.add(id));
      }
      const prefsMap = await this.loadUserPreferences([...allUserIds]);

      for (const task of tasks) {
        const targetUserIds = this.getNotificationTargets(task);
        for (const userId of targetUserIds) {
          if (!this.shouldNotify(prefsMap.get(userId), 'taskOverdue')) continue;
          this.eventsGateway.emitToUser(userId, 'task:overdue', {
            taskId: task.id,
            taskName: task.elementName || task.elementId,
            entityTitle: task.entity?.title,
            entityCustomId: task.entity?.customId,
            dueDate: task.dueDate,
            workspaceId: task.workspaceId,
          });
        }

        task.overdueSentAt = now;
      }

      await this.taskRepository.save(tasks);
    } catch (error) {
      this.logger.error('Failed to send overdue notifications', error);
    }
  }

  /**
   * Determine which users should receive the notification.
   * Priority: assignee > candidateUsers > broadcast to workspace.
   */
  private getNotificationTargets(task: UserTask): string[] {
    if (task.assigneeId) {
      return [task.assigneeId];
    }
    if (task.candidateUsers && task.candidateUsers.length > 0) {
      return task.candidateUsers;
    }
    // No specific target — will be visible in inbox
    return [];
  }

  /** Load notification preferences for a batch of user IDs */
  private async loadUserPreferences(
    userIds: string[],
  ): Promise<Map<string, NotificationPreferences | null | undefined>> {
    const map = new Map<string, NotificationPreferences | null | undefined>();
    if (userIds.length === 0) return map;

    const users = await this.userRepository.find({
      where: userIds.map((id) => ({ id })),
      select: ['id', 'notificationPreferences'],
    });
    for (const u of users) {
      map.set(u.id, u.notificationPreferences);
    }
    return map;
  }

  /**
   * Check if user should receive a notification of the given type,
   * respecting DND hours and per-type preferences.
   * Default: true (notify) when no preferences are set.
   */
  private shouldNotify(
    prefs: NotificationPreferences | null | undefined,
    type: keyof NotificationPreferences,
  ): boolean {
    if (!prefs) return true; // no preferences → all enabled

    // Check per-type toggle (default true)
    if (prefs[type] === false) return false;

    // Check DND
    if (prefs.dndEnabled) {
      const now = new Date();
      const hour = now.getHours();
      const start = prefs.dndStartHour ?? 22;
      const end = prefs.dndEndHour ?? 8;

      // Handle overnight DND (e.g. 22:00 → 08:00)
      if (start > end) {
        if (hour >= start || hour < end) return false;
      } else if (start < end) {
        if (hour >= start && hour < end) return false;
      }
    }

    return true;
  }
}
