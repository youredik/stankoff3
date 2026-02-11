import { Test, TestingModule } from '@nestjs/testing';
import { UserTasksWorker } from './user-tasks.worker';
import { UserTasksService } from './user-tasks.service';
import { BpmnService } from '../bpmn.service';

describe('UserTasksWorker', () => {
  let worker: UserTasksWorker;
  let tasksService: jest.Mocked<UserTasksService>;
  let bpmnService: jest.Mocked<BpmnService>;

  const mockJob = {
    key: '12345',
    type: 'io.camunda.zeebe:userTask',
    processInstanceKey: '67890',
    processDefinitionKey: '11111',
    bpmnProcessId: 'claims-management',
    elementId: 'Task_Register',
    variables: {
      workspaceId: 'ws-1',
      entityId: 'entity-1',
    },
    customHeaders: {},
  };

  beforeEach(async () => {
    const mockTasksService = {
      createFromZeebe: jest.fn().mockResolvedValue({ id: 'task-1' }),
    };

    const mockBpmnService = {
      findInstanceByKey: jest.fn().mockResolvedValue({
        id: 'instance-uuid',
        processDefinitionId: 'def-1',
      }),
      getElementNameFromDefinition: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTasksWorker,
        { provide: UserTasksService, useValue: mockTasksService },
        { provide: BpmnService, useValue: mockBpmnService },
      ],
    }).compile();

    worker = module.get<UserTasksWorker>(UserTasksWorker);
    tasksService = module.get(UserTasksService);
    bpmnService = module.get(BpmnService);
  });

  describe('handleUserTask', () => {
    it('должен использовать headers.name если доступно', async () => {
      const job = {
        ...mockJob,
        customHeaders: { name: 'Ручное имя задачи' },
      };

      await worker.handleUserTask(job);

      expect(tasksService.createFromZeebe).toHaveBeenCalledWith(
        expect.objectContaining({
          elementName: 'Ручное имя задачи',
          elementId: 'Task_Register',
        }),
      );
    });

    it('должен извлечь имя из BPMN XML если headers.name отсутствует', async () => {
      bpmnService.getElementNameFromDefinition.mockResolvedValue('Регистрация рекламации');

      await worker.handleUserTask(mockJob);

      expect(bpmnService.getElementNameFromDefinition).toHaveBeenCalledWith('def-1', 'Task_Register');
      expect(tasksService.createFromZeebe).toHaveBeenCalledWith(
        expect.objectContaining({
          elementName: 'Регистрация рекламации',
          elementId: 'Task_Register',
        }),
      );
    });

    it('должен fallback на elementId если имя не найдено в XML', async () => {
      bpmnService.getElementNameFromDefinition.mockResolvedValue(null);

      await worker.handleUserTask(mockJob);

      expect(tasksService.createFromZeebe).toHaveBeenCalledWith(
        expect.objectContaining({
          elementName: 'Task_Register',
          elementId: 'Task_Register',
        }),
      );
    });

    it('должен fallback на elementId если process instance не найден', async () => {
      bpmnService.findInstanceByKey.mockResolvedValue(null);

      await worker.handleUserTask(mockJob);

      expect(tasksService.createFromZeebe).toHaveBeenCalledWith(
        expect.objectContaining({
          elementName: 'Task_Register',
        }),
      );
    });

    it('должен выбросить ошибку если workspaceId отсутствует', async () => {
      const job = {
        ...mockJob,
        variables: { entityId: 'entity-1' },
      };

      await expect(worker.handleUserTask(job)).rejects.toThrow(
        'workspaceId is required in process variables',
      );
    });

    it('должен передать правильные параметры в createFromZeebe', async () => {
      bpmnService.getElementNameFromDefinition.mockResolvedValue('Регистрация рекламации');

      const job = {
        ...mockJob,
        customHeaders: {
          'io.camunda.zeebe:candidateGroups': 'claims-specialists',
          'io.camunda.zeebe:formKey': 'camunda-forms:bpmn:register-form',
          'io.camunda.zeebe:taskType': 'review',
        },
      };

      await worker.handleUserTask(job);

      expect(tasksService.createFromZeebe).toHaveBeenCalledWith(
        expect.objectContaining({
          jobKey: '12345',
          processInstanceId: 'instance-uuid',
          elementId: 'Task_Register',
          elementName: 'Регистрация рекламации',
          workspaceId: 'ws-1',
          entityId: 'entity-1',
          taskType: 'review',
          formKey: 'camunda-forms:bpmn:register-form',
          candidateGroups: ['claims-specialists'],
        }),
      );
    });
  });
});
