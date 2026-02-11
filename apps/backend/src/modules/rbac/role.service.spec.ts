import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RoleService } from './role.service';
import { Role } from './role.entity';
import { User } from '../user/user.entity';
import { WorkspaceMember } from '../workspace/workspace-member.entity';
import { SectionMember } from '../section/section-member.entity';
import { RbacService } from './rbac.service';
import { EventsGateway } from '../websocket/events.gateway';

describe('RoleService', () => {
  let service: RoleService;
  let roleRepo: jest.Mocked<Repository<Role>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let wsMemberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let secMemberRepo: jest.Mocked<Repository<SectionMember>>;
  let rbacService: jest.Mocked<RbacService>;
  let eventsGateway: jest.Mocked<EventsGateway>;

  const mockRole: Role = {
    id: 'role-1',
    name: 'Тестовая роль',
    slug: 'test_role',
    description: 'Описание',
    scope: 'workspace',
    permissions: ['workspace:entity:read'],
    isSystem: false,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSystemRole: Role = {
    ...mockRole,
    id: 'role-sys',
    slug: 'ws_admin',
    isSystem: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        {
          provide: getRepositoryToken(Role),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SectionMember),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: RbacService,
          useValue: {
            invalidateAll: jest.fn(),
            invalidateUser: jest.fn(),
          },
        },
        {
          provide: EventsGateway,
          useValue: {
            emitRbacPermissionsChanged: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(RoleService);
    roleRepo = module.get(getRepositoryToken(Role));
    userRepo = module.get(getRepositoryToken(User));
    wsMemberRepo = module.get(getRepositoryToken(WorkspaceMember));
    secMemberRepo = module.get(getRepositoryToken(SectionMember));
    rbacService = module.get(RbacService);
    eventsGateway = module.get(EventsGateway);
  });

  // ── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('должен вернуть все роли без фильтра', async () => {
      roleRepo.find.mockResolvedValue([mockRole]);

      const result = await service.findAll();
      expect(result).toEqual([mockRole]);
      expect(roleRepo.find).toHaveBeenCalledWith({
        where: {},
        order: { scope: 'ASC', name: 'ASC' },
      });
    });

    it('должен отфильтровать по scope', async () => {
      roleRepo.find.mockResolvedValue([mockRole]);

      await service.findAll('workspace');
      expect(roleRepo.find).toHaveBeenCalledWith({
        where: { scope: 'workspace' },
        order: { scope: 'ASC', name: 'ASC' },
      });
    });
  });

  // ── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('должен вернуть роль по ID', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole);

      const result = await service.findOne('role-1');
      expect(result).toEqual(mockRole);
    });

    it('должен выбросить NotFoundException если роль не найдена', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findBySlug ───────────────────────────────────────────────

  describe('findBySlug', () => {
    it('должен вернуть роль по slug', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole);

      const result = await service.findBySlug('test_role');
      expect(result).toEqual(mockRole);
    });

    it('должен вернуть null если slug не найден', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      const result = await service.findBySlug('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── create ───────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      name: 'Новая роль',
      slug: 'new_role',
      scope: 'workspace' as const,
      permissions: ['workspace:entity:read'],
      description: 'Описание',
    };

    it('должен создать роль', async () => {
      roleRepo.findOne.mockResolvedValue(null); // slug не занят
      roleRepo.create.mockReturnValue({ ...mockRole, ...dto } as any);
      roleRepo.save.mockResolvedValue({ ...mockRole, ...dto } as any);

      const result = await service.create(dto);
      expect(result.slug).toBe('new_role');
      expect(roleRepo.create).toHaveBeenCalledWith({
        name: 'Новая роль',
        slug: 'new_role',
        description: 'Описание',
        scope: 'workspace',
        permissions: ['workspace:entity:read'],
        isSystem: false,
        isDefault: false,
      });
    });

    it('должен выбросить ConflictException если slug уже существует', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole); // slug занят

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('должен обновить роль и инвалидировать кэш', async () => {
      roleRepo.findOne.mockResolvedValue({ ...mockRole });
      roleRepo.save.mockResolvedValue({
        ...mockRole,
        name: 'Обновлённое имя',
        permissions: ['workspace:entity:*'],
      } as any);
      // notifyUsersWithRole ищет участников с этой ролью
      wsMemberRepo.find.mockResolvedValue([]);

      const result = await service.update('role-1', {
        name: 'Обновлённое имя',
        permissions: ['workspace:entity:*'],
      });

      expect(result.name).toBe('Обновлённое имя');
      expect(rbacService.invalidateAll).toHaveBeenCalled();
    });

    it('должен обновить только переданные поля', async () => {
      const role = { ...mockRole };
      roleRepo.findOne.mockResolvedValue(role);
      roleRepo.save.mockImplementation(async (r) => r as any);
      wsMemberRepo.find.mockResolvedValue([]);

      await service.update('role-1', { description: 'Новое описание' });

      expect(role.name).toBe('Тестовая роль'); // не изменилось
      expect(role.description).toBe('Новое описание'); // обновилось
    });

    it('должен выбросить NotFoundException если роль не найдена', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'new' })).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('должен удалить обычную роль', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole);

      await service.remove('role-1');
      expect(roleRepo.remove).toHaveBeenCalledWith(mockRole);
    });

    it('должен выбросить ForbiddenException для системной роли', async () => {
      roleRepo.findOne.mockResolvedValue(mockSystemRole);

      await expect(service.remove('role-sys')).rejects.toThrow(ForbiddenException);
      expect(roleRepo.remove).not.toHaveBeenCalled();
    });

    it('должен выбросить ConflictException если глобальная роль используется', async () => {
      const globalRole = { ...mockRole, scope: 'global' as const };
      roleRepo.findOne.mockResolvedValue(globalRole);
      userRepo.count.mockResolvedValue(3);

      await expect(service.remove('role-1')).rejects.toThrow(ConflictException);
    });

    it('должен выбросить NotFoundException если роль не найдена', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── assignGlobalRole ─────────────────────────────────────────

  describe('assignGlobalRole', () => {
    it('должен назначить глобальную роль и инвалидировать кэш', async () => {
      const globalRole = { ...mockRole, scope: 'global' as const };
      roleRepo.findOne.mockResolvedValue(globalRole);
      const user = { id: 'u1', roleId: null } as any;
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (u) => u as any);

      const result = await service.assignGlobalRole('u1', 'role-1');

      expect(result.roleId).toBe('role-1');
      expect(rbacService.invalidateUser).toHaveBeenCalledWith('u1');
      expect(eventsGateway.emitRbacPermissionsChanged).toHaveBeenCalledWith('u1');
    });

    it('должен выбросить ForbiddenException для не-глобальной роли', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole); // scope: workspace

      await expect(service.assignGlobalRole('u1', 'role-1')).rejects.toThrow(ForbiddenException);
    });

    it('должен выбросить NotFoundException если пользователь не найден', async () => {
      const globalRole = { ...mockRole, scope: 'global' as const };
      roleRepo.findOne.mockResolvedValue(globalRole);
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.assignGlobalRole('nonexistent', 'role-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getDefaultRole ───────────────────────────────────────────

  describe('getDefaultRole', () => {
    it('должен вернуть дефолтную роль для scope', async () => {
      const defaultRole = { ...mockRole, isDefault: true };
      roleRepo.findOne.mockResolvedValue(defaultRole);

      const result = await service.getDefaultRole('workspace');
      expect(result).toEqual(defaultRole);
      expect(roleRepo.findOne).toHaveBeenCalledWith({
        where: { scope: 'workspace', isDefault: true },
      });
    });

    it('должен вернуть null если дефолтная роль не найдена', async () => {
      roleRepo.findOne.mockResolvedValue(null);

      const result = await service.getDefaultRole('workspace');
      expect(result).toBeNull();
    });
  });
});
