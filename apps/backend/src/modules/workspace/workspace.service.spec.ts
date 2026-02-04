import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { Workspace } from './workspace.entity';
import { WorkspaceMember, WorkspaceRole } from './workspace-member.entity';
import { WorkspaceEntity } from '../entity/entity.entity';
import { UserRole } from '../user/user.entity';

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let workspaceRepo: jest.Mocked<Repository<Workspace>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let entityRepo: jest.Mocked<Repository<WorkspaceEntity>>;

  const mockWorkspace = {
    id: 'ws-1',
    name: 'Test Workspace',
    description: 'Test',
    prefix: 'TST',
    icon: '📦',
    ownerId: 'user-1',
    sections: [{ id: 'sec-1', name: 'Section 1', fields: [{ id: 'f-1', type: 'text', options: [] }] }],
    lastEntityNumber: 10,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Workspace;

  const mockMember = {
    id: 'member-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    role: WorkspaceRole.ADMIN,
    workspace: mockWorkspace,
    createdAt: new Date(),
  } as unknown as WorkspaceMember;

  const mockEntity = {
    id: 'entity-1',
    customId: 'TST-1',
    workspaceId: 'ws-1',
    title: 'Test Entity',
    status: 'new',
    assignee: { firstName: 'Test', lastName: 'User' },
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as WorkspaceEntity;

  beforeEach(async () => {
    const mockWorkspaceRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const mockMemberRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const mockEntityRepo = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        { provide: getRepositoryToken(Workspace), useValue: mockWorkspaceRepo },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockMemberRepo },
        { provide: getRepositoryToken(WorkspaceEntity), useValue: mockEntityRepo },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
    workspaceRepo = module.get(getRepositoryToken(Workspace));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    entityRepo = module.get(getRepositoryToken(WorkspaceEntity));
  });

  describe('findAll', () => {
    it('должен вернуть все workspaces для admin', async () => {
      workspaceRepo.find.mockResolvedValue([mockWorkspace]);

      const result = await service.findAll('user-1', UserRole.ADMIN);

      expect(result).toEqual([mockWorkspace]);
      expect(workspaceRepo.find).toHaveBeenCalled();
    });

    it('должен вернуть только доступные workspaces для обычного пользователя', async () => {
      memberRepo.find.mockResolvedValue([mockMember]);

      const result = await service.findAll('user-2', UserRole.EMPLOYEE);

      expect(result).toEqual([mockWorkspace]);
      expect(memberRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-2' },
        relations: ['workspace', 'workspace.section'],
      });
    });
  });

  describe('findOne', () => {
    it('должен вернуть workspace по ID', async () => {
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);

      const result = await service.findOne('ws-1');

      expect(result).toEqual(mockWorkspace);
    });

    it('должен вернуть null если workspace не найден', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('checkAccess', () => {
    it('должен вернуть admin role для глобального admin', async () => {
      const result = await service.checkAccess('ws-1', 'user-1', UserRole.ADMIN);

      expect(result?.role).toBe(WorkspaceRole.ADMIN);
    });

    it('должен вернуть membership для обычного пользователя', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember);

      const result = await service.checkAccess('ws-1', 'user-1', UserRole.EMPLOYEE);

      expect(result).toEqual(mockMember);
    });

    it('должен вернуть null если нет доступа', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      const result = await service.checkAccess('ws-1', 'user-2', UserRole.EMPLOYEE);

      expect(result).toBeNull();
    });

    it('должен проверить минимальную роль', async () => {
      const viewerMember = { ...mockMember, role: WorkspaceRole.VIEWER };
      memberRepo.findOne.mockResolvedValue(viewerMember as any);

      const result = await service.checkAccess('ws-1', 'user-1', UserRole.EMPLOYEE, WorkspaceRole.EDITOR);

      expect(result).toBeNull();
    });

    it('должен разрешить доступ если роль достаточна', async () => {
      const editorMember = { ...mockMember, role: WorkspaceRole.EDITOR };
      memberRepo.findOne.mockResolvedValue(editorMember as any);

      const result = await service.checkAccess('ws-1', 'user-1', UserRole.EMPLOYEE, WorkspaceRole.VIEWER);

      expect(result).toEqual(editorMember);
    });
  });

  describe('create', () => {
    it('должен создать workspace и добавить создателя как admin', async () => {
      workspaceRepo.create.mockReturnValue(mockWorkspace);
      workspaceRepo.save.mockResolvedValue(mockWorkspace);
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);
      memberRepo.findOne.mockResolvedValue(null);
      memberRepo.create.mockReturnValue(mockMember);
      memberRepo.save.mockResolvedValue(mockMember);

      const result = await service.create({ name: 'New Workspace', prefix: 'NEW' }, 'user-1');

      expect(result).toEqual(mockWorkspace);
      expect(memberRepo.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('должен обновить workspace', async () => {
      workspaceRepo.update.mockResolvedValue({ affected: 1 } as any);
      workspaceRepo.findOne.mockResolvedValue({ ...mockWorkspace, name: 'Updated' } as any);

      const result = await service.update('ws-1', { name: 'Updated' });

      expect(result?.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('должен удалить workspace', async () => {
      workspaceRepo.delete.mockResolvedValue({ affected: 1 } as any);

      await service.remove('ws-1');

      expect(workspaceRepo.delete).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('getMyRoles', () => {
    it('должен вернуть admin роль во всех workspaces для глобального admin', async () => {
      workspaceRepo.find.mockResolvedValue([mockWorkspace]);

      const result = await service.getMyRoles('user-1', UserRole.ADMIN);

      expect(result['ws-1']).toBe(WorkspaceRole.ADMIN);
    });

    it('должен вернуть роли по membership для обычного пользователя', async () => {
      memberRepo.find.mockResolvedValue([mockMember]);

      const result = await service.getMyRoles('user-1', UserRole.EMPLOYEE);

      expect(result['ws-1']).toBe(WorkspaceRole.ADMIN);
    });
  });

  describe('getMembers', () => {
    it('должен вернуть список участников', async () => {
      memberRepo.find.mockResolvedValue([mockMember]);

      const result = await service.getMembers('ws-1');

      expect(result).toEqual([mockMember]);
    });
  });

  describe('addMember', () => {
    it('должен добавить нового участника', async () => {
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);
      memberRepo.findOne.mockResolvedValue(null);
      memberRepo.create.mockReturnValue(mockMember);
      memberRepo.save.mockResolvedValue(mockMember);

      const result = await service.addMember('ws-1', 'user-2', WorkspaceRole.EDITOR);

      expect(result).toEqual(mockMember);
    });

    it('должен обновить роль существующего участника', async () => {
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);
      memberRepo.findOne.mockResolvedValue(mockMember);
      memberRepo.save.mockResolvedValue({ ...mockMember, role: WorkspaceRole.VIEWER } as any);

      await service.addMember('ws-1', 'user-1', WorkspaceRole.VIEWER);

      expect(memberRepo.save).toHaveBeenCalled();
    });

    it('должен выбросить NotFoundException если workspace не найден', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.addMember('non-existent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMemberRole', () => {
    it('должен обновить роль участника', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember);
      memberRepo.save.mockResolvedValue({ ...mockMember, role: WorkspaceRole.VIEWER } as any);

      const result = await service.updateMemberRole('ws-1', 'user-1', WorkspaceRole.VIEWER);

      expect(result.role).toBe(WorkspaceRole.VIEWER);
    });

    it('должен выбросить NotFoundException если участник не найден', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(service.updateMemberRole('ws-1', 'user-2', WorkspaceRole.EDITOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember', () => {
    it('должен удалить участника', async () => {
      memberRepo.delete.mockResolvedValue({ affected: 1 } as any);

      await service.removeMember('ws-1', 'user-1');

      expect(memberRepo.delete).toHaveBeenCalledWith({ workspaceId: 'ws-1', userId: 'user-1' });
    });

    it('должен выбросить NotFoundException если участник не найден', async () => {
      memberRepo.delete.mockResolvedValue({ affected: 0 } as any);

      await expect(service.removeMember('ws-1', 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('duplicate', () => {
    it('должен дублировать workspace', async () => {
      workspaceRepo.findOne
        .mockResolvedValueOnce(mockWorkspace) // original
        .mockResolvedValueOnce({ ...mockWorkspace, id: 'ws-2' } as any); // for addMember
      workspaceRepo.create.mockReturnValue({ ...mockWorkspace, id: 'ws-2' } as any);
      workspaceRepo.save.mockResolvedValue({ ...mockWorkspace, id: 'ws-2', name: 'Test Workspace (копия)' } as any);
      memberRepo.findOne.mockResolvedValue(null);
      memberRepo.create.mockReturnValue(mockMember);
      memberRepo.save.mockResolvedValue(mockMember);

      const result = await service.duplicate('ws-1', 'user-1');

      expect(result.name).toContain('копия');
      expect(workspaceRepo.create).toHaveBeenCalled();
    });

    it('должен использовать кастомное имя', async () => {
      workspaceRepo.findOne
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce({ ...mockWorkspace, id: 'ws-2' } as any);
      workspaceRepo.create.mockReturnValue({ ...mockWorkspace, id: 'ws-2' } as any);
      workspaceRepo.save.mockResolvedValue({ ...mockWorkspace, id: 'ws-2', name: 'Custom Name' } as any);
      memberRepo.findOne.mockResolvedValue(null);
      memberRepo.create.mockReturnValue(mockMember);
      memberRepo.save.mockResolvedValue(mockMember);

      const result = await service.duplicate('ws-1', 'user-1', 'Custom Name');

      expect(result.name).toBe('Custom Name');
    });

    it('должен выбросить NotFoundException если workspace не найден', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.duplicate('non-existent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('setArchived', () => {
    it('должен архивировать workspace', async () => {
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);
      workspaceRepo.save.mockResolvedValue({ ...mockWorkspace, isArchived: true } as any);

      const result = await service.setArchived('ws-1', true);

      expect(result.isArchived).toBe(true);
    });

    it('должен разархивировать workspace', async () => {
      const archivedWs = { ...mockWorkspace, isArchived: true };
      workspaceRepo.findOne.mockResolvedValue(archivedWs as any);
      workspaceRepo.save.mockResolvedValue({ ...archivedWs, isArchived: false } as any);

      const result = await service.setArchived('ws-1', false);

      expect(result.isArchived).toBe(false);
    });

    it('должен выбросить NotFoundException', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.setArchived('non-existent', true)).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportToJson', () => {
    it('должен экспортировать workspace в JSON', async () => {
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);
      entityRepo.find.mockResolvedValue([mockEntity]);

      const result = await service.exportToJson('ws-1');

      expect(result.workspace).toEqual(mockWorkspace);
      expect(result.entities).toEqual([mockEntity]);
      expect(result.exportedAt).toBeDefined();
    });

    it('должен выбросить NotFoundException', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.exportToJson('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportToCsv', () => {
    it('должен экспортировать workspace в CSV', async () => {
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);
      entityRepo.find.mockResolvedValue([mockEntity]);

      const result = await service.exportToCsv('ws-1');

      expect(result).toContain('ID,Номер,Название');
      expect(result).toContain(mockEntity.id);
    });

    it('должен выбросить NotFoundException', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.exportToCsv('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('importFromJson', () => {
    it('должен импортировать entities из JSON', async () => {
      workspaceRepo.findOne.mockResolvedValue({ ...mockWorkspace });
      workspaceRepo.save.mockResolvedValue(mockWorkspace);
      entityRepo.create.mockReturnValue(mockEntity);
      entityRepo.save.mockResolvedValue(mockEntity);

      const result = await service.importFromJson('ws-1', [{ title: 'Test', status: 'new' }], 'user-1');

      expect(result.imported).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('должен выбросить NotFoundException', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.importFromJson('non-existent', [], 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('importFromCsv', () => {
    it('должен импортировать entities из CSV', async () => {
      workspaceRepo.findOne.mockResolvedValue({ ...mockWorkspace });
      workspaceRepo.save.mockResolvedValue(mockWorkspace);
      entityRepo.create.mockReturnValue(mockEntity);
      entityRepo.save.mockResolvedValue(mockEntity);

      const csv = 'Название,Статус,Приоритет\nTest Entity,new,high';
      const result = await service.importFromCsv('ws-1', csv, 'user-1');

      expect(result.imported).toBe(1);
    });

    it('должен вернуть ошибку для пустого CSV', async () => {
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);

      const result = await service.importFromCsv('ws-1', '', 'user-1');

      expect(result.imported).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('должен вернуть ошибку если нет колонки названия', async () => {
      workspaceRepo.findOne.mockResolvedValue(mockWorkspace);

      const csv = 'ID,Статус\n1,new';
      const result = await service.importFromCsv('ws-1', csv, 'user-1');

      expect(result.errors).toContain('Не найдена колонка "Название" или "Title"');
    });

    it('должен маппить приоритеты', async () => {
      workspaceRepo.findOne.mockResolvedValue({ ...mockWorkspace });
      workspaceRepo.save.mockResolvedValue(mockWorkspace);
      entityRepo.create.mockImplementation((data) => data as any);
      entityRepo.save.mockResolvedValue(mockEntity);

      const csv = 'Title,Status,Priority\nTest,new,высокий';
      await service.importFromCsv('ws-1', csv, 'user-1');

      expect(entityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'high' }),
      );
    });

    it('должен выбросить NotFoundException', async () => {
      workspaceRepo.findOne.mockResolvedValue(null);

      await expect(service.importFromCsv('non-existent', 'csv', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAccessibleWorkspaces', () => {
    it('должен быть алиасом для findAll', async () => {
      workspaceRepo.find.mockResolvedValue([mockWorkspace]);

      const result = await service.getAccessibleWorkspaces('user-1', UserRole.ADMIN);

      expect(result).toEqual([mockWorkspace]);
    });
  });
});
