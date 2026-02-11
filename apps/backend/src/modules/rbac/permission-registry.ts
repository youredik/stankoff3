import { RoleScope } from './role.entity';

export interface PermissionDefinition {
  key: string;
  scope: RoleScope;
  category: string;
  label: string;
  description: string;
}

/**
 * Реестр всех permissions с метаданными для UI.
 * Группируется по category для отображения в чекбокс-дереве.
 */
export const PERMISSION_REGISTRY: PermissionDefinition[] = [
  // ── workspace: entities ──────────────────────────────────────
  {
    key: 'workspace:entity:create',
    scope: 'workspace',
    category: 'entities',
    label: 'Создание заявок',
    description: 'Создание новых заявок в рабочем пространстве',
  },
  {
    key: 'workspace:entity:read',
    scope: 'workspace',
    category: 'entities',
    label: 'Просмотр заявок',
    description: 'Просмотр заявок и их деталей',
  },
  {
    key: 'workspace:entity:update',
    scope: 'workspace',
    category: 'entities',
    label: 'Редактирование заявок',
    description: 'Изменение данных существующих заявок',
  },
  {
    key: 'workspace:entity:delete',
    scope: 'workspace',
    category: 'entities',
    label: 'Удаление заявок',
    description: 'Удаление заявок из рабочего пространства',
  },
  {
    key: 'workspace:entity.field.*:read',
    scope: 'workspace',
    category: 'entities',
    label: 'Просмотр всех полей',
    description: 'Просмотр всех кастомных полей заявок',
  },
  {
    key: 'workspace:entity.field.*:update',
    scope: 'workspace',
    category: 'entities',
    label: 'Редактирование всех полей',
    description: 'Изменение всех кастомных полей заявок',
  },

  // ── workspace: comments ──────────────────────────────────────
  {
    key: 'workspace:comment:create',
    scope: 'workspace',
    category: 'comments',
    label: 'Создание комментариев',
    description: 'Добавление комментариев к заявкам',
  },
  {
    key: 'workspace:comment:read',
    scope: 'workspace',
    category: 'comments',
    label: 'Просмотр комментариев',
    description: 'Чтение комментариев к заявкам',
  },
  {
    key: 'workspace:comment:delete',
    scope: 'workspace',
    category: 'comments',
    label: 'Удаление чужих комментариев',
    description: 'Удаление комментариев других пользователей',
  },

  // ── workspace: settings ──────────────────────────────────────
  {
    key: 'workspace:settings:read',
    scope: 'workspace',
    category: 'settings',
    label: 'Просмотр настроек',
    description: 'Просмотр настроек рабочего пространства',
  },
  {
    key: 'workspace:settings:update',
    scope: 'workspace',
    category: 'settings',
    label: 'Изменение настроек',
    description: 'Изменение общих настроек рабочего пространства',
  },
  {
    key: 'workspace:settings.fields:manage',
    scope: 'workspace',
    category: 'settings',
    label: 'Управление конструктором полей',
    description: 'Добавление, удаление и настройка полей в конструкторе',
  },
  {
    key: 'workspace:settings.members:manage',
    scope: 'workspace',
    category: 'settings',
    label: 'Управление участниками',
    description: 'Добавление, удаление и изменение ролей участников',
  },
  {
    key: 'workspace:settings.automation:manage',
    scope: 'workspace',
    category: 'settings',
    label: 'Управление автоматизацией',
    description: 'Настройка правил автоматизации',
  },
  {
    key: 'workspace:settings.sla:manage',
    scope: 'workspace',
    category: 'settings',
    label: 'Управление SLA',
    description: 'Настройка SLA определений',
  },
  {
    key: 'workspace:settings.dmn:manage',
    scope: 'workspace',
    category: 'settings',
    label: 'Управление DMN',
    description: 'Настройка таблиц решений',
  },
  {
    key: 'workspace:settings.forms:manage',
    scope: 'workspace',
    category: 'settings',
    label: 'Управление формами',
    description: 'Настройка форм для пользовательских задач',
  },

  // ── workspace: BPMN ──────────────────────────────────────────
  {
    key: 'workspace:bpmn:manage',
    scope: 'workspace',
    category: 'bpmn',
    label: 'Управление BPMN процессами',
    description: 'Создание, редактирование и развёртывание процессов',
  },
  {
    key: 'workspace:bpmn.task:claim',
    scope: 'workspace',
    category: 'bpmn',
    label: 'Взятие задачи',
    description: 'Возможность взять user task себе',
  },
  {
    key: 'workspace:bpmn.task:complete',
    scope: 'workspace',
    category: 'bpmn',
    label: 'Завершение задачи',
    description: 'Возможность завершить user task',
  },
  {
    key: 'workspace:bpmn.task:delegate',
    scope: 'workspace',
    category: 'bpmn',
    label: 'Делегирование задачи',
    description: 'Делегирование user task другому пользователю',
  },

  // ── workspace: analytics & export ────────────────────────────
  {
    key: 'workspace:analytics:read',
    scope: 'workspace',
    category: 'analytics',
    label: 'Просмотр аналитики',
    description: 'Просмотр аналитики рабочего пространства',
  },
  {
    key: 'workspace:export:manage',
    scope: 'workspace',
    category: 'analytics',
    label: 'Экспорт данных',
    description: 'Экспорт заявок и отчётов',
  },

  // ── section ──────────────────────────────────────────────────
  {
    key: 'section:read',
    scope: 'section',
    category: 'section',
    label: 'Просмотр раздела',
    description: 'Просмотр раздела и списка рабочих пространств в нём',
  },
  {
    key: 'section:update',
    scope: 'section',
    category: 'section',
    label: 'Редактирование раздела',
    description: 'Изменение названия, иконки и описания раздела',
  },
  {
    key: 'section:members:manage',
    scope: 'section',
    category: 'section',
    label: 'Управление участниками раздела',
    description: 'Добавление, удаление и изменение ролей участников раздела',
  },

  // ── global ───────────────────────────────────────────────────
  {
    key: 'global:workspace:create',
    scope: 'global',
    category: 'administration',
    label: 'Создание рабочих пространств',
    description: 'Создание новых рабочих пространств',
  },
  {
    key: 'global:workspace:delete',
    scope: 'global',
    category: 'administration',
    label: 'Удаление рабочих пространств',
    description: 'Удаление рабочих пространств',
  },
  {
    key: 'global:section:create',
    scope: 'global',
    category: 'administration',
    label: 'Создание разделов',
    description: 'Создание новых разделов для группировки пространств',
  },
  {
    key: 'global:section:delete',
    scope: 'global',
    category: 'administration',
    label: 'Удаление разделов',
    description: 'Удаление разделов',
  },
  {
    key: 'global:user:manage',
    scope: 'global',
    category: 'administration',
    label: 'Управление пользователями',
    description: 'Просмотр, создание и деактивация пользователей',
  },
  {
    key: 'global:role:manage',
    scope: 'global',
    category: 'administration',
    label: 'Управление ролями',
    description: 'Создание, редактирование и удаление ролей',
  },
  {
    key: 'global:system:manage',
    scope: 'global',
    category: 'administration',
    label: 'Системные настройки',
    description: 'Управление глобальными настройками портала',
  },
  {
    key: 'global:analytics:read',
    scope: 'global',
    category: 'administration',
    label: 'Глобальная аналитика',
    description: 'Просмотр аналитики по всем рабочим пространствам',
  },
  {
    key: 'global:ai:manage',
    scope: 'global',
    category: 'administration',
    label: 'Управление AI',
    description: 'Настройка AI-ассистента, классификации и RAG',
  },
  {
    key: 'global:legacy:manage',
    scope: 'global',
    category: 'administration',
    label: 'Управление Legacy интеграцией',
    description: 'Управление миграцией и синхронизацией с Legacy CRM',
  },
  {
    key: 'global:chat:manage',
    scope: 'global',
    category: 'administration',
    label: 'Администрирование чатов',
    description: 'Управление всеми чатами и сообщениями',
  },
  {
    key: 'global:knowledge-base:manage',
    scope: 'global',
    category: 'administration',
    label: 'Управление базой знаний',
    description: 'Управление статьями и документами базы знаний',
  },
];

/**
 * Получить permissions сгруппированные по категориям для отображения в UI.
 */
export function getPermissionsByCategory(): Record<string, PermissionDefinition[]> {
  const result: Record<string, PermissionDefinition[]> = {};
  for (const perm of PERMISSION_REGISTRY) {
    if (!result[perm.category]) {
      result[perm.category] = [];
    }
    result[perm.category].push(perm);
  }
  return result;
}

/**
 * Получить permissions только для определённого scope.
 */
export function getPermissionsForScope(scope: RoleScope): PermissionDefinition[] {
  return PERMISSION_REGISTRY.filter((p) => p.scope === scope);
}
