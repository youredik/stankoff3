import { create } from 'zustand';
import { rbacApi } from '@/lib/api/rbac';
import { toast } from '@/lib/toast';
import { guardedFetch } from '@/lib/fetchGuard';

/**
 * Wildcard permission matching (зеркалит backend RbacService.matchPermission)
 */
function matchPermission(required: string, granted: string): boolean {
  if (granted === '*') return true;

  const reqParts = required.split(':');
  const grantParts = granted.split(':');

  for (let i = 0; i < reqParts.length; i++) {
    if (i >= grantParts.length) return false;
    if (grantParts[i] === '*') return true;

    // Dot-level wildcard (например entity.field.*)
    if (grantParts[i].includes('.') || reqParts[i].includes('.')) {
      const reqDots = reqParts[i].split('.');
      const grantDots = grantParts[i].split('.');
      let dotMatch = true;
      for (let j = 0; j < reqDots.length; j++) {
        if (j >= grantDots.length) { dotMatch = false; break; }
        if (grantDots[j] === '*') break;
        if (grantDots[j] !== reqDots[j]) { dotMatch = false; break; }
      }
      if (!dotMatch) return false;
      continue;
    }

    if (grantParts[i] !== reqParts[i]) return false;
  }

  return reqParts.length === grantParts.length;
}

function hasPermissionInSet(required: string, permissions: string[]): boolean {
  return permissions.some((granted) => matchPermission(required, granted));
}

// ── State ──────────────────────────────────────

interface PermissionState {
  /** Глобальные permissions текущего пользователя */
  globalPermissions: string[];
  /** Permissions по workspace ID */
  workspacePermissions: Record<string, string[]>;
  /** Загружены ли permissions */
  loaded: boolean;
  /** Идёт загрузка */
  loading: boolean;
}

interface PermissionActions {
  /** Загрузить все permissions текущего пользователя */
  fetchPermissions: () => Promise<void>;
  /** Проверить permission (с учётом wildcard matching) */
  can: (permission: string, workspaceId?: string) => boolean;
  /** Проверить чтение конкретного поля */
  canReadField: (workspaceId: string, fieldId: string) => boolean;
  /** Проверить запись конкретного поля */
  canWriteField: (workspaceId: string, fieldId: string) => boolean;
  /** Сбросить permissions (при logout) */
  reset: () => void;
}

const initialState: PermissionState = {
  globalPermissions: [],
  workspacePermissions: {},
  loaded: false,
  loading: false,
};

export const usePermissionStore = create<PermissionState & PermissionActions>()(
  (set, get) => ({
    ...initialState,

    fetchPermissions: async () => {
      return guardedFetch('permissions', async () => {
        set({ loading: true });
        try {
          const globalResult = await rbacApi.getMyPermissions();
          const wsResult = await rbacApi.getMyWorkspacePermissions();

          set({
            globalPermissions: globalResult.permissions,
            workspacePermissions: wsResult as unknown as Record<string, string[]>,
            loaded: true,
            loading: false,
          });
        } catch {
          toast.error('Не удалось загрузить права доступа');
          set({ loading: false });
        }
      });
    },

    can: (permission: string, workspaceId?: string) => {
      const { globalPermissions, workspacePermissions } = get();

      // Проверяем глобальные permissions (включая wildcard '*')
      if (hasPermissionInSet(permission, globalPermissions)) return true;

      // Если указан workspace — проверяем workspace permissions
      if (workspaceId) {
        const wsPerms = workspacePermissions[workspaceId];
        if (wsPerms && hasPermissionInSet(permission, wsPerms)) return true;
      }

      // Если workspace не указан но permission начинается с workspace: — ищем в любом workspace
      if (!workspaceId && permission.startsWith('workspace:')) {
        for (const wsPerms of Object.values(workspacePermissions)) {
          if (hasPermissionInSet(permission, wsPerms)) return true;
        }
      }

      return false;
    },

    canReadField: (workspaceId: string, fieldId: string) => {
      return get().can(`workspace:entity.field.${fieldId}:read`, workspaceId);
    },

    canWriteField: (workspaceId: string, fieldId: string) => {
      return get().can(`workspace:entity.field.${fieldId}:update`, workspaceId);
    },

    reset: () => set(initialState),
  }),
);

/**
 * Hook для получения `can` с корректной подпиской на изменения permissions.
 *
 * ВАЖНО: `usePermissionStore((s) => s.can)` возвращает стабильную ссылку
 * на функцию, которая никогда не меняется → компонент НЕ перерисовывается
 * когда permissions загружаются. Этот хук подписывается на данные permissions,
 * гарантируя re-render при их изменении.
 */
export function usePermissionCan() {
  usePermissionStore((s) => s.globalPermissions);
  usePermissionStore((s) => s.workspacePermissions);
  return usePermissionStore.getState().can;
}
