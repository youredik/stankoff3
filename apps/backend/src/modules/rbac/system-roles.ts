import { RoleScope } from './role.entity';

/**
 * Определения системных ролей.
 * UUID фиксированы для детерминизма миграции на всех окружениях.
 */
export interface SystemRoleDefinition {
  id: string;
  slug: string;
  name: string;
  scope: RoleScope;
  permissions: string[];
  isDefault: boolean;
  description: string;
}

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  // ── Global ──────────────────────────────────────────────────
  {
    id: '00000000-0000-4000-a000-000000000001',
    slug: 'super_admin',
    name: 'Суперадминистратор',
    scope: 'global',
    permissions: ['*'],
    isDefault: false,
    description: 'Полный доступ ко всем функциям портала',
  },
  {
    id: '00000000-0000-4000-a000-000000000002',
    slug: 'department_head',
    name: 'Руководитель отдела',
    scope: 'global',
    permissions: ['global:analytics:read'],
    isDefault: false,
    description: 'Руководитель отдела с доступом к глобальной аналитике',
  },
  {
    id: '00000000-0000-4000-a000-000000000003',
    slug: 'employee',
    name: 'Сотрудник',
    scope: 'global',
    permissions: [],
    isDefault: true,
    description: 'Базовая роль сотрудника. Доступ определяется ролями в рабочих пространствах',
  },

  // ── Section ─────────────────────────────────────────────────
  {
    id: '00000000-0000-4000-a000-000000000011',
    slug: 'section_admin',
    name: 'Администратор раздела',
    scope: 'section',
    permissions: ['section:*'],
    isDefault: false,
    description: 'Полный доступ к разделу: редактирование, управление участниками',
  },
  {
    id: '00000000-0000-4000-a000-000000000012',
    slug: 'section_viewer',
    name: 'Наблюдатель раздела',
    scope: 'section',
    permissions: ['section:read'],
    isDefault: true,
    description: 'Просмотр раздела и списка рабочих пространств',
  },

  // ── Workspace ───────────────────────────────────────────────
  {
    id: '00000000-0000-4000-a000-000000000021',
    slug: 'ws_admin',
    name: 'Администратор',
    scope: 'workspace',
    permissions: ['workspace:*'],
    isDefault: false,
    description: 'Полный доступ к рабочему пространству: настройки, участники, все данные',
  },
  {
    id: '00000000-0000-4000-a000-000000000022',
    slug: 'ws_editor',
    name: 'Редактор',
    scope: 'workspace',
    permissions: [
      'workspace:entity:*',
      'workspace:entity.field.*:*',
      'workspace:comment:*',
      'workspace:bpmn.task:*',
      'workspace:analytics:read',
    ],
    isDefault: true,
    description: 'Работа с заявками, комментариями и задачами',
  },
  {
    id: '00000000-0000-4000-a000-000000000023',
    slug: 'ws_viewer',
    name: 'Наблюдатель',
    scope: 'workspace',
    permissions: [
      'workspace:entity:read',
      'workspace:entity.field.*:read',
      'workspace:comment:read',
      'workspace:analytics:read',
    ],
    isDefault: false,
    description: 'Только просмотр заявок, комментариев и аналитики',
  },
];

/**
 * Маппинг старых enum-ролей на slug новых ролей.
 * Используется при миграции данных.
 */
export const LEGACY_ROLE_MAPPING = {
  // UserRole enum → global role slug
  global: {
    admin: 'super_admin',
    manager: 'department_head',
    employee: 'employee',
  },
  // WorkspaceRole enum → workspace role slug
  workspace: {
    admin: 'ws_admin',
    editor: 'ws_editor',
    viewer: 'ws_viewer',
  },
  // SectionRole enum → section role slug
  section: {
    admin: 'section_admin',
    viewer: 'section_viewer',
  },
} as const;
