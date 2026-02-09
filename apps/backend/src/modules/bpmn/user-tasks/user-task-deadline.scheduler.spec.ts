import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTaskDeadlineScheduler } from './user-task-deadline.scheduler';
import { UserTask, UserTaskStatus } from '../entities/user-task.entity';
import { EventsGateway } from '../../websocket/events.gateway';

describe('UserTaskDeadlineScheduler', () => {
  let scheduler: UserTaskDeadlineScheduler;
  let taskRepository: jest.Mocked<Repository<UserTask>>;
  let eventsGateway: jest.Mocked<EventsGateway>;

  const now = new Date('2026-02-09T12:00:00Z');

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const createMockTask = (overrides: Partial<UserTask> = {}): UserTask => ({
    id: 'task-1',
    processInstanceId: 'process-1',
    processInstance: null as any,
    workspaceId: 'ws-1',
    workspace: null as any,
    entityId: 'entity-1',
    entity: { title: 'Заявка', customId: 'WS-001' } as any,
    jobKey: 'job-1',
    elementId: 'Activity_1',
    elementName: 'Обработать заявку',
    taskType: 'custom',
    formKey: null,
    formSchema: null,
    formData: {},
    assigneeId: 'user-1',
    assignee: null as any,
    assigneeEmail: null,
    candidateGroups: null,
    candidateUsers: null,
    dueDate: new Date('2026-02-09T12:30:00Z'), // 30 min from now
    followUpDate: null,
    priority: 50,
    status: UserTaskStatus.CREATED,
    claimedAt: null,
    claimedById: null,
    claimedBy: null as any,
    completedAt: null,
    completedById: null,
    completedBy: null as any,
    completionResult: null,
    history: [],
    processVariables: {},
    reminderSentAt: null,
    overdueSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: [],
    ...overrides,
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTaskDeadlineScheduler,
        {
          provide: getRepositoryToken(UserTask),
          useValue: {
            save: jest.fn().mockImplementation(async (tasks) => tasks),
            createQueryBuilder: jest.fn(() => ({ ...mockQueryBuilder })),
          },
        },
        {
          provide: EventsGateway,
          useValue: {
            emitToUser: jest.fn(),
          },
        },
      ],
    }).compile();

    scheduler = module.get<UserTaskDeadlineScheduler>(UserTaskDeadlineScheduler);
    taskRepository = module.get(getRepositoryToken(UserTask));
    eventsGateway = module.get(EventsGateway);

    // Reset mock query builder for each test
    mockQueryBuilder.leftJoinAndSelect.mockReturnThis();
    mockQueryBuilder.where.mockReturnThis();
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.getMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('checkDeadlines', () => {
    it('должен запускать sendReminders и sendOverdueNotifications параллельно', async () => {
      const sendRemindersSpy = jest.spyOn(scheduler as any, 'sendReminders').mockResolvedValue(undefined);
      const sendOverdueSpy = jest.spyOn(scheduler as any, 'sendOverdueNotifications').mockResolvedValue(undefined);

      await scheduler.checkDeadlines();

      expect(sendRemindersSpy).toHaveBeenCalled();
      expect(sendOverdueSpy).toHaveBeenCalled();
    });
  });

  describe('sendReminders (через checkDeadlines)', () => {
    it('должен отправить reminder assignee для задачи с приближающимся дедлайном', async () => {
      const task = createMockTask({
        id: 'task-approaching',
        assigneeId: 'user-1',
        dueDate: new Date('2026-02-09T12:30:00Z'), // 30 мин до дедлайна
        reminderSentAt: null,
      });

      // First call to createQueryBuilder is for reminders
      let callCount = 0;
      taskRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        const qb = { ...mockQueryBuilder };
        if (callCount === 1) {
          // Reminders query
          qb.getMany = jest.fn().mockResolvedValue([task]);
        } else {
          // Overdue query
          qb.getMany = jest.fn().mockResolvedValue([]);
        }
        return qb as any;
      });

      await scheduler.checkDeadlines();

      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'task:reminder',
        expect.objectContaining({
          taskId: 'task-approaching',
          taskName: 'Обработать заявку',
          entityTitle: 'Заявка',
          entityCustomId: 'WS-001',
          workspaceId: 'ws-1',
        }),
      );
      expect(taskRepository.save).toHaveBeenCalled();
    });

    it('должен отправить reminder candidateUsers если нет assignee', async () => {
      const task = createMockTask({
        id: 'task-candidates',
        assigneeId: null,
        candidateUsers: ['user-2', 'user-3'],
        dueDate: new Date('2026-02-09T12:30:00Z'),
        reminderSentAt: null,
      });

      let callCount = 0;
      taskRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        const qb = { ...mockQueryBuilder };
        if (callCount === 1) {
          qb.getMany = jest.fn().mockResolvedValue([task]);
        } else {
          qb.getMany = jest.fn().mockResolvedValue([]);
        }
        return qb as any;
      });

      await scheduler.checkDeadlines();

      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        'user-2',
        'task:reminder',
        expect.objectContaining({ taskId: 'task-candidates' }),
      );
      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        'user-3',
        'task:reminder',
        expect.objectContaining({ taskId: 'task-candidates' }),
      );
    });

    it('не должен отправлять reminder если reminderSentAt уже заполнено', async () => {
      // Scheduler queries where reminderSentAt IS NULL, so if it's set
      // the task won't be in the result
      let callCount = 0;
      taskRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        const qb = { ...mockQueryBuilder };
        qb.getMany = jest.fn().mockResolvedValue([]); // No tasks
        return qb as any;
      });

      await scheduler.checkDeadlines();

      expect(eventsGateway.emitToUser).not.toHaveBeenCalledWith(
        expect.anything(),
        'task:reminder',
        expect.anything(),
      );
    });

    it('не должен отправлять уведомление если нет ни assignee ни candidateUsers', async () => {
      const task = createMockTask({
        assigneeId: null,
        candidateUsers: null,
        dueDate: new Date('2026-02-09T12:30:00Z'),
      });

      let callCount = 0;
      taskRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        const qb = { ...mockQueryBuilder };
        if (callCount === 1) {
          qb.getMany = jest.fn().mockResolvedValue([task]);
        } else {
          qb.getMany = jest.fn().mockResolvedValue([]);
        }
        return qb as any;
      });

      await scheduler.checkDeadlines();

      expect(eventsGateway.emitToUser).not.toHaveBeenCalledWith(
        expect.anything(),
        'task:reminder',
        expect.anything(),
      );
      // But reminderSentAt should still be updated
      expect(taskRepository.save).toHaveBeenCalled();
    });
  });

  describe('sendOverdueNotifications (через checkDeadlines)', () => {
    it('должен отправить overdue notification для просроченной задачи', async () => {
      const overdueTask = createMockTask({
        id: 'task-overdue',
        assigneeId: 'user-1',
        dueDate: new Date('2026-02-09T11:00:00Z'), // 1 час назад
        overdueSentAt: null,
      });

      let callCount = 0;
      taskRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        const qb = { ...mockQueryBuilder };
        if (callCount === 1) {
          // Reminders query — empty
          qb.getMany = jest.fn().mockResolvedValue([]);
        } else {
          // Overdue query
          qb.getMany = jest.fn().mockResolvedValue([overdueTask]);
        }
        return qb as any;
      });

      await scheduler.checkDeadlines();

      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'task:overdue',
        expect.objectContaining({
          taskId: 'task-overdue',
          taskName: 'Обработать заявку',
        }),
      );
    });

    it('должен обрабатывать несколько просроченных задач', async () => {
      const tasks = [
        createMockTask({ id: 'overdue-1', assigneeId: 'user-1', dueDate: new Date('2026-02-09T10:00:00Z') }),
        createMockTask({ id: 'overdue-2', assigneeId: 'user-2', dueDate: new Date('2026-02-09T11:00:00Z') }),
      ];

      let callCount = 0;
      taskRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        const qb = { ...mockQueryBuilder };
        if (callCount === 1) {
          qb.getMany = jest.fn().mockResolvedValue([]);
        } else {
          qb.getMany = jest.fn().mockResolvedValue(tasks);
        }
        return qb as any;
      });

      await scheduler.checkDeadlines();

      expect(eventsGateway.emitToUser).toHaveBeenCalledTimes(2);
      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        'user-1',
        'task:overdue',
        expect.objectContaining({ taskId: 'overdue-1' }),
      );
      expect(eventsGateway.emitToUser).toHaveBeenCalledWith(
        'user-2',
        'task:overdue',
        expect.objectContaining({ taskId: 'overdue-2' }),
      );
    });
  });

  describe('getNotificationTargets', () => {
    it('должен возвращать assigneeId если назначен', () => {
      const task = createMockTask({ assigneeId: 'user-1' });

      const targets = (scheduler as any).getNotificationTargets(task);

      expect(targets).toEqual(['user-1']);
    });

    it('должен возвращать candidateUsers если нет assignee', () => {
      const task = createMockTask({
        assigneeId: null,
        candidateUsers: ['user-2', 'user-3'],
      });

      const targets = (scheduler as any).getNotificationTargets(task);

      expect(targets).toEqual(['user-2', 'user-3']);
    });

    it('должен возвращать пустой массив если нет ни assignee ни candidates', () => {
      const task = createMockTask({
        assigneeId: null,
        candidateUsers: null,
      });

      const targets = (scheduler as any).getNotificationTargets(task);

      expect(targets).toEqual([]);
    });

    it('должен возвращать пустой массив если candidateUsers пустой массив', () => {
      const task = createMockTask({
        assigneeId: null,
        candidateUsers: [],
      });

      const targets = (scheduler as any).getNotificationTargets(task);

      expect(targets).toEqual([]);
    });
  });

  describe('обработка ошибок', () => {
    it('не должен падать если query выбрасывает ошибку', async () => {
      let callCount = 0;
      taskRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        const qb = { ...mockQueryBuilder };
        qb.getMany = jest.fn().mockRejectedValue(new Error('DB connection failed'));
        return qb as any;
      });

      // Should not throw
      await expect(scheduler.checkDeadlines()).resolves.toBeUndefined();
    });
  });
});
