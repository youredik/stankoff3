import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RbacService } from './rbac.service';
import { Role } from './role.entity';
import { User } from '../user/user.entity';
import { WorkspaceMember } from '../workspace/workspace-member.entity';
import { SectionMember } from '../section/section-member.entity';
import { Workspace } from '../workspace/workspace.entity';

describe('RbacService', () => {
  let service: RbacService;
  let roleRepo: jest.Mocked<Repository<Role>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let wsMemberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let secMemberRepo: jest.Mocked<Repository<SectionMember>>;
  let workspaceRepo: jest.Mocked<Repository<Workspace>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        {
          provide: getRepositoryToken(Role),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn(), count: jest.fn() },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(SectionMember),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Workspace),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(RbacService);
    roleRepo = module.get(getRepositoryToken(Role));
    userRepo = module.get(getRepositoryToken(User));
    wsMemberRepo = module.get(getRepositoryToken(WorkspaceMember));
    secMemberRepo = module.get(getRepositoryToken(SectionMember));
    workspaceRepo = module.get(getRepositoryToken(Workspace));

    // Очищаем кэш перед каждым тестом
    service.invalidateAll();
  });

  // ── matchPermission ──────────────────────────────────────────

  describe('matchPermission', () => {
    it('суперадмин wildcard (*) покрывает любой permission', () => {
      expect(RbacService.matchPermission('workspace:entity:create', '*')).toBe(true);
      expect(RbacService.matchPermission('global:system:manage', '*')).toBe(true);
    });

    it('точное совпадение', () => {
      expect(RbacService.matchPermission('workspace:entity:create', 'workspace:entity:create')).toBe(true);
    });

    it('wildcard на уровне scope', () => {
      expect(RbacService.matchPermission('workspace:entity:create', 'workspace:*')).toBe(true);
      expect(RbacService.matchPermission('workspace:settings:update', 'workspace:*')).toBe(true);
    });

    it('wildcard на уровне resource', () => {
      expect(RbacService.matchPermission('workspace:entity:create', 'workspace:entity:*')).toBe(true);
      expect(RbacService.matchPermission('workspace:entity:delete', 'workspace:entity:*')).toBe(true);
    });

    it('wildcard для field permissions', () => {
      expect(
        RbacService.matchPermission('workspace:entity.field.abc:read', 'workspace:entity.field.*:read'),
      ).toBe(true);
    });

    it('несовпадение scope', () => {
      expect(RbacService.matchPermission('workspace:entity:create', 'global:entity:create')).toBe(false);
    });

    it('несовпадение resource', () => {
      expect(RbacService.matchPermission('workspace:entity:create', 'workspace:comment:create')).toBe(false);
    });

    it('несовпадение action', () => {
      expect(RbacService.matchPermission('workspace:entity:create', 'workspace:entity:read')).toBe(false);
    });

    it('granted короче required — не покрывает', () => {
      expect(RbacService.matchPermission('workspace:entity:create', 'workspace')).toBe(false);
    });

    it('granted длиннее required без wildcard — не совпадает', () => {
      expect(RbacService.matchPermission('workspace:entity', 'workspace:entity:create')).toBe(false);
    });
  });

  // ── hasPermissionInSet ───────────────────────────────────────

  describe('hasPermissionInSet', () => {
    it('находит точное совпадение в наборе', () => {
      const set = new Set(['workspace:entity:create', 'workspace:entity:read']);
      expect(RbacService.hasPermissionInSet('workspace:entity:create', set)).toBe(true);
    });

    it('находит совпадение через wildcard в наборе', () => {
      const set = new Set(['workspace:*']);
      expect(RbacService.hasPermissionInSet('workspace:entity:create', set)).toBe(true);
    });

    it('возвращает false если нет совпадения', () => {
      const set = new Set(['workspace:comment:create']);
      expect(RbacService.hasPermissionInSet('workspace:entity:create', set)).toBe(false);
    });

    it('возвращает false для пустого набора', () => {
      const set = new Set<string>();
      expect(RbacService.hasPermissionInSet('workspace:entity:create', set)).toBe(false);
    });
  });

  // ── getEffectivePermissions ──────────────────────────────────

  describe('getEffectivePermissions', () => {
    it('должен объединять global + workspace + section permissions (additive)', async () => {
      // Global role: employee (пустой)
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: ['global:analytics:read'] },
      } as any);

      // Workspace role
      wsMemberRepo.findOne.mockResolvedValue({
        workspaceRole: { permissions: ['workspace:entity:read', 'workspace:comment:read'] },
      } as any);

      // Workspace → section
      workspaceRepo.findOne.mockResolvedValue({ id: 'ws1', sectionId: 'sec1' } as any);

      // Section role
      secMemberRepo.findOne.mockResolvedValue({
        sectionRole: { permissions: ['section:read'] },
      } as any);

      const perms = await service.getEffectivePermissions('u1', { workspaceId: 'ws1' });

      expect(perms.has('global:analytics:read')).toBe(true);
      expect(perms.has('workspace:entity:read')).toBe(true);
      expect(perms.has('workspace:comment:read')).toBe(true);
      expect(perms.has('section:read')).toBe(true);
      expect(perms.size).toBe(4);
    });

    it('должен возвращать только global permissions без контекста', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: ['global:analytics:read'] },
      } as any);

      const perms = await service.getEffectivePermissions('u1');
      expect(perms.size).toBe(1);
      expect(perms.has('global:analytics:read')).toBe(true);
    });

    it('должен включать section permissions при передаче sectionId', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: [] },
      } as any);

      secMemberRepo.findOne.mockResolvedValue({
        sectionRole: { permissions: ['section:*'] },
      } as any);

      const perms = await service.getEffectivePermissions('u1', { sectionId: 'sec1' });
      expect(perms.has('section:*')).toBe(true);
    });

    it('должен использовать кэш при повторном вызове', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: ['global:analytics:read'] },
      } as any);

      // Первый вызов
      await service.getEffectivePermissions('u1');
      expect(userRepo.findOne).toHaveBeenCalledTimes(1);

      // Второй вызов — из кэша
      await service.getEffectivePermissions('u1');
      expect(userRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('должен обновить данные после invalidateUser', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: ['global:analytics:read'] },
      } as any);

      await service.getEffectivePermissions('u1');
      service.invalidateUser('u1');
      await service.getEffectivePermissions('u1');

      expect(userRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('должен возвращать пустой набор если нет ролей', async () => {
      userRepo.findOne.mockResolvedValue({ id: 'u1', globalRole: null } as any);

      const perms = await service.getEffectivePermissions('u1');
      expect(perms.size).toBe(0);
    });
  });

  // ── hasPermission ────────────────────────────────────────────

  describe('hasPermission', () => {
    it('должен вернуть true для суперадмина', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: ['*'] },
      } as any);

      const result = await service.hasPermission('u1', 'workspace:entity:delete');
      expect(result).toBe(true);
    });

    it('должен вернуть false если у пользователя нет нужного permission', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: [] },
      } as any);

      const result = await service.hasPermission('u1', 'global:system:manage');
      expect(result).toBe(false);
    });
  });

  // ── getAccessibleWorkspaceIds ────────────────────────────────

  describe('getAccessibleWorkspaceIds', () => {
    it('суперадмин получает все workspaces', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: ['*'] },
      } as any);

      workspaceRepo.find.mockResolvedValue([
        { id: 'ws1' } as Workspace,
        { id: 'ws2' } as Workspace,
      ]);

      const ids = await service.getAccessibleWorkspaceIds('u1');
      expect(ids).toEqual(['ws1', 'ws2']);
      expect(workspaceRepo.find).toHaveBeenCalledWith({
        where: { isInternal: false },
        select: ['id'],
      });
    });

    it('обычный пользователь получает только свои memberships', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: [] },
      } as any);

      wsMemberRepo.find.mockResolvedValue([
        { workspaceId: 'ws1' } as WorkspaceMember,
        { workspaceId: 'ws3' } as WorkspaceMember,
      ]);

      const ids = await service.getAccessibleWorkspaceIds('u1');
      expect(ids).toEqual(['ws1', 'ws3']);
    });
  });

  // ── getFieldPermissions ──────────────────────────────────────

  describe('getFieldPermissions', () => {
    it('wildcard field read/write → null (все поля)', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: [] },
      } as any);

      wsMemberRepo.findOne.mockResolvedValue({
        workspaceRole: {
          permissions: ['workspace:entity.field.*:read', 'workspace:entity.field.*:update'],
        },
      } as any);

      workspaceRepo.findOne.mockResolvedValue(null);

      const result = await service.getFieldPermissions('u1', 'ws1');
      expect(result.readable).toBeNull();
      expect(result.writable).toBeNull();
    });

    it('workspace:* → null (все поля)', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: ['workspace:*'] },
      } as any);

      wsMemberRepo.findOne.mockResolvedValue(null);
      workspaceRepo.findOne.mockResolvedValue(null);

      const result = await service.getFieldPermissions('u1', 'ws1');
      expect(result.readable).toBeNull();
      expect(result.writable).toBeNull();
    });

    it('конкретные field permissions → массивы ID', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: [] },
      } as any);

      wsMemberRepo.findOne.mockResolvedValue({
        workspaceRole: {
          permissions: [
            'workspace:entity.field.field1:read',
            'workspace:entity.field.field2:read',
            'workspace:entity.field.field1:update',
          ],
        },
      } as any);

      workspaceRepo.findOne.mockResolvedValue(null);

      const result = await service.getFieldPermissions('u1', 'ws1');
      expect(result.readable).toEqual(['field1', 'field2']);
      expect(result.writable).toEqual(['field1']);
    });

    it('нет field permissions → пустые массивы', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: [] },
      } as any);

      wsMemberRepo.findOne.mockResolvedValue({
        workspaceRole: { permissions: ['workspace:entity:read'] },
      } as any);

      workspaceRepo.findOne.mockResolvedValue(null);

      const result = await service.getFieldPermissions('u1', 'ws1');
      expect(result.readable).toEqual([]);
      expect(result.writable).toEqual([]);
    });
  });

  // ── Cache ────────────────────────────────────────────────────

  describe('cache', () => {
    it('invalidateAll очищает весь кэш', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: ['global:analytics:read'] },
      } as any);

      await service.getEffectivePermissions('u1');
      service.invalidateAll();
      await service.getEffectivePermissions('u1');

      expect(userRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('разные контексты кэшируются отдельно', async () => {
      userRepo.findOne.mockResolvedValue({
        id: 'u1',
        globalRole: { permissions: [] },
      } as any);

      wsMemberRepo.findOne.mockResolvedValue({
        workspaceRole: { permissions: ['workspace:entity:read'] },
      } as any);

      workspaceRepo.findOne.mockResolvedValue(null);

      // Контекст 1
      await service.getEffectivePermissions('u1', { workspaceId: 'ws1' });
      // Контекст 2 — другой workspace
      await service.getEffectivePermissions('u1', { workspaceId: 'ws2' });

      // user findOne вызывается 2 раза (для каждого контекста)
      expect(userRepo.findOne).toHaveBeenCalledTimes(2);
    });
  });
});
