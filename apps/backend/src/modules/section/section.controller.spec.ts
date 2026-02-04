import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SectionController } from './section.controller';
import { SectionService } from './section.service';
import { Section } from './section.entity';
import { SectionMember, SectionRole } from './section-member.entity';
import { User, UserRole } from '../user/user.entity';

describe('SectionController', () => {
  let controller: SectionController;
  let service: jest.Mocked<SectionService>;

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
    createdAt: new Date(),
  } as unknown as SectionMember;

  const mockUser = {
    id: 'user-1',
    email: 'test@test.com',
    firstName: 'Test',
    lastName: 'User',
    role: UserRole.ADMIN,
  } as User;

  const mockNonAdminUser = {
    ...mockUser,
    id: 'user-2',
    role: UserRole.EMPLOYEE,
  } as User;

  beforeEach(async () => {
    const mockSectionService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      checkAccess: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      reorder: jest.fn(),
      getMyRoles: jest.fn(),
      getMembers: jest.fn(),
      addMember: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SectionController],
      providers: [
        { provide: SectionService, useValue: mockSectionService },
      ],
    }).compile();

    controller = module.get<SectionController>(SectionController);
    service = module.get(SectionService);
  });

  describe('findAll', () => {
    it('должен вернуть все доступные разделы', async () => {
      service.findAll.mockResolvedValue([mockSection]);

      const result = await controller.findAll(mockUser);

      expect(result).toEqual([mockSection]);
      expect(service.findAll).toHaveBeenCalledWith(mockUser.id, mockUser.role);
    });
  });

  describe('getMyRoles', () => {
    it('должен вернуть роли во всех разделах', async () => {
      const roles = { 'section-1': SectionRole.ADMIN };
      service.getMyRoles.mockResolvedValue(roles);

      const result = await controller.getMyRoles(mockUser);

      expect(result).toEqual(roles);
    });
  });

  describe('findOne', () => {
    it('должен вернуть раздел по ID', async () => {
      service.checkAccess.mockResolvedValue(mockSectionMember);
      service.findOne.mockResolvedValue(mockSection);

      const result = await controller.findOne('section-1', mockUser);

      expect(result).toEqual(mockSection);
    });

    it('должен выбросить ForbiddenException если нет доступа', async () => {
      service.checkAccess.mockResolvedValue(null);

      await expect(controller.findOne('section-1', mockNonAdminUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('должен создать раздел', async () => {
      service.create.mockResolvedValue(mockSection);

      const result = await controller.create({ name: 'HR' }, mockUser);

      expect(result).toEqual(mockSection);
      expect(service.create).toHaveBeenCalledWith({ name: 'HR' }, mockUser.id);
    });
  });

  describe('update', () => {
    it('должен обновить раздел', async () => {
      service.checkAccess.mockResolvedValue(mockSectionMember);
      service.update.mockResolvedValue(mockSection);

      const result = await controller.update('section-1', { name: 'Updated' }, mockUser);

      expect(result).toEqual(mockSection);
    });

    it('должен выбросить ForbiddenException если нет прав admin', async () => {
      service.checkAccess.mockResolvedValue(null);

      await expect(controller.update('section-1', { name: 'Updated' }, mockNonAdminUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('должен удалить раздел', async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove('section-1');

      expect(service.remove).toHaveBeenCalledWith('section-1');
    });
  });

  describe('reorder', () => {
    it('должен изменить порядок разделов', async () => {
      service.reorder.mockResolvedValue(undefined);

      await controller.reorder({ sectionIds: ['section-2', 'section-1'] });

      expect(service.reorder).toHaveBeenCalledWith(['section-2', 'section-1']);
    });
  });

  describe('getMembers', () => {
    it('должен вернуть список участников', async () => {
      service.checkAccess.mockResolvedValue(mockSectionMember);
      service.getMembers.mockResolvedValue([mockSectionMember]);

      const result = await controller.getMembers('section-1', mockUser);

      expect(result).toEqual([mockSectionMember]);
    });

    it('должен выбросить ForbiddenException если нет доступа', async () => {
      service.checkAccess.mockResolvedValue(null);

      await expect(controller.getMembers('section-1', mockNonAdminUser)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addMember', () => {
    it('должен добавить участника', async () => {
      service.checkAccess.mockResolvedValue(mockSectionMember);
      service.addMember.mockResolvedValue(mockSectionMember);

      const result = await controller.addMember('section-1', { userId: 'user-2', role: SectionRole.VIEWER }, mockUser);

      expect(result).toEqual(mockSectionMember);
    });

    it('должен выбросить ForbiddenException если нет прав admin', async () => {
      service.checkAccess.mockResolvedValue(null);

      await expect(
        controller.addMember('section-1', { userId: 'user-2' }, mockNonAdminUser)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateMemberRole', () => {
    it('должен обновить роль участника', async () => {
      service.checkAccess.mockResolvedValue(mockSectionMember);
      service.updateMemberRole.mockResolvedValue({ ...mockSectionMember, role: SectionRole.VIEWER } as any);

      const result = await controller.updateMemberRole('section-1', 'user-2', { role: SectionRole.VIEWER }, mockUser);

      expect(result.role).toBe(SectionRole.VIEWER);
    });

    it('должен выбросить ForbiddenException если нет прав admin', async () => {
      service.checkAccess.mockResolvedValue(null);

      await expect(
        controller.updateMemberRole('section-1', 'user-2', { role: SectionRole.ADMIN }, mockNonAdminUser)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeMember', () => {
    it('должен удалить участника', async () => {
      service.checkAccess.mockResolvedValue(mockSectionMember);
      service.removeMember.mockResolvedValue(undefined);

      await controller.removeMember('section-1', 'user-2', mockUser);

      expect(service.removeMember).toHaveBeenCalledWith('section-1', 'user-2');
    });

    it('должен выбросить ForbiddenException если нет прав admin', async () => {
      service.checkAccess.mockResolvedValue(null);

      await expect(controller.removeMember('section-1', 'user-2', mockNonAdminUser)).rejects.toThrow(ForbiddenException);
    });
  });
});
