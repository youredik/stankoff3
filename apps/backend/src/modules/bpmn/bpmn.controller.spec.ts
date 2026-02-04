import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BpmnController } from './bpmn.controller';
import { BpmnService } from './bpmn.service';
import { BpmnTemplatesService } from './bpmn-templates.service';
import { ProcessInstanceStatus } from './entities/process-instance.entity';

describe('BpmnController', () => {
  let controller: BpmnController;
  let bpmnService: any;
  let templatesService: any;

  const mockDefinition = {
    id: 'def-1',
    name: 'Test Process',
    processId: 'test-process',
    workspaceId: 'ws-1',
    bpmnXml: '<xml>...</xml>',
    version: 1,
    deployedAt: null as Date | null,
    isActive: true,
    createdAt: new Date(),
  };

  const mockInstance = {
    id: 'inst-1',
    definitionId: 'def-1',
    processInstanceKey: '12345',
    status: ProcessInstanceStatus.ACTIVE,
    entityId: 'entity-1',
    workspaceId: 'ws-1',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockBpmnService = {
      getHealth: jest.fn(),
      findAllDefinitions: jest.fn(),
      findDefinition: jest.fn(),
      createDefinition: jest.fn(),
      deployDefinition: jest.fn(),
      deleteDefinition: jest.fn(),
      findInstancesByWorkspace: jest.fn(),
      findInstancesByEntity: jest.fn(),
      startProcess: jest.fn(),
      cancelInstance: jest.fn(),
      sendMessage: jest.fn(),
      getDefinitionStatistics: jest.fn(),
      getWorkspaceStatistics: jest.fn(),
    };

    const mockTemplatesService = {
      getTemplatesList: jest.fn(),
      getTemplatesByCategory: jest.fn(),
      getCategories: jest.fn(),
      getTemplate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BpmnController],
      providers: [
        { provide: BpmnService, useValue: mockBpmnService },
        { provide: BpmnTemplatesService, useValue: mockTemplatesService },
      ],
    }).compile();

    controller = module.get<BpmnController>(BpmnController);
    bpmnService = module.get(BpmnService);
    templatesService = module.get(BpmnTemplatesService);
  });

  describe('getHealth', () => {
    it('должен вернуть статус здоровья', async () => {
      bpmnService.getHealth.mockResolvedValue({ connected: true, brokers: 1, partitions: 2 });

      const result = await controller.getHealth();

      expect(result.connected).toBe(true);
    });
  });

  describe('getDefinitions', () => {
    it('должен вернуть определения процессов для workspace', async () => {
      bpmnService.findAllDefinitions.mockResolvedValue([mockDefinition] as any);

      const result = await controller.getDefinitions('ws-1');

      expect(result).toEqual([mockDefinition]);
    });
  });

  describe('getDefinition', () => {
    it('должен вернуть определение процесса по id', async () => {
      bpmnService.findDefinition.mockResolvedValue(mockDefinition as any);

      const result = await controller.getDefinition('def-1');

      expect(result).toEqual(mockDefinition);
    });
  });

  describe('createDefinition', () => {
    it('должен создать определение процесса', async () => {
      bpmnService.createDefinition.mockResolvedValue(mockDefinition as any);

      const body = {
        name: 'Test Process',
        processId: 'test-process',
        bpmnXml: '<xml>...</xml>',
      };
      const req = { user: { id: 'user-1' } };

      const result = await controller.createDefinition('ws-1', body, req);

      expect(result).toEqual(mockDefinition);
      expect(bpmnService.createDefinition).toHaveBeenCalledWith('ws-1', body, 'user-1');
    });
  });

  describe('deployDefinition', () => {
    it('должен задеплоить определение', async () => {
      const deployed = { ...mockDefinition, deployedAt: new Date(), deployedKey: 'key-123' };
      bpmnService.deployDefinition.mockResolvedValue(deployed as any);

      const result = await controller.deployDefinition('def-1');

      expect(result.deployedAt).toBeDefined();
      expect(result.deployedKey).toBe('key-123');
    });
  });

  describe('getWorkspaceInstances', () => {
    it('должен вернуть инстансы для workspace', async () => {
      bpmnService.findInstancesByWorkspace.mockResolvedValue([mockInstance] as any);

      const result = await controller.getWorkspaceInstances('ws-1');

      expect(result).toEqual([mockInstance]);
    });
  });

  describe('getEntityInstances', () => {
    it('должен вернуть инстансы для entity', async () => {
      bpmnService.findInstancesByEntity.mockResolvedValue([mockInstance] as any);

      const result = await controller.getEntityInstances('entity-1');

      expect(result).toEqual([mockInstance]);
    });
  });

  describe('startInstance', () => {
    it('должен запустить процесс', async () => {
      bpmnService.startProcess.mockResolvedValue(mockInstance as any);

      const body = {
        definitionId: 'def-1',
        entityId: 'entity-1',
        businessKey: 'BK-1',
        variables: { key: 'value' },
      };
      const req = { user: { id: 'user-1' } };

      const result = await controller.startInstance(body, req);

      expect(result).toEqual(mockInstance);
      expect(bpmnService.startProcess).toHaveBeenCalledWith('def-1', { key: 'value' }, {
        entityId: 'entity-1',
        businessKey: 'BK-1',
        startedById: 'user-1',
      });
    });

    it('должен запустить процесс с пустыми variables', async () => {
      bpmnService.startProcess.mockResolvedValue(mockInstance as any);

      const body = { definitionId: 'def-1' };
      const req = { user: { id: 'user-1' } };

      await controller.startInstance(body, req);

      expect(bpmnService.startProcess).toHaveBeenCalledWith('def-1', {}, expect.any(Object));
    });
  });

  describe('getDefinitionStatistics', () => {
    it('должен вернуть статистику определения', async () => {
      const stats = { active: 5, completed: 10 };
      bpmnService.getDefinitionStatistics.mockResolvedValue(stats);

      const result = await controller.getDefinitionStatistics('def-1');

      expect(result).toEqual(stats);
    });
  });

  describe('getWorkspaceStatistics', () => {
    it('должен вернуть статистику workspace', async () => {
      const stats = { totalInstances: 15, activeInstances: 5 };
      bpmnService.getWorkspaceStatistics.mockResolvedValue(stats);

      const result = await controller.getWorkspaceStatistics('ws-1');

      expect(result).toEqual(stats);
    });
  });

  describe('sendMessage', () => {
    it('должен отправить сообщение', async () => {
      bpmnService.sendMessage.mockResolvedValue(undefined);

      const result = await controller.sendMessage('user-task-completed', {
        correlationKey: 'entity-1',
        variables: { approved: true },
      });

      expect(result).toEqual({ success: true });
    });
  });

  describe('cancelInstance', () => {
    it('должен отменить инстанс', async () => {
      bpmnService.cancelInstance.mockResolvedValue(undefined);

      const result = await controller.cancelInstance('12345');

      expect(result).toEqual({ success: true });
    });
  });

  describe('deleteDefinition', () => {
    it('должен удалить определение', async () => {
      bpmnService.deleteDefinition.mockResolvedValue(undefined);

      const result = await controller.deleteDefinition('def-1');

      expect(result).toEqual({ success: true });
    });
  });

  describe('getTemplates', () => {
    it('должен вернуть список шаблонов', async () => {
      const templates = [{ id: 'template-1', name: 'Basic' }];
      templatesService.getTemplatesList.mockReturnValue(templates as any);

      const result = await controller.getTemplates();

      expect(result).toEqual(templates);
    });

    it('должен вернуть шаблоны по категории', async () => {
      const templates = [{ id: 'template-1', name: 'Approval' }];
      templatesService.getTemplatesByCategory.mockReturnValue(templates as any);

      const result = await controller.getTemplates('approval');

      expect(result).toEqual(templates);
      expect(templatesService.getTemplatesByCategory).toHaveBeenCalledWith('approval');
    });
  });

  describe('getTemplateCategories', () => {
    it('должен вернуть категории шаблонов', async () => {
      const categories = ['basic', 'approval', 'notification'];
      templatesService.getCategories.mockReturnValue(categories);

      const result = await controller.getTemplateCategories();

      expect(result).toEqual(categories);
    });
  });

  describe('getTemplate', () => {
    it('должен вернуть шаблон по id', async () => {
      const template = { id: 'template-1', name: 'Basic', bpmnXml: '<xml>...</xml>' };
      templatesService.getTemplate.mockReturnValue(template as any);

      const result = await controller.getTemplate('template-1');

      expect(result).toEqual(template);
    });

    it('должен выбросить NotFoundException если шаблон не найден', async () => {
      templatesService.getTemplate.mockReturnValue(null);

      await expect(controller.getTemplate('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
