'use client';

import { ReactNode } from 'react';
import { usePermissionStore } from '@/store/usePermissionStore';

interface CanProps {
  /** Permission для проверки (формат: scope:resource:action) */
  permission: string;
  /** ID workspace для контекстной проверки */
  workspaceId?: string;
  /** Контент, отображаемый если есть permission */
  children: ReactNode;
  /** Контент, отображаемый если нет permission (опционально) */
  fallback?: ReactNode;
}

/**
 * Компонент условного рендеринга на основе permissions.
 *
 * @example
 * <Can permission="global:user:manage">
 *   <AdminPanel />
 * </Can>
 *
 * <Can permission="workspace:entity:create" workspaceId={id}>
 *   <CreateButton />
 * </Can>
 *
 * <Can permission="workspace:settings:update" workspaceId={id} fallback={<ReadOnlyView />}>
 *   <EditableSettings />
 * </Can>
 */
export function Can({ permission, workspaceId, children, fallback = null }: CanProps) {
  const can = usePermissionStore((s) => s.can);

  if (can(permission, workspaceId)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
