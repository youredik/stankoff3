'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import {
  Plus,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  Copy,
  Archive,
  Download,
  Upload,
  ArchiveRestore,
  X,
  GitBranch,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Inbox,
  MessageCircle,
  BookOpen,
  Shield,
  Mail,
  Building2,
  Contact,
  Package,
  Database,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useSectionStore } from '@/store/useSectionStore';
import { useSidebarStore } from '@/store/useSidebarStore';
import { workspacesApi } from '@/lib/api/workspaces';
import { useTaskStore } from '@/store/useTaskStore';
import { useChatStore } from '@/store/useChatStore';
import { usePermissionCan } from '@/store/usePermissionStore';
import { ImportModal } from '@/components/workspace/ImportModal';
import { SectionMembersModal } from '@/components/section/SectionMembersModal';
import type { Workspace, MenuSection } from '@/types';

const STORAGE_KEY = 'stankoff-selected-workspace';
const DIRECTORIES_COLLAPSED_KEY = 'stankoff-directories-collapsed';
const SIDEBAR_SCROLL_KEY = 'stankoff-sidebar-scroll';

function getDirectoryIcon(systemType?: string | null) {
  switch (systemType) {
    case 'counterparties': return Building2;
    case 'contacts': return Contact;
    case 'products': return Package;
    default: return Database;
  }
}

// Группировка workspaces по разделам
interface GroupedWorkspaces {
  sections: Array<{
    section: MenuSection;
    workspaces: Workspace[];
  }>;
  ungrouped: Workspace[];
}

function groupWorkspacesBySections(
  workspaces: Workspace[],
  sections: MenuSection[]
): GroupedWorkspaces {
  const sectionMap = new Map<string, Workspace[]>();
  const ungrouped: Workspace[] = [];

  // Инициализируем пустые массивы для всех разделов
  sections.forEach((s) => sectionMap.set(s.id, []));

  // Распределяем workspaces по разделам (системные workspace исключаем)
  workspaces.forEach((ws) => {
    if (ws.showInMenu === false) return;
    if (ws.isSystem) return; // Системные справочники — в отдельной секции

    if (ws.sectionId && sectionMap.has(ws.sectionId)) {
      sectionMap.get(ws.sectionId)!.push(ws);
    } else {
      ungrouped.push(ws);
    }
  });

  // Сортируем workspaces внутри каждого раздела
  sectionMap.forEach((wsList) => {
    wsList.sort((a, b) => a.orderInSection - b.orderInSection);
  });

  // Сортируем ungrouped по имени
  ungrouped.sort((a, b) => a.name.localeCompare(b.name));

  return {
    sections: sections
      .sort((a, b) => a.order - b.order)
      .map((section) => ({
        section,
        workspaces: sectionMap.get(section.id) || [],
      })),
    ungrouped,
  };
}

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  // На страницах /workspace/[id]/* — берём ID из URL; на других страницах — пусто
  const selectedWorkspace = (params?.id as string) || '';
  const { workspaces, fetchWorkspaces, createWorkspace, deleteWorkspace, duplicateWorkspace, archiveWorkspace } =
    useWorkspaceStore();
  const { sections, fetchSections, createSection, deleteSection, updateSection, collapsedSections, toggleSectionCollapsed } =
    useSectionStore();
  const { inboxCount, fetchInboxCount } = useTaskStore();
  const totalChatUnread = useChatStore((s) => {
    const counts = s.unreadCounts;
    return Object.values(counts).reduce((sum, c) => sum + c, 0);
  });
  // Сохранение позиции скролла сайдбара при навигации
  const navRef = useRef<HTMLElement>(null);
  const handleNavScroll = useCallback(() => {
    if (navRef.current) {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(navRef.current.scrollTop));
    }
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const saved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved) nav.scrollTop = Number(saved);
  }, []);

  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [sectionMenuOpen, setSectionMenuOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingSectionName, setCreatingSectionName] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [importWorkspaceId, setImportWorkspaceId] = useState<string | null>(null);
  const [sectionMembersSection, setSectionMembersSection] = useState<MenuSection | null>(null);

  // Permission-based проверки
  const can = usePermissionCan();
  const canCreateWorkspace = can('global:workspace:create');
  const canCreateSection = can('global:section:create');
  const canManageUsers = can('global:user:manage');
  const canManageRoles = can('global:role:manage');

  // Группировка workspaces по разделам (без системных)
  const grouped = useMemo(
    () => groupWorkspacesBySections(workspaces, sections),
    [workspaces, sections]
  );

  // Системные workspace — отдельная секция "Справочники"
  const systemWorkspaces = useMemo(
    () => workspaces.filter((ws) => ws.isSystem).sort((a, b) => a.name.localeCompare(b.name)),
    [workspaces]
  );

  const [directoriesCollapsed, setDirectoriesCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(DIRECTORIES_COLLAPSED_KEY) === 'true';
  });

  const toggleDirectoriesCollapsed = () => {
    setDirectoriesCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(DIRECTORIES_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  useEffect(() => {
    fetchWorkspaces();
    fetchSections();
  }, [fetchWorkspaces, fetchSections]);

  // Начальная загрузка; дальнейшие обновления через WebSocket (task:created / task:updated)
  useEffect(() => {
    fetchInboxCount();
  }, [fetchInboxCount]);

  // Закрытие выпадающих меню при клике снаружи
  useEffect(() => {
    if (!menuOpen && !sectionMenuOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-dropdown-menu]')) return;
      setMenuOpen(null);
      setSectionMenuOpen(null);
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [menuOpen, sectionMenuOpen]);

  const handleCreateWorkspace = async (sectionId?: string) => {
    setCreating(true);
    try {
      const newWorkspace = await createWorkspace({
        name: 'Новое рабочее место',
        icon: '📋',
        sectionId: sectionId || null,
        showInMenu: true,
      } as Partial<Workspace>);
      router.push(`/workspace/${newWorkspace.id}/settings`);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateSection = async () => {
    if (!creatingSectionName?.trim()) return;
    try {
      await createSection({ name: creatingSectionName.trim() });
      setCreatingSectionName(null);
    } catch {
      // Ошибка обработана в store
    }
  };

  const handleUpdateSection = async (id: string) => {
    if (!editingSectionName?.trim()) return;
    try {
      await updateSection(id, { name: editingSectionName.trim() });
      setEditingSectionId(null);
      setEditingSectionName('');
    } catch {
      // Ошибка обработана в store
    }
  };

  const handleDeleteSection = async (id: string) => {
    setSectionMenuOpen(null);
    if (window.confirm('Удалить раздел? Раздел должен быть пустым (без рабочих мест).')) {
      try {
        await deleteSection(id);
      } catch {
        alert('Нельзя удалить раздел, содержащий рабочие места. Сначала переместите их.');
      }
    }
  };

  const handleEditWorkspace = (id: string) => {
    setMenuOpen(null);
    router.push(`/workspace/${id}/settings`);
  };

  const handleDeleteWorkspace = async (id: string) => {
    setMenuOpen(null);
    if (window.confirm('Удалить рабочее место? Все сущности будут удалены.')) {
      await deleteWorkspace(id);
      if (selectedWorkspace === id && workspaces.length > 1) {
        const next = workspaces.find((w) => w.id !== id);
        if (next) handleWorkspaceChange(next.id);
      }
    }
  };

  const handleDuplicateWorkspace = async (workspace: Workspace) => {
    setMenuOpen(null);
    const newName = `${workspace.name} (копия)`;
    const duplicated = await duplicateWorkspace(workspace.id, newName);
    handleWorkspaceChange(duplicated.id);
  };

  const handleArchiveWorkspace = async (workspace: Workspace) => {
    setMenuOpen(null);
    const newState = !workspace.isArchived;
    await archiveWorkspace(workspace.id, newState);
  };

  const handleExportJson = (id: string) => {
    setMenuOpen(null);
    window.open(workspacesApi.exportJson(id), '_blank');
  };

  const handleExportCsv = (id: string) => {
    setMenuOpen(null);
    window.open(workspacesApi.exportCsv(id), '_blank');
  };

  const handleImport = (id: string) => {
    setMenuOpen(null);
    setImportWorkspaceId(id);
  };

  const { isOpen, close } = useSidebarStore();

  // Navigate to workspace via URL
  const handleWorkspaceChange = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    router.push(`/workspace/${id}`);
    close();
  };

  // Рендер одного workspace
  const renderWorkspaceItem = (workspace: Workspace) => {
    return (
      <div
        key={workspace.id}
        data-testid="sidebar-workspace-item"
        className={`group relative flex items-center rounded transition-colors ${
          selectedWorkspace === workspace.id
            ? 'bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-500/30'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent'
        }`}
      >
        <button
          onClick={() => handleWorkspaceChange(workspace.id)}
          data-testid="sidebar-workspace-button"
          className={`flex-1 flex items-center gap-3 px-3 py-2 cursor-pointer ${
            selectedWorkspace === workspace.id
              ? 'text-primary-600 dark:text-primary-400'
              : 'text-gray-700 dark:text-gray-300'
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`font-medium truncate text-sm ${workspace.isArchived ? 'text-gray-500' : ''}`}>{workspace.name}</span>
              {workspace.isArchived && (
                <Archive className="w-3 h-3 text-gray-500 flex-shrink-0" />
              )}
            </div>
          </div>
          {selectedWorkspace === workspace.id && (
            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-400" />
          )}
        </button>

        {/* Меню настроек - только для пользователей с правами управления workspace */}
        {can('workspace:settings:read', workspace.id) && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(menuOpen === workspace.id ? null : workspace.id);
              }}
              aria-label="Меню рабочего места"
              data-testid="sidebar-workspace-menu"
              className="p-1.5 mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen === workspace.id && (
                <div data-dropdown-menu role="menu" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1 w-48">
                  <button
                    onClick={() => handleEditWorkspace(workspace.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-4 h-4 text-gray-400" />
                    <span>Настроить</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(null);
                      router.push(`/workspace/${workspace.id}/processes`);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  >
                    <GitBranch className="w-4 h-4 text-gray-400" />
                    <span>Бизнес-процессы</span>
                  </button>
                  {!workspace.isSystem && (
                    <button
                      onClick={() => handleDuplicateWorkspace(workspace)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-gray-400" />
                      <span>Дублировать</span>
                    </button>
                  )}
                  {!workspace.isSystem && (
                    <button
                      onClick={() => handleArchiveWorkspace(workspace)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    >
                      {workspace.isArchived ? (
                        <>
                          <ArchiveRestore className="w-4 h-4 text-gray-400" />
                          <span>Разархивировать</span>
                        </>
                      ) : (
                        <>
                          <Archive className="w-4 h-4 text-gray-400" />
                          <span>Архивировать</span>
                        </>
                      )}
                    </button>
                  )}
                  <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                  <button
                    onClick={() => handleExportJson(workspace.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-gray-400" />
                    <span>Экспорт JSON</span>
                  </button>
                  <button
                    onClick={() => handleExportCsv(workspace.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-gray-400" />
                    <span>Экспорт CSV</span>
                  </button>
                  <button
                    onClick={() => handleImport(workspace.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-gray-400" />
                    <span>Импорт</span>
                  </button>
                  {!workspace.isSystem && (
                    <>
                      <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                      <button
                        onClick={() => handleDeleteWorkspace(workspace.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Удалить</span>
                      </button>
                    </>
                  )}
                </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Рендер раздела с workspaces
  const renderSection = (section: MenuSection, sectionWorkspaces: Workspace[]) => {
    const isCollapsed = collapsedSections[section.id];
    const isEditing = editingSectionId === section.id;

    return (
      <div key={section.id} data-testid="sidebar-section" className="mb-2">
        {/* Заголовок раздела */}
        <div className="group flex items-center gap-1 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800/50">
          {isEditing ? (
            <>
              <span className="p-0.5 text-gray-400">
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
              <input
                type="text"
                value={editingSectionName}
                onChange={(e) => setEditingSectionName(e.target.value)}
                onBlur={() => handleUpdateSection(section.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateSection(section.id);
                  if (e.key === 'Escape') {
                    setEditingSectionId(null);
                    setEditingSectionName('');
                  }
                }}
                autoFocus
                className="flex-1 px-1 py-0.5 text-sm font-medium bg-transparent border-b border-primary-500 focus:outline-none text-gray-700 dark:text-gray-300"
              />
            </>
          ) : (
            <button
              onClick={() => toggleSectionCollapsed(section.id)}
              data-testid="sidebar-section-toggle"
              className="flex-1 flex items-center gap-1 text-left cursor-pointer"
            >
              <span className="p-0.5 text-gray-400">
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
              <span className="flex-1 text-sm font-medium text-gray-600 dark:text-gray-400 truncate">
                {section.name}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {sectionWorkspaces.length}
              </span>
            </button>
          )}

          {/* Меню раздела - для пользователей с правами управления */}
          {(canCreateSection || can('section:update')) && !isEditing && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSectionMenuOpen(sectionMenuOpen === section.id ? null : section.id);
                }}
                aria-label="Меню раздела"
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {sectionMenuOpen === section.id && (
                  <div data-dropdown-menu onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-[60] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1 w-44">
                    <button
                      onClick={() => {
                        setSectionMenuOpen(null);
                        setEditingSectionId(section.id);
                        setEditingSectionName(section.name);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4 text-gray-400" />
                      <span>Переименовать</span>
                    </button>
                    <button
                      onClick={() => {
                        setSectionMenuOpen(null);
                        setSectionMembersSection(section);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>Участники</span>
                    </button>
                    <button
                      onClick={() => {
                        setSectionMenuOpen(null);
                        handleCreateWorkspace(section.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-gray-400" />
                      <span>Добавить место</span>
                    </button>
                    <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                    <button
                      onClick={() => handleDeleteSection(section.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Удалить раздел</span>
                    </button>
                  </div>
              )}
            </div>
          )}
        </div>

        {/* Workspaces в разделе */}
        {!isCollapsed && (
          <div className="ml-4 space-y-0.5">
            {sectionWorkspaces.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                Пусто
              </div>
            ) : (
              sectionWorkspaces.map(renderWorkspaceItem)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Import Modal */}
      {importWorkspaceId && (
        <ImportModal
          workspaceId={importWorkspaceId}
          onClose={() => setImportWorkspaceId(null)}
        />
      )}

      {/* Section Members Modal */}
      {sectionMembersSection && (
        <SectionMembersModal
          section={sectionMembersSection}
          onClose={() => setSectionMembersSection(null)}
        />
      )}

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={close}
        />
      )}

      <aside
        data-testid="sidebar"
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          flex flex-col overflow-hidden flex-shrink-0
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Close button for mobile */}
        <div className="lg:hidden p-4 flex justify-end border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={close}
            aria-label="Закрыть меню"
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav ref={navRef} onScroll={handleNavScroll} className="p-4 flex-1 overflow-y-auto">
          {/* Create buttons - только для пользователей с правами создания */}
          {(canCreateWorkspace || canCreateSection) && (
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => handleCreateWorkspace()}
                disabled={creating}
                data-testid="sidebar-create-workspace"
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary-500 text-white text-sm font-medium rounded hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{creating ? 'Создаём...' : 'Рабочее место'}</span>
              </button>
              <button
                onClick={() => setCreatingSectionName('')}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                aria-label="Создать раздел"
                title="Создать раздел"
              >
                <FolderPlus className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Форма создания раздела */}
          {creatingSectionName !== null && (
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={creatingSectionName}
                onChange={(e) => setCreatingSectionName(e.target.value)}
                placeholder="Название раздела"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSection();
                  if (e.key === 'Escape') setCreatingSectionName(null);
                }}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleCreateSection}
                disabled={!creatingSectionName.trim()}
                className="px-3 py-2 bg-primary-500 text-white text-sm rounded hover:bg-primary-600 disabled:opacity-50"
              >
                Создать
              </button>
              <button
                onClick={() => setCreatingSectionName(null)}
                aria-label="Отмена"
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Входящие задания */}
          <div className="mb-4">
            <button
              onClick={() => {
                router.push('/tasks');
                close();
              }}
              data-testid="sidebar-inbox-button"
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded transition-colors cursor-pointer ${
                pathname === '/tasks'
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent'
              }`}
            >
              <div className="relative">
                <Inbox className="w-5 h-5" />
                {inboxCount > 0 && (
                  <span data-testid="sidebar-inbox-count" className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] bg-primary-500 text-white text-[10px] font-semibold flex items-center justify-center rounded-full px-1">
                    {inboxCount > 9 ? '9+' : inboxCount}
                  </span>
                )}
              </div>
              <span className="font-medium">Входящие задания</span>
            </button>

            {/* Чат */}
            <button
              onClick={() => {
                router.push('/chat');
                close();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded transition-colors cursor-pointer mt-1 ${
                pathname === '/chat'
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent'
              }`}
            >
              <div className="relative">
                <MessageCircle className="w-5 h-5" />
                {totalChatUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] bg-primary-500 text-white text-[10px] font-semibold flex items-center justify-center rounded-full px-1">
                    {totalChatUnread > 9 ? '9+' : totalChatUnread}
                  </span>
                )}
              </div>
              <span className="font-medium">Чат</span>
            </button>

            {/* База знаний */}
            <button
              onClick={() => {
                router.push('/knowledge-base');
                close();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded transition-colors cursor-pointer mt-1 ${
                pathname === '/knowledge-base'
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="font-medium">База знаний</span>
            </button>
          </div>

          {/* Workspaces */}
          <div className="space-y-1">
            {/* Разделы с workspaces */}
            {grouped.sections.map(({ section, workspaces: sectionWorkspaces }) =>
              renderSection(section, sectionWorkspaces)
            )}

            {/* Workspaces без раздела */}
            {grouped.ungrouped.length > 0 && (
              <div className="space-y-0.5">
                {grouped.ungrouped.map(renderWorkspaceItem)}
              </div>
            )}
          </div>

          {/* Справочники — системные workspace */}
          {systemWorkspaces.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={toggleDirectoriesCollapsed}
                className="w-full flex items-center gap-1 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer"
              >
                <span className="p-0.5 text-gray-400">
                  {directoriesCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </span>
                <Database className="w-4 h-4 text-gray-400" />
                <span className="flex-1 text-sm font-medium text-gray-600 dark:text-gray-400 text-left">
                  Справочники
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {systemWorkspaces.length}
                </span>
              </button>
              {!directoriesCollapsed && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {systemWorkspaces.map((ws) => {
                    const Icon = getDirectoryIcon(ws.systemType);
                    const isActive = selectedWorkspace === ws.id;
                    return (
                      <button
                        key={ws.id}
                        onClick={() => {
                          localStorage.setItem(STORAGE_KEY, ws.id);
                          router.push(`/workspace/${ws.id}?view=table`);
                          close();
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 border border-transparent'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="font-medium truncate text-sm">{ws.name}</span>
                        {isActive && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Bottom section - только для пользователей с правами администрирования */}
          {(canManageUsers || canManageRoles) && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Администрирование
              </div>
              {canManageUsers && (
                <button
                  onClick={() => router.push('/admin/users')}
                  data-testid="sidebar-admin-link"
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200 rounded transition-colors cursor-pointer"
                >
                  <Users className="w-5 h-5" />
                  <span className="font-medium">Пользователи</span>
                </button>
              )}
              {canManageUsers && (
                <button
                  onClick={() => router.push('/admin/invitations')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200 rounded transition-colors cursor-pointer"
                >
                  <Mail className="w-5 h-5" />
                  <span className="font-medium">Приглашения</span>
                </button>
              )}
              {canManageRoles && (
                <button
                  onClick={() => router.push('/admin/roles')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200 rounded transition-colors cursor-pointer"
                >
                  <Shield className="w-5 h-5" />
                  <span className="font-medium">Роли и права</span>
                </button>
              )}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
