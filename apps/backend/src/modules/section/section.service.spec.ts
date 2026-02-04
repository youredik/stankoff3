import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SectionService } from './section.service';
import { Section } from './section.entity';
import { SectionMember, SectionRole } from './section-member.entity';
import { Workspace } from '../workspace/workspace.entity';
import { WorkspaceMember } from '../workspace/workspace-member.entity';
import { UserRole } from '../user/user.entity';

describe('SectionService', () => {
  let service: SectionService;
  let sectionRepo: jest.Mocked<Repository<Section>>;
  let memberRepo: jest.Mocked<Repository<SectionMember>>;
  let workspaceRepo: jest.Mocked<Repository<Workspace>>;
  let workspaceMemberRepo: jest.Mocked<Repository<WorkspaceMember>>;

  const mockSection = {
    id: 'section-1',
    name: 'HR',
    description: 'Human Resources',
    icon: '👥',
    order: 0,
    workspaces: [],
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Section;

  const mockSectionMember = {
    id: 'sm-1',
    sectionId: 'section-1',
    userId: 'user-1',
    role: SectionRole.ADMIN,
    section: mockSection,
    createdAt: new Date(),
  } as unknown as SectionMember;

  const mockWorkspace = {
    id: 'ws-1',
    name: 'Test Workspace',
    sectionId: 'section-1',
  } as unknown as Workspace;

  const mockWorkspaceMember = {
    id: 'wm-1',
    workspaceId: 'ws-1',
    userId: 'user-2',
    workspace: mockWorkspace,
  } as unknown as WorkspaceMember;

  beforeEach(async () => {
    const mockSectionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: 0 }),
        getMany: jest.fn().mockResolvedValue([mockSection]),
      })),
    };

    const mockMemberRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const mockWorkspaceRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const mockWorkspaceMemberRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionService,
        { provide: getRepositoryToken(Section), useValue: mockSectionRepo },
        { provide: getRepositoryToken(SectionMember), useValue: mockMemberRepo },
        { provide: getRepositoryToken(Workspace), useValue: mockWorkspaceRepo },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockWorkspaceMemberRepo },
      ],
    }).compile();

    service = module.get<SectionService>(SectionService);
    sectionRepo = module.get(getRepositoryToken(Section));
    memberRepo = module.get(getRepositoryToken(SectionMember));
    workspaceRepo = module.get(getRepositoryToken(Workspace));
    workspaceMemberRepo = module.get(getRepositoryToken(WorkspaceMember));
  });

  describe('findAll', () => {
    it('должен вернуть все разделы для admin', async () => {
      sectionRepo.find.mockResolvedValue([mockSection]);

      const result = await service.findAll('user-1', UserRole.ADMIN);

      expect(result).toEqual([mockSection]);
      expect(sectionRepo.find).toHaveBeenCalled();
    });

    it('должен вернуть доступные разделы для обычного пользователя', async () => {
      memberRepo.find.mockResolvedValue([mockSectionMember]);
      workspaceMemberRepo.find.mockResolvedValue([]);

      const result = await service.findAll('user-1', UserRole.EMPLOYEE);

      expect(result).toHaveLength(1);
    });

    it('должен вернуть разделы через workspace membership', async () => {
      memberRepo.find.mockResolvedValue([]);
      workspaceMemberRepo.find.mockResolvedValue([mockWorkspaceMember]);

      const result = await service.findAll('user-2', UserRole.EMPLOYEE);

      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('должен вернуть раздел по ID', async () => {
      sectionRepo.findOne.mockResolvedValue(mockSection);

      const result = await service.findOne('section-1');

      expect(result).toEqual(mockSection);
    });

    it('должен вернуть null если раздел не найден', async () => {
      sectionRepo.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('checkAccess', () => {
    it('должен вернуть admin role для глобального admin', async () => {
      const result = await service.checkAccess('section-1', 'user-1', UserRole.ADMIN);

      expect(result?.role).toBe(SectionRole.ADMIN);
    });

    it('должен вернуть membership для обычного пользователя', async () => {
      memberRepo.findOne.mockResolvedValue(mockSectionMember);

      const result = await service.checkAccess('section-1', 'user-1', UserRole.EMPLOYEE);

      expect(result).toEqual(mockSectionMember);
    });

    it('должен вернуть viewer через workspace membership', async () => {
      memberRepo.findOne.mockResolvedValue(null);
      sectionRepo.findOne.mockResolvedValue({ ...mockSection, workspaces: [mockWorkspace] } as any);
      workspaceMemberRepo.findOne.mockResolvedValue(mockWorkspaceMember);

      const result = await service.checkAccess('section-1', 'user-2', UserRole.EMPLOYEE);

      expect(result?.role).toBe(SectionRole.VIEWER);
    });

    it('должен вернуть null если нет доступа', async () => {
      memberRepo.findOne.mockResolvedValue(null);
      sectionRepo.findOne.mockResolvedValue({ ...mockSection, workspaces: [] } as any);

      const result = await service.checkAccess('section-1', 'user-3', UserRole.EMPLOYEE);

      expect(result).toBeNull();
    });

    it('должен проверить минимальную роль', async () => {
      const viewerMember = { ...mockSectionMember, role: SectionRole.VIEWER };
      memberRepo.findOne.mockResolvedValue(viewerMember as any);

      const result = await service.checkAccess('section-1', 'user-1', UserRole.EMPLOYEE, SectionRole.ADMIN);

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('должен создать раздел и добавить создателя как admin', async () => {
      sectionRepo.create.mockReturnValue(mockSection);
      sectionRepo.save.mockResolvedValue(mockSection);
      sectionRepo.findOne.mockResolvedValue(mockSection);
      memberRepo.findOne.mockResolvedValue(null);
      memberRepo.create.mockReturnValue(mockSectionMember);
      memberRepo.save.mockResolvedValue(mockSectionMember);

      const result = await service.create({ name: 'HR' }, 'user-1');

      expect(result).toEqual(mockSection);
      expect(memberRepo.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('должен обновить раздел', async () => {
      sectionRepo.findOne.mockResolvedValue(mockSection);
      sectionRepo.update.mockResolvedValue({ affected: 1 } as any);

      const result = await service.update('section-1', { name: 'Updated' });

      expect(sectionRepo.update).toHaveBeenCalledWith('section-1', { name: 'Updated' });
    });

    it('должен выбросить NotFoundException', async () => {
      sectionRepo.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('должен удалить пустой раздел', async () => {
      sectionRepo.findOne.mockResolvedValue({ ...mockSection, workspaces: [] } as any);
      sectionRepo.delete.mockResolvedValue({ affected: 1 } as any);

      await service.remove('section-1');

      expect(sectionRepo.delete).toHaveBeenCalledWith('section-1');
    });

    it('должен выбросить BadRequestException для непустого раздела', async () => {
      sectionRepo.findOne.mockResolvedValue({ ...mockSection, workspaces: [mockWorkspace] } as any);

      await expect(service.remove('section-1')).rejects.toThrow(BadRequestException);
    });

    it('должен выбросить NotFoundException', async () => {
      sectionRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyRoles', () => {
    it('должен вернуть admin роль во всех разделах для глобального admin', async () => {
      sectionRepo.find.mockResolvedValue([mockSection]);

      const result = await service.getMyRoles('user-1', UserRole.ADMIN);

      expect(result['section-1']).toBe(SectionRole.ADMIN);
    });

    it('должен вернуть роли по membership для обычного пользователя', async () => {
      memberRepo.find.mockResolvedValue([mockSectionMember]);
      workspaceMemberRepo.find.mockResolvedValue([]);

      const result = await service.getMyRoles('user-1', UserRole.EMPLOYEE);

      expect(result['section-1']).toBe(SectionRole.ADMIN);
    });

    it('должен вернуть viewer роль через workspace membership', async () => {
      memberRepo.find.mockResolvedValue([]);
      workspaceMemberRepo.find.mockResolvedValue([mockWorkspaceMember]);

      const result = await service.getMyRoles('user-2', UserRole.EMPLOYEE);

      expect(result['section-1']).toBe(SectionRole.VIEWER);
    });
  });

  describe('getMembers', () => {
    it('должен вернуть список участников', async () => {
      memberRepo.find.mockResolvedValue([mockSectionMember]);

      const result = await service.getMembers('section-1');

      expect(result).toEqual([mockSectionMember]);
    });
  });

  describe('addMember', () => {
    it('должен добавить нового участника', async () => {
      sectionRepo.findOne.mockResolvedValue(mockSection);
      memberRepo.findOne.mockResolvedValue(null);
      memberRepo.create.mockReturnValue(mockSectionMember);
      memberRepo.save.mockResolvedValue(mockSectionMember);

      const result = await service.addMember('section-1', 'user-2', SectionRole.VIEWER);

      expect(result).toEqual(mockSectionMember);
    });

    it('должен обновить роль существующего участника', async () => {
      sectionRepo.findOne.mockResolvedValue(mockSection);
      memberRepo.findOne.mockResolvedValue(mockSectionMember);
      memberRepo.save.mockResolvedValue({ ...mockSectionMember, role: SectionRole.VIEWER } as any);

      await service.addMember('section-1', 'user-1', SectionRole.VIEWER);

      expect(memberRepo.save).toHaveBeenCalled();
    });

    it('должен выбросить NotFoundException если раздел не найден', async () => {
      sectionRepo.findOne.mockResolvedValue(null);

      await expect(service.addMember('non-existent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMemberRole', () => {
    it('должен обновить роль участника', async () => {
      memberRepo.findOne.mockResolvedValue(mockSectionMember);
      memberRepo.save.mockResolvedValue({ ...mockSectionMember, role: SectionRole.VIEWER } as any);

      const result = await service.updateMemberRole('section-1', 'user-1', SectionRole.VIEWER);

      expect(result.role).toBe(SectionRole.VIEWER);
    });

    it('должен выбросить NotFoundException если участник не найден', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(service.updateMemberRole('section-1', 'user-2', SectionRole.ADMIN)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember', () => {
    it('должен удалить участника', async () => {
      memberRepo.delete.mockResolvedValue({ affected: 1 } as any);

      await service.removeMember('section-1', 'user-1');

      expect(memberRepo.delete).toHaveBeenCalledWith({ sectionId: 'section-1', userId: 'user-1' });
    });

    it('должен выбросить NotFoundException если участник не найден', async () => {
      memberRepo.delete.mockResolvedValue({ affected: 0 } as any);

      await expect(service.removeMember('section-1', 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reorder', () => {
    it('должен изменить порядок разделов', async () => {
      sectionRepo.update.mockResolvedValue({ affected: 1 } as any);

      await service.reorder(['section-2', 'section-1']);

      expect(sectionRepo.update).toHaveBeenCalledWith('section-2', { order: 0 });
      expect(sectionRepo.update).toHaveBeenCalledWith('section-1', { order: 1 });
    });
  });
});
