import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './rbac.guard';
import { RbacService } from './rbac.service';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: jest.Mocked<Reflector>;
  let rbacService: jest.Mocked<RbacService>;

  const createMockExecutionContext = (
    user: any,
    params: Record<string, string> = {},
    query: Record<string, string> = {},
    body: Record<string, string> = {},
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user, params, query, body }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as any;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    rbacService = {
      hasPermission: jest.fn(),
    } as any;

    guard = new PermissionGuard(reflector, rbacService);
  });

  it('должен пропустить если нет @RequirePermission', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = createMockExecutionContext({ id: 'u1' });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(rbacService.hasPermission).not.toHaveBeenCalled();
  });

  it('должен пропустить если permissions массив пустой', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const ctx = createMockExecutionContext({ id: 'u1' });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('должен вернуть false если нет user', async () => {
    reflector.getAllAndOverride.mockReturnValue(['global:system:manage']);
    const ctx = createMockExecutionContext(null);

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('должен проверить permission с контекстом из params', async () => {
    reflector.getAllAndOverride.mockReturnValue(['workspace:entity:create']);
    rbacService.hasPermission.mockResolvedValue(true);

    const ctx = createMockExecutionContext(
      { id: 'u1' },
      { workspaceId: 'ws1' },
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(rbacService.hasPermission).toHaveBeenCalledWith('u1', 'workspace:entity:create', {
      workspaceId: 'ws1',
      sectionId: undefined,
    });
  });

  it('должен извлечь workspaceId из query', async () => {
    reflector.getAllAndOverride.mockReturnValue(['workspace:entity:read']);
    rbacService.hasPermission.mockResolvedValue(true);

    const ctx = createMockExecutionContext(
      { id: 'u1' },
      {},
      { workspaceId: 'ws-from-query' },
    );

    await guard.canActivate(ctx);
    expect(rbacService.hasPermission).toHaveBeenCalledWith('u1', 'workspace:entity:read', {
      workspaceId: 'ws-from-query',
      sectionId: undefined,
    });
  });

  it('должен извлечь workspaceId из body', async () => {
    reflector.getAllAndOverride.mockReturnValue(['workspace:entity:create']);
    rbacService.hasPermission.mockResolvedValue(true);

    const ctx = createMockExecutionContext(
      { id: 'u1' },
      {},
      {},
      { workspaceId: 'ws-from-body' },
    );

    await guard.canActivate(ctx);
    expect(rbacService.hasPermission).toHaveBeenCalledWith('u1', 'workspace:entity:create', {
      workspaceId: 'ws-from-body',
      sectionId: undefined,
    });
  });

  it('должен извлечь sectionId из params', async () => {
    reflector.getAllAndOverride.mockReturnValue(['section:read']);
    rbacService.hasPermission.mockResolvedValue(true);

    const ctx = createMockExecutionContext(
      { id: 'u1' },
      { sectionId: 'sec1' },
    );

    await guard.canActivate(ctx);
    expect(rbacService.hasPermission).toHaveBeenCalledWith('u1', 'section:read', {
      workspaceId: undefined,
      sectionId: 'sec1',
    });
  });

  it('AND логика: должен вернуть false если хотя бы один permission отсутствует', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'workspace:entity:create',
      'workspace:entity:delete',
    ]);

    rbacService.hasPermission
      .mockResolvedValueOnce(true)   // entity:create — есть
      .mockResolvedValueOnce(false); // entity:delete — нет

    const ctx = createMockExecutionContext({ id: 'u1' }, { workspaceId: 'ws1' });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(false);
  });

  it('AND логика: должен вернуть true если все permissions есть', async () => {
    reflector.getAllAndOverride.mockReturnValue([
      'workspace:entity:create',
      'workspace:comment:create',
    ]);

    rbacService.hasPermission.mockResolvedValue(true);

    const ctx = createMockExecutionContext({ id: 'u1' }, { workspaceId: 'ws1' });

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(rbacService.hasPermission).toHaveBeenCalledTimes(2);
  });

  it('params приоритет над query и body', async () => {
    reflector.getAllAndOverride.mockReturnValue(['workspace:entity:read']);
    rbacService.hasPermission.mockResolvedValue(true);

    const ctx = createMockExecutionContext(
      { id: 'u1' },
      { workspaceId: 'ws-params' },
      { workspaceId: 'ws-query' },
      { workspaceId: 'ws-body' },
    );

    await guard.canActivate(ctx);
    expect(rbacService.hasPermission).toHaveBeenCalledWith('u1', 'workspace:entity:read', {
      workspaceId: 'ws-params',
      sectionId: undefined,
    });
  });
});
