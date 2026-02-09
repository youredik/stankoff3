import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserTasksService } from './user-tasks.service';
import {
  UserTask,
  UserTaskStatus,
  UserTaskComment,
} from '../entities/user-task.entity';
import { UserGroup } from '../entities/user-group.entity';
import { FormDefinition } from '../entities/form-definition.entity';
import { BpmnWorkersService } from '../bpmn-workers.service';
import { EventsGateway } from '../../websocket/events.gateway';

describe('UserTasksService', () => {
  let service: UserTasksService;
  let taskRepository: jest.Mocked<Repository<UserTask>>;
  let commentRepository: jest.Mocked<Repository<UserTaskComment>>;
  let groupRepository: jest.Mocked<Repository<UserGroup>>;
  let formRepository: jest.Mocked<Repository<FormDefinition>>;
  let bpmnWorkersService: jest.Mocked<BpmnWorkersService>;
  let eventsGateway: jest.Mocked<EventsGateway>;

  const mockTask: UserTask = {
    id: 'task-1',
    processInstanceId: 'process-1',
    processInstance: null as any,
    workspaceId: 'ws-1',
    workspace: null as any,
    entityId: 'entity-1',
    entity: null,
    jobKey: 'job-key-1',
    elementId: 'Activity_1',
    elementName: 'Approve Request',
    taskType: 'approval',
    formKey: null,
    formSchema: null,
    formData: {},
    assigneeId: null,
    assignee: null as any,
    assigneeEmail: null,
    candidateGroups: ['managers'],
    candidateUsers: [],
    dueDate: null,
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
  };

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
    getOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTasksService,
        {
          provide: getRepositoryToken(UserTask),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(UserTaskComment),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserGroup),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(FormDefinition),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: BpmnWorkersService,
          useValue: {
            completeUserTaskJob: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EventsGateway,
          useValue: {
            emitTaskCreated: jest.fn(),
            emitTaskUpdated: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((fn) => fn({
              find: jest.fn().mockResolvedValue([]),
              save: jest.fn(),
            })),
          },
        },
      ],
    }).compile();

    service = module.get<UserTasksService>(UserTasksService);
    taskRepository = module.get(getRepositoryToken(UserTask));
    commentRepository = module.get(getRepositoryToken(UserTaskComment));
    groupRepository = module.get(getRepositoryToken(UserGroup));
    formRepository = module.get(getRepositoryToken(FormDefinition));
    bpmnWorkersService = module.get(BpmnWorkersService);
    eventsGateway = module.get(EventsGateway);
  });

  describe('findOne', () => {
    it('должен возвращать задачу по ID', async () => {
      taskRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findOne('task-1');

      expect(result.id).toBe('task-1');
      expect(taskRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        relations: ['assignee', 'entity', 'processInstance', 'processInstance.processDefinition'],
      });
    });

    it('должен выбрасывать NotFoundException если задача не найдена', async () => {
      taskRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(NotFoundException);
    });

    it('должен загружать form definition если указан formKey', async () => {
      const taskWithForm = { ...mockTask, formKey: 'approval-form' };
      taskRepository.findOne.mockResolvedValue(taskWithForm);
      formRepository.findOne.mockResolvedValue({
        id: 'form-1',
        key: 'approval-form',
        name: 'Approval Form',
        schema: { type: 'object', properties: {} },
      } as FormDefinition);

      const result = await service.findOne('task-1');

      expect(result.formDefinition).toBeDefined();
      expect(result.formDefinition?.key).toBe('approval-form');
    });
  });

  describe('findByJobKey', () => {
    it('должен находить задачу по Zeebe job key', async () => {
      taskRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.findByJobKey('job-key-1');

      expect(result).toEqual(mockTask);
      expect(taskRepository.findOne).toHaveBeenCalledWith({
        where: { jobKey: 'job-key-1' },
        relations: ['assignee', 'entity'],
      });
    });
  });

  describe('claim', () => {
    it('должен позволять claim если пользователь в candidateGroups', async () => {
      taskRepository.findOne.mockResolvedValue(mockTask);
      mockQueryBuilder.getMany.mockResolvedValue([{ id: 'group-1', name: 'managers' }]);
      taskRepository.save.mockImplementation(async (t) => t as UserTask);

      const result = await service.claim('task-1', 'user-1');

      expect(result.assigneeId).toBe('user-1');
      expect(result.status).toBe(UserTaskStatus.CLAIMED);
      expect(result.claimedAt).toBeDefined();
      expect(eventsGateway.emitTaskUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-1', status: UserTaskStatus.CLAIMED }),
      );
    });

    it('должен выбрасывать BadRequestException если задача уже claimed', async () => {
      const claimedTask = { ...mockTask, status: UserTaskStatus.CLAIMED, assigneeId: 'other-user' };
      taskRepository.findOne.mockResolvedValue(claimedTask);

      await expect(service.claim('task-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('должен выбрасывать ForbiddenException если пользователь не кандидат', async () => {
      const taskWithNoAccess = { ...mockTask, candidateGroups: ['admins'], candidateUsers: ['other-user'] };
      taskRepository.findOne.mockResolvedValue(taskWithNoAccess);
      mockQueryBuilder.getMany.mockResolvedValue([{ id: 'group-1', name: 'managers' }]);

      await expect(service.claim('task-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unclaim', () => {
    it('должен позволять unclaim своей задачи', async () => {
      const claimedTask = { ...mockTask, status: UserTaskStatus.CLAIMED, assigneeId: 'user-1' };
      taskRepository.findOne.mockResolvedValue(claimedTask);
      taskRepository.save.mockImplementation(async (t) => t as UserTask);

      const result = await service.unclaim('task-1', 'user-1');

      expect(result.assigneeId).toBeNull();
      expect(result.status).toBe(UserTaskStatus.CREATED);
      expect(eventsGateway.emitTaskUpdated).toHaveBeenCalled();
    });

    it('должен выбрасывать ForbiddenException если не своя задача', async () => {
      const claimedTask = { ...mockTask, status: UserTaskStatus.CLAIMED, assigneeId: 'other-user' };
      taskRepository.findOne.mockResolvedValue(claimedTask);

      await expect(service.unclaim('task-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('complete', () => {
    it('должен завершать задачу с form data и вызывать completeUserTaskJob', async () => {
      const claimedTask = { ...mockTask, status: UserTaskStatus.CLAIMED, assigneeId: 'user-1' };
      taskRepository.findOne.mockResolvedValue(claimedTask);
      taskRepository.save.mockImplementation(async (t) => t as UserTask);

      const result = await service.complete('task-1', 'user-1', { approved: true });

      expect(result.status).toBe(UserTaskStatus.COMPLETED);
      expect(result.completedAt).toBeDefined();
      expect(result.completedById).toBe('user-1');
      expect(result.formData).toEqual({ approved: true });
      expect(bpmnWorkersService.completeUserTaskJob).toHaveBeenCalledWith(
        'job-key-1',
        { approved: true },
      );
      expect(eventsGateway.emitTaskUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserTaskStatus.COMPLETED }),
      );
    });

    it('должен выбрасывать ForbiddenException если не assignee', async () => {
      const claimedTask = { ...mockTask, status: UserTaskStatus.CLAIMED, assigneeId: 'other-user' };
      taskRepository.findOne.mockResolvedValue(claimedTask);

      await expect(service.complete('task-1', 'user-1', {})).rejects.toThrow(ForbiddenException);
    });

    it('должен выбрасывать BadRequestException если уже завершена', async () => {
      const completedTask = { ...mockTask, status: UserTaskStatus.COMPLETED, assigneeId: 'user-1' };
      taskRepository.findOne.mockResolvedValue(completedTask);

      await expect(service.complete('task-1', 'user-1', {})).rejects.toThrow(BadRequestException);
    });

    it('должен работать даже если completeUserTaskJob вернул false', async () => {
      bpmnWorkersService.completeUserTaskJob.mockResolvedValue(false);
      const claimedTask = { ...mockTask, status: UserTaskStatus.CLAIMED, assigneeId: 'user-1' };
      taskRepository.findOne.mockResolvedValue(claimedTask);
      taskRepository.save.mockImplementation(async (t) => t as UserTask);

      const result = await service.complete('task-1', 'user-1', { resolved: true });

      // Задача всё равно завершена в БД
      expect(result.status).toBe(UserTaskStatus.COMPLETED);
      bpmnWorkersService.completeUserTaskJob.mockResolvedValue(true);
    });
  });

  describe('delegate', () => {
    it('должен делегировать задачу другому пользователю', async () => {
      const claimedTask = { ...mockTask, status: UserTaskStatus.CLAIMED, assigneeId: 'user-1', history: [] };
      taskRepository.findOne.mockResolvedValue(claimedTask);
      taskRepository.save.mockImplementation(async (t) => t as UserTask);

      const result = await service.delegate('task-1', 'user-1', 'user-2');

      expect(result.assigneeId).toBe('user-2');
      expect(result.status).toBe(UserTaskStatus.DELEGATED);
      expect(result.history).toHaveLength(1);
      expect(result.history[0].action).toBe('delegated');
      expect(eventsGateway.emitTaskUpdated).toHaveBeenCalled();
    });

    it('должен выбрасывать ForbiddenException если не assignee', async () => {
      const claimedTask = { ...mockTask, status: UserTaskStatus.CLAIMED, assigneeId: 'other-user' };
      taskRepository.findOne.mockResolvedValue(claimedTask);

      await expect(service.delegate('task-1', 'user-1', 'user-2')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createFromZeebe', () => {
    it('должен создавать задачу из Zeebe job', async () => {
      taskRepository.findOne.mockResolvedValue(null);
      taskRepository.create.mockReturnValue(mockTask);
      taskRepository.save.mockResolvedValue(mockTask);

      const result = await service.createFromZeebe({
        jobKey: 'job-key-1',
        processInstanceId: 'process-1',
        elementId: 'Activity_1',
        workspaceId: 'ws-1',
        entityId: 'entity-1',
      });

      expect(result).toEqual(mockTask);
      expect(taskRepository.create).toHaveBeenCalled();
      expect(eventsGateway.emitTaskCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-1', workspaceId: 'ws-1' }),
      );
    });

    it('должен возвращать существующую задачу если уже есть с таким jobKey', async () => {
      taskRepository.findOne.mockResolvedValue(mockTask);

      const result = await service.createFromZeebe({
        jobKey: 'job-key-1',
        processInstanceId: 'process-1',
        elementId: 'Activity_1',
        workspaceId: 'ws-1',
      });

      expect(result).toEqual(mockTask);
      expect(taskRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('должен отменять задачу', async () => {
      taskRepository.findOne.mockResolvedValue(mockTask);
      taskRepository.save.mockImplementation(async (t) => t as UserTask);

      const result = await service.cancel('task-1', 'Process cancelled');

      expect(result.status).toBe(UserTaskStatus.CANCELLED);
      expect(result.processVariables.cancellationReason).toBe('Process cancelled');
      expect(eventsGateway.emitTaskUpdated).toHaveBeenCalled();
    });

    it('должен выбрасывать NotFoundException если задача не найдена', async () => {
      taskRepository.findOne.mockResolvedValue(null);

      await expect(service.cancel('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addComment', () => {
    it('должен добавлять комментарий к задаче', async () => {
      taskRepository.findOne.mockResolvedValue(mockTask);
      const mockComment = { id: 'comment-1', taskId: 'task-1', userId: 'user-1', content: 'Test' };
      commentRepository.create.mockReturnValue(mockComment as UserTaskComment);
      commentRepository.save.mockResolvedValue(mockComment as UserTaskComment);

      const result = await service.addComment('task-1', 'user-1', 'Test');

      expect(result.content).toBe('Test');
      expect(commentRepository.create).toHaveBeenCalledWith({
        taskId: 'task-1',
        userId: 'user-1',
        content: 'Test',
      });
    });
  });

  describe('getComments', () => {
    it('должен возвращать комментарии задачи', async () => {
      const comments = [{ id: 'c1', content: 'Comment 1' }] as UserTaskComment[];
      commentRepository.find.mockResolvedValue(comments);

      const result = await service.getComments('task-1');

      expect(result).toEqual(comments);
      expect(commentRepository.find).toHaveBeenCalledWith({
        where: { taskId: 'task-1' },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('findTasks', () => {
    it('должен фильтровать задачи по workspace и возвращать пагинированный результат', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockTask], 1]);

      const result = await service.findTasks({ workspaceId: 'ws-1' });

      expect(result.items).toEqual([mockTask]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.workspaceId = :workspaceId',
        { workspaceId: 'ws-1' },
      );
    });

    it('должен фильтровать по нескольким статусам', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockTask], 1]);

      await service.findTasks({
        status: [UserTaskStatus.CREATED, UserTaskStatus.CLAIMED],
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'task.status IN (:...statuses)',
        { statuses: [UserTaskStatus.CREATED, UserTaskStatus.CLAIMED] },
      );
    });

    it('должен поддерживать пагинацию', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockTask], 50]);

      const result = await service.findTasks({}, { page: 3, perPage: 10 });

      expect(result.page).toBe(3);
      expect(result.perPage).toBe(10);
      expect(result.totalPages).toBe(5);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });
  });
});
