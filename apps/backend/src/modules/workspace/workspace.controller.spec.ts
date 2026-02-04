import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { User, UserRole } from '../user/user.entity';
import { WorkspaceRole } from './workspace-member.entity';

describe('WorkspaceController', () => {
  let controller: WorkspaceController;
  let workspaceService: jest.Mocked<WorkspaceService>;

  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashed',
    firstName: 'Test',
    lastName: 'User',
    avatar: null,
    department: null,
    role: UserRole.EMPLOYEE,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAdminUser: User = { ...mockUser, role: UserRole.ADMIN };

  const mockWorkspace = {
    id: 'ws-1',
    name: 'Test Workspace',
    prefix: 'TST',
    isArchived: false,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockWorkspaceService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      checkAccess: jest.fn(),
      getMyRoles: jest.fn(),
      getMembers: jest.fn(),
      addMember: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
      duplicate: jest.fn(),
      setArchived: jest.fn(),
      exportToJson: jest.fn(),
      exportToCsv: jest.fn(),
      importFromJson: jest.fn(),
      importFromCsv: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkspaceController],
      providers: [{ provide: WorkspaceService, useValue: mockWorkspaceService }],
    }).compile();

    controller = module.get<WorkspaceController>(WorkspaceController);
    workspaceService = module.get(WorkspaceService);
  });

  describe('findAll', () => {
    it('должен вернуть все доступные workspace', async () => {
      workspaceService.findAll.mockResolvedValue([mockWorkspace] as any);

      const result = await controller.findAll(mockUser);

      expect(result).toEqual([mockWorkspace]);
      expect(workspaceService.findAll).toHaveBeenCalledWith('user-1', UserRole.EMPLOYEE);
    });
  });

  describe('getMyRoles', () => {
    it('должен вернуть роли пользователя', async () => {
      const roles = { 'ws-1': WorkspaceRole.EDITOR };
      workspaceService.getMyRoles.mockResolvedValue(roles);

      const result = await controller.getMyRoles(mockUser);

      expect(result).toEqual(roles);
    });
  });

  describe('findOne', () => {
    it('должен вернуть workspace по id', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.VIEWER } as any);
      workspaceService.findOne.mockResolvedValue(mockWorkspace as any);

      const result = await controller.findOne('ws-1', mockUser);

      expect(result).toEqual(mockWorkspace);
    });

    it('должен выбросить ForbiddenException при отсутствии доступа', async () => {
      workspaceService.checkAccess.mockResolvedValue(null);

      await expect(controller.findOne('ws-1', mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('должен создать workspace', async () => {
      workspaceService.create.mockResolvedValue(mockWorkspace as any);

      const result = await controller.create({ name: 'New Workspace' }, mockAdminUser);

      expect(result).toEqual(mockWorkspace);
      expect(workspaceService.create).toHaveBeenCalledWith({ name: 'New Workspace' }, 'user-1');
    });
  });

  describe('update', () => {
    it('должен обновить workspace', async () => {
      const updated = { ...mockWorkspace, name: 'Updated' };
      workspaceService.update.mockResolvedValue(updated as any);

      const result = await controller.update('ws-1', { name: 'Updated' });

      expect(result).toEqual(updated);
    });
  });

  describe('remove', () => {
    it('должен удалить workspace', async () => {
      workspaceService.remove.mockResolvedValue(undefined);

      await controller.remove('ws-1');

      expect(workspaceService.remove).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('getMyRole', () => {
    it('должен вернуть роль пользователя в workspace', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.EDITOR } as any);

      const result = await controller.getMyRole('ws-1', mockUser);

      expect(result).toEqual({ role: WorkspaceRole.EDITOR });
    });

    it('должен вернуть null если нет доступа', async () => {
      workspaceService.checkAccess.mockResolvedValue(null);

      const result = await controller.getMyRole('ws-1', mockUser);

      expect(result).toEqual({ role: null });
    });
  });

  describe('getMembers', () => {
    it('должен вернуть участников workspace', async () => {
      const members = [{ userId: 'user-1', role: WorkspaceRole.ADMIN }];
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.VIEWER } as any);
      workspaceService.getMembers.mockResolvedValue(members as any);

      const result = await controller.getMembers('ws-1', mockUser);

      expect(result).toEqual(members);
    });

    it('должен выбросить ForbiddenException при отсутствии доступа', async () => {
      workspaceService.checkAccess.mockResolvedValue(null);

      await expect(controller.getMembers('ws-1', mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addMember', () => {
    it('должен добавить участника', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      workspaceService.addMember.mockResolvedValue({ userId: 'user-2', role: WorkspaceRole.EDITOR } as any);

      const result = await controller.addMember('ws-1', { userId: 'user-2', role: WorkspaceRole.EDITOR }, mockUser);

      expect(result.userId).toBe('user-2');
    });

    it('должен выбросить ForbiddenException без прав ADMIN', async () => {
      workspaceService.checkAccess.mockResolvedValue(null);

      await expect(
        controller.addMember('ws-1', { userId: 'user-2' }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateMemberRole', () => {
    it('должен обновить роль участника', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      workspaceService.updateMemberRole.mockResolvedValue({ userId: 'user-2', role: WorkspaceRole.VIEWER } as any);

      const result = await controller.updateMemberRole('ws-1', 'user-2', { role: WorkspaceRole.VIEWER }, mockUser);

      expect(result.role).toBe(WorkspaceRole.VIEWER);
    });
  });

  describe('removeMember', () => {
    it('должен удалить участника', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      workspaceService.removeMember.mockResolvedValue(undefined);

      await controller.removeMember('ws-1', 'user-2', mockUser);

      expect(workspaceService.removeMember).toHaveBeenCalledWith('ws-1', 'user-2');
    });
  });

  describe('duplicate', () => {
    it('должен дублировать workspace', async () => {
      const duplicated = { ...mockWorkspace, id: 'ws-2', name: 'Copy' };
      workspaceService.duplicate.mockResolvedValue(duplicated as any);

      const result = await controller.duplicate('ws-1', { name: 'Copy' }, mockAdminUser);

      expect(result).toEqual(duplicated);
    });
  });

  describe('setArchived', () => {
    it('должен архивировать workspace', async () => {
      const archived = { ...mockWorkspace, isArchived: true };
      workspaceService.setArchived.mockResolvedValue(archived as any);

      const result = await controller.setArchived('ws-1', { isArchived: true });

      expect(result.isArchived).toBe(true);
    });
  });

  describe('exportJson', () => {
    it('должен экспортировать в JSON', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      workspaceService.exportToJson.mockResolvedValue({
        workspace: mockWorkspace as any,
        entities: [],
        exportedAt: new Date().toISOString(),
      });

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportJson('ws-1', mockUser, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockRes.send).toHaveBeenCalled();
    });

    it('должен выбросить ForbiddenException без прав ADMIN', async () => {
      workspaceService.checkAccess.mockResolvedValue(null);

      const mockRes = {} as Response;

      await expect(controller.exportJson('ws-1', mockUser, mockRes)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('exportCsv', () => {
    it('должен экспортировать в CSV', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      workspaceService.findOne.mockResolvedValue(mockWorkspace as any);
      workspaceService.exportToCsv.mockResolvedValue('id,title\n1,Test');

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.exportCsv('ws-1', mockUser, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    });

    it('должен выбросить NotFoundException если workspace не найден', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      workspaceService.findOne.mockResolvedValue(null);

      const mockRes = {} as Response;

      await expect(controller.exportCsv('ws-1', mockUser, mockRes)).rejects.toThrow(NotFoundException);
    });
  });

  describe('importJson', () => {
    it('должен импортировать из JSON', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      workspaceService.importFromJson.mockResolvedValue({ imported: 5, errors: [] });

      const result = await controller.importJson('ws-1', { entities: [] }, mockUser);

      expect(result).toEqual({ imported: 5, errors: [] });
    });
  });

  describe('importCsv', () => {
    it('должен импортировать из CSV', async () => {
      workspaceService.checkAccess.mockResolvedValue({ role: WorkspaceRole.ADMIN } as any);
      workspaceService.importFromCsv.mockResolvedValue({ imported: 3, errors: [] });

      const result = await controller.importCsv('ws-1', { csv: 'id,title' }, mockUser);

      expect(result).toEqual({ imported: 3, errors: [] });
    });

    it('должен выбросить ForbiddenException без прав', async () => {
      workspaceService.checkAccess.mockResolvedValue(null);

      await expect(controller.importCsv('ws-1', { csv: 'test' }, mockUser)).rejects.toThrow(ForbiddenException);
    });
  });
});
