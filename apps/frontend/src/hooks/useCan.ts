import { usePermissionStore } from '@/store/usePermissionStore';

/**
 * Хук для проверки permission текущего пользователя.
 *
 * @example
 * const canCreate = useCan('workspace:entity:create', workspaceId);
 * const canManageUsers = useCan('global:user:manage');
 */
export function useCan(permission: string, workspaceId?: string): boolean {
  return usePermissionStore((s) => s.can(permission, workspaceId));
}

/**
 * Хук для получения нескольких permissions одновременно.
 *
 * @example
 * const { canCreate, canDelete } = useCanMultiple({
 *   canCreate: ['workspace:entity:create', workspaceId],
 *   canDelete: ['workspace:entity:delete', workspaceId],
 * });
 */
export function useCanMultiple(
  checks: Record<string, [string, string?]>,
): Record<string, boolean> {
  const can = usePermissionStore((s) => s.can);
  const result: Record<string, boolean> = {};
  for (const [key, [permission, wsId]] of Object.entries(checks)) {
    result[key] = can(permission, wsId);
  }
  return result;
}
