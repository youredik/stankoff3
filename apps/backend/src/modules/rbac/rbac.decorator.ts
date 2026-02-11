import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Декоратор для указания необходимых permissions на endpoint.
 * Все указанные permissions должны быть у пользователя (AND логика).
 *
 * Контекст (workspaceId, sectionId) автоматически извлекается из запроса.
 *
 * @example
 * @RequirePermission('global:workspace:create')
 * @Post()
 * async create() { ... }
 *
 * @example
 * @RequirePermission('workspace:entity:create')
 * @Post()
 * async createEntity() { ... }
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
