import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './rbac.decorator';
import { RbacService } from './rbac.service';

/**
 * Guard для проверки permissions.
 * Заменяет старый RolesGuard.
 *
 * Автоматически извлекает workspaceId и sectionId из:
 * - request.params (workspaceId, sectionId)
 * - request.query (workspaceId, sectionId)
 * - request.body (workspaceId, sectionId)
 *
 * Если endpoint не имеет @RequirePermission — пропускает.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Нет @RequirePermission → пропускаем (доступ по умолчанию)
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Извлекаем контекст из запроса
    const workspaceId =
      request.params?.workspaceId ||
      request.query?.workspaceId ||
      request.body?.workspaceId;

    const sectionId =
      request.params?.sectionId ||
      request.query?.sectionId ||
      request.body?.sectionId;

    // Все permissions должны быть (AND логика)
    for (const permission of requiredPermissions) {
      const has = await this.rbacService.hasPermission(user.id, permission, {
        workspaceId,
        sectionId,
      });
      if (!has) {
        return false;
      }
    }

    return true;
  }
}
