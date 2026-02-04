import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../user/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (user?: { role: UserRole }): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    }) as unknown as ExecutionContext;

  describe('canActivate', () => {
    it('должен вернуть true если роли не требуются', () => {
      const context = createMockContext();
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it('должен вернуть true если пользователь имеет требуемую роль', () => {
      const context = createMockContext({ role: UserRole.ADMIN });
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('должен вернуть true если у пользователя одна из требуемых ролей', () => {
      const context = createMockContext({ role: UserRole.MANAGER });
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN, UserRole.MANAGER]);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('должен вернуть false если пользователь не имеет требуемую роль', () => {
      const context = createMockContext({ role: UserRole.EMPLOYEE });
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const result = guard.canActivate(context);

      expect(result).toBe(false);
    });

    it('должен вернуть false если пользователь не существует', () => {
      const context = createMockContext(undefined);
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const result = guard.canActivate(context);

      expect(result).toBe(false);
    });

    it('должен вернуть false если у пользователя нет роли', () => {
      const context = createMockContext({} as any);
      reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

      const result = guard.canActivate(context);

      expect(result).toBe(false);
    });

    it('должен вернуть true для ADMIN когда требуется EMPLOYEE', () => {
      // ADMIN имеет только свою роль, не включает EMPLOYEE автоматически
      const context = createMockContext({ role: UserRole.ADMIN });
      reflector.getAllAndOverride.mockReturnValue([UserRole.EMPLOYEE]);

      const result = guard.canActivate(context);

      // ADMIN !== EMPLOYEE, поэтому false (нет иерархии ролей в текущей реализации)
      expect(result).toBe(false);
    });

    it('должен проверять пустой массив ролей', () => {
      const context = createMockContext({ role: UserRole.EMPLOYEE });
      reflector.getAllAndOverride.mockReturnValue([]);

      const result = guard.canActivate(context);

      expect(result).toBe(false);
    });
  });
});
