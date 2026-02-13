import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { EntityController } from './entity.controller';
import { EntityService } from './entity.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { User, UserRole } from '../user/user.entity';
import { WorkspaceRole } from '../workspace/workspace-member.entity';

describe('EntityController', () => {
  let controller: EntityController;
  let entityService: any;
  let workspaceService: any;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashed',
    firstName: 'Test',
    lastName: 'User',
    avatar: null,
    department: null,
    role: UserRole.EMPLOYEE,
    roleId: null,
    globalRole: null as any,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEntity = {
    id: 'entity-1',
    customId: 'TST-1',
    title: 'Test Entity',
    workspaceId: 'ws-1',
    status: 'new',
    priority: 'medium',
    assignee: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockEntityService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      updateAssignee: jest.fn(),
      remove: jest.fn(),
      removeTestData: jest.fn(),
      search: jest.fn(),
      findForTable: jest.fn(),
      exportToCsv: jest.fn(),
      exportToJson: jest.fn(),
      importFromCsv: jest.fn(),
    };

    const mockWorkspaceService = {
      checkAccess: jest.fn(),
      getAccessibleWorkspaces: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntityController],
      providers: [
        { provide: EntityService, useValue: mockEntityService },
        { provide: WorkspaceService, useValue: mockWorkspaceService },
      ],
    }).compile();

    controller = module.get<EntityController>(EntityController);
    entityService = module.get(EntityService);
    workspaceService = module.get(WorkspaceService);
  });

  describe('findAll', () => {
    it('должен вернуть все entities для workspace', async () => {
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.findAll.mockResolvedValue([mockEntity] as any);

      const result = await controller.findAll('ws-1', mockUser);

      expect(result).toEqual([mockEntity]);
      expect(workspaceService.checkAccess).toHaveBeenCalledWith('ws-1', 'user-1', UserRole.EMPLOYEE);
    });

    it('должен выбросить ForbiddenException при отсутствии доступа', async () => {
      workspaceService.checkAccess.mockResolvedValue(false);

      await expect(controller.findAll('ws-1', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('должен вернуть все entities без проверки если workspaceId не указан', async () => {
      entityService.findAll.mockResolvedValue([mockEntity] as any);

      const result = await controller.findAll(undefined as any, mockUser);

      expect(result).toEqual([mockEntity]);
      expect(workspaceService.checkAccess).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('должен вернуть entity по id', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);

      const result = await controller.findOne('entity-1', mockUser);

      expect(result).toEqual(mockEntity);
    });

    it('должен выбросить ForbiddenException при отсутствии доступа', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(false);

      await expect(controller.findOne('entity-1', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('должен вернуть undefined если entity не найден', async () => {
      entityService.findOne.mockResolvedValue(null);

      const result = await controller.findOne('non-existent', mockUser);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    const createDto = {
      title: 'New Entity',
      workspaceId: 'ws-1',
    };

    it('должен создать entity', async () => {
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.create.mockResolvedValue(mockEntity as any);

      const result = await controller.create(createDto as any, mockUser);

      expect(result).toEqual(mockEntity);
      expect(workspaceService.checkAccess).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        UserRole.EMPLOYEE,
        WorkspaceRole.EDITOR,
      );
    });

    it('должен выбросить ForbiddenException при отсутствии прав EDITOR', async () => {
      workspaceService.checkAccess.mockResolvedValue(false);

      await expect(controller.create(createDto as any, mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    const updateDto = { title: 'Updated Title' };

    it('должен обновить entity', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.update.mockResolvedValue({ ...mockEntity, title: 'Updated Title' } as any);

      const result = await controller.update('entity-1', updateDto as any, mockUser);

      expect(result.title).toBe('Updated Title');
    });

    it('должен выбросить ForbiddenException если entity не найден', async () => {
      entityService.findOne.mockResolvedValue(null);

      await expect(controller.update('non-existent', updateDto as any, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('должен выбросить ForbiddenException при отсутствии прав', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(false);

      await expect(controller.update('entity-1', updateDto as any, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateStatus', () => {
    it('должен обновить статус', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.updateStatus.mockResolvedValue({ ...mockEntity, status: 'in_progress' } as any);

      const result = await controller.updateStatus('entity-1', { status: 'in_progress' }, mockUser);

      expect(result.status).toBe('in_progress');
    });

    it('должен выбросить ForbiddenException если entity не найден', async () => {
      entityService.findOne.mockResolvedValue(null);

      await expect(
        controller.updateStatus('non-existent', { status: 'done' }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateAssignee', () => {
    it('должен назначить исполнителя', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.updateAssignee.mockResolvedValue({ ...mockEntity, assigneeId: 'user-2' } as any);

      const result = await controller.updateAssignee('entity-1', { assigneeId: 'user-2' }, mockUser);

      expect(result.assigneeId).toBe('user-2');
    });

    it('должен снять исполнителя', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.updateAssignee.mockResolvedValue({ ...mockEntity, assigneeId: null } as any);

      const result = await controller.updateAssignee('entity-1', { assigneeId: null }, mockUser);

      expect(result.assigneeId).toBeNull();
    });
  });

  describe('remove', () => {
    it('должен удалить entity', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.remove.mockResolvedValue(undefined);

      await controller.remove('entity-1', mockUser);

      expect(entityService.remove).toHaveBeenCalledWith('entity-1', 'user-1');
    });

    it('должен требовать ADMIN роль в workspace', async () => {
      entityService.findOne.mockResolvedValue(mockEntity as any);
      workspaceService.checkAccess.mockResolvedValue(true);

      await controller.remove('entity-1', mockUser);

      expect(workspaceService.checkAccess).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        UserRole.EMPLOYEE,
        WorkspaceRole.ADMIN,
      );
    });
  });

  describe('removeTestData', () => {
    it('должен удалить тестовые данные', async () => {
      entityService.removeTestData.mockResolvedValue({ deleted: 5 });

      const result = await controller.removeTestData();

      expect(result).toEqual({ deleted: 5 });
    });
  });

  describe('search', () => {
    it('должен вернуть результаты поиска', async () => {
      workspaceService.getAccessibleWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Test' }] as any);
      entityService.search.mockResolvedValue({
        entities: [mockEntity] as any,
        workspaces: new Map([['ws-1', { name: 'Test', icon: '📁' }]]),
      });

      const result = await controller.search('test', '10', undefined as any, mockUser);

      expect(result.results).toHaveLength(1);
      expect(result.results[0].workspaceName).toBe('Test');
    });

    it('должен вернуть пустой массив для короткого запроса', async () => {
      const result = await controller.search('a', '10', undefined as any, mockUser);

      expect(result.results).toEqual([]);
    });

    it('должен вернуть пустой массив если нет доступных workspaces', async () => {
      workspaceService.getAccessibleWorkspaces.mockResolvedValue([]);

      const result = await controller.search('test', '10', undefined as any, mockUser);

      expect(result.results).toEqual([]);
    });
  });

  describe('findForTable', () => {
    it('должен вернуть табличные данные', async () => {
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.findForTable.mockResolvedValue({
        items: [mockEntity],
        total: 1,
        page: 1,
        perPage: 25,
        totalPages: 1,
      });

      const result = await controller.findForTable(
        { workspaceId: 'ws-1' } as any,
        mockUser,
      );

      expect(result.items).toEqual([mockEntity]);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('должен выбросить ForbiddenException при отсутствии доступа', async () => {
      workspaceService.checkAccess.mockResolvedValue(false);

      await expect(
        controller.findForTable({ workspaceId: 'ws-1' } as any, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен передать query параметры в сервис', async () => {
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.findForTable.mockResolvedValue({
        items: [],
        total: 0,
        page: 2,
        perPage: 10,
        totalPages: 0,
      });

      const query = {
        workspaceId: 'ws-1',
        page: 2,
        perPage: 10,
        sortBy: 'title',
        sortOrder: 'ASC' as const,
      };
      await controller.findForTable(query as any, mockUser);

      expect(entityService.findForTable).toHaveBeenCalledWith(query);
    });
  });

  describe('exportToCsv', () => {
    it('должен экспортировать в CSV', async () => {
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.exportToCsv.mockResolvedValue('id,title\n1,Test');

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportToCsv('ws-1', mockUser, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('должен выбросить ForbiddenException без workspaceId', async () => {
      const mockRes = {} as Response;

      await expect(controller.exportToCsv('', mockUser, mockRes)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('exportToJson', () => {
    it('должен экспортировать в JSON', async () => {
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.exportToJson.mockResolvedValue([mockEntity]);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportToJson('ws-1', mockUser, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
      expect(mockRes.send).toHaveBeenCalled();
    });
  });

  describe('importFromCsv', () => {
    it('должен импортировать из CSV', async () => {
      workspaceService.checkAccess.mockResolvedValue(true);
      entityService.importFromCsv.mockResolvedValue({ imported: 5 });

      const mockFile = {
        buffer: Buffer.from('id,title\n1,Test'),
      } as Express.Multer.File;

      const result = await controller.importFromCsv('ws-1', mockFile, mockUser);

      expect(result).toEqual({ imported: 5 });
    });

    it('должен выбросить ForbiddenException без файла', async () => {
      workspaceService.checkAccess.mockResolvedValue(true);

      await expect(controller.importFromCsv('ws-1', undefined as any, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('должен выбросить ForbiddenException без workspaceId', async () => {
      const mockFile = { buffer: Buffer.from('test') } as Express.Multer.File;

      await expect(controller.importFromCsv('', mockFile, mockUser)).rejects.toThrow(ForbiddenException);
    });
  });
});
