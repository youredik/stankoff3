/**
 * Отделы компании Stankoff — данные из legacy БД (таблица department)
 * + IT отдел (добавлен вручную для разработки портала)
 */

export interface SeedDepartment {
  key: string;
  legacyId: number | null;
  legacyAlias: string | null;
  name: string;
}

/**
 * Секция — группа отделов в UI
 */
export interface SeedSection {
  key: string;
  name: string;
  description: string;
  icon: string;
  departmentKeys: string[];
}

export const DEPARTMENTS: SeedDepartment[] = [
  { key: 'admin', legacyId: 1, legacyAlias: 'admin', name: 'Администрация' },
  { key: 'accounting', legacyId: 2, legacyAlias: 'accounting', name: 'Бухгалтерия' },
  { key: 'sales', legacyId: 3, legacyAlias: 'sales', name: 'Отдел продаж' },
  { key: 'logistics', legacyId: 4, legacyAlias: 'logistics', name: 'Логистический отдел' },
  { key: 'service', legacyId: 5, legacyAlias: 'service', name: 'Сервисный отдел' },
  { key: 'marketing', legacyId: 6, legacyAlias: 'marketing', name: 'Маркетинговый отдел' },
  { key: 'it', legacyId: 7, legacyAlias: 'it', name: 'IT отдел' },
  { key: 'fea', legacyId: 8, legacyAlias: 'fea', name: 'Отдел ВЭД' },
  { key: 'legal', legacyId: 9, legacyAlias: 'legal', name: 'Юридический отдел' },
  { key: 'tender', legacyId: 10, legacyAlias: 'tender', name: 'Тендерный отдел' },
  { key: 'warehouse', legacyId: 11, legacyAlias: 'warehouse', name: 'Склад' },
  { key: 'hr', legacyId: 12, legacyAlias: 'hr', name: 'Отдел HR' },
  { key: 'financial', legacyId: 13, legacyAlias: 'financial', name: 'Финансовый отдел' },
];

export const SECTIONS: SeedSection[] = [
  {
    key: 'sales',
    name: 'Продажи',
    description: 'Отдел продаж оборудования',
    icon: '💼',
    departmentKeys: ['sales'],
  },
  {
    key: 'service',
    name: 'Сервис',
    description: 'Сервисное обслуживание и рекламации',
    icon: '🔧',
    departmentKeys: ['service'],
  },
  {
    key: 'marketing',
    name: 'Маркетинг',
    description: 'Маркетинг и продвижение',
    icon: '📣',
    departmentKeys: ['marketing'],
  },
  {
    key: 'warehouse_logistics',
    name: 'Склад и логистика',
    description: 'Складские операции и доставка',
    icon: '📦',
    departmentKeys: ['warehouse', 'logistics'],
  },
  {
    key: 'finance',
    name: 'Финансы',
    description: 'Бухгалтерия и финансы',
    icon: '💰',
    departmentKeys: ['accounting', 'financial'],
  },
  {
    key: 'legal_fea',
    name: 'Юридический и ВЭД',
    description: 'Юридическое сопровождение и внешнеэкономическая деятельность',
    icon: '⚖️',
    departmentKeys: ['legal', 'fea'],
  },
  {
    key: 'management',
    name: 'Управление',
    description: 'Администрация, HR, тендеры',
    icon: '🏢',
    departmentKeys: ['admin', 'hr', 'tender'],
  },
  {
    key: 'it',
    name: 'IT',
    description: 'Разработка и поддержка информационных систем',
    icon: '💻',
    departmentKeys: ['it'],
  },
];
