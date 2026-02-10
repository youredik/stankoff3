'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  Plus,
  Users,
  MoreVertical,
  Pencil,
  Trash2,
  LogOut,
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
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useSectionStore } from '@/store/useSectionStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useSidebarStore } from '@/store/useSidebarStore';
import { workspacesApi } from '@/lib/api/workspaces';
import { useTaskStore } from '@/store/useTaskStore';
import { useChatStore } from '@/store/useChatStore';
import { ImportModal } from '@/components/workspace/ImportModal';
import { SectionMembersModal } from '@/components/section/SectionMembersModal';
import type { Workspace, MenuSection } from '@/types';

interface SidebarProps {
  selectedWorkspace: string;
  onWorkspaceChange: (id: string) => void;
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

  // Распределяем workspaces по разделам
  workspaces.forEach((ws) => {
    // Фильтруем по showInMenu (только если явно false)
    if (ws.showInMenu === false) return;

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

export function Sidebar({ selectedWorkspace, onWorkspaceChange }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaces, fetchWorkspaces, createWorkspace, deleteWorkspace, duplicateWorkspace, archiveWorkspace } =
    useWorkspaceStore();
  const { sections, fetchSections, createSection, deleteSection, updateSection, collapsedSections, toggleSectionCollapsed } =
    useSectionStore();
  const { user, logout } = useAuthStore();
  const { inboxCount, fetchInboxCount } = useTaskStore();
  const totalChatUnread = useChatStore((s) => {
    const counts = s.unreadCounts;
    return Object.values(counts).reduce((sum, c) => sum + c, 0);
  });
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [sectionMenuOpen, setSectionMenuOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingSectionName, setCreatingSectionName] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [importWorkspaceId, setImportWorkspaceId] = useState<string | null>(null);
  const [sectionMembersSection, setSectionMembersSection] = useState<MenuSection | null>(null);

  // Проверка прав администратора
  const isAdmin = user?.role === 'admin';

  // Группировка workspaces по разделам
  const grouped = useMemo(
    () => groupWorkspacesBySections(workspaces, sections),
    [workspaces, sections]
  );

  const getFullName = () => {
    if (!user) return 'Пользователь';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  useEffect(() => {
    fetchWorkspaces();
    fetchSections();
  }, [fetchWorkspaces, fetchSections]);

  // Начальная загрузка; дальнейшие обновления через WebSocket (task:created / task:updated)
  useEffect(() => {
    fetchInboxCount();
  }, [fetchInboxCount]);

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
        if (next) onWorkspaceChange(next.id);
      }
    }
  };

  const handleDuplicateWorkspace = async (workspace: Workspace) => {
    setMenuOpen(null);
    const newName = `${workspace.name} (копия)`;
    const duplicated = await duplicateWorkspace(workspace.id, newName);
    onWorkspaceChange(duplicated.id);
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

  // Close sidebar on workspace change (mobile)
  const handleWorkspaceChange = (id: string) => {
    onWorkspaceChange(id);
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

        {/* Меню настроек - только для админов */}
        {isAdmin && (
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
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(null)}
                />
                <div role="menu" className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1 w-48">
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
                  <button
                    onClick={() => handleDuplicateWorkspace(workspace)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-gray-400" />
                    <span>Дублировать</span>
                  </button>
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
                  <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                  <button
                    onClick={() => handleDeleteWorkspace(workspace.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Удалить</span>
                  </button>
                </div>
              </>
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

          {/* Меню раздела - только для админов */}
          {isAdmin && !isEditing && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSectionMenuOpen(sectionMenuOpen === section.id ? null : section.id);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {sectionMenuOpen === section.id && (
                  <div className="absolute right-0 top-full mt-1 z-[60] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1 w-44">
                    <button
                      onClick={() => {
                        setSectionMenuOpen(null);
                        setEditingSectionId(section.id);
                        setEditingSectionName(section.name);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    >
                      <Pencil className="w-4 h-4 text-gray-400" />
                      <span>Переименовать</span>
                    </button>
                    <button
                      onClick={() => {
                        setSectionMenuOpen(null);
                        setSectionMembersSection(section);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    >
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>Участники</span>
                    </button>
                    <button
                      onClick={() => {
                        setSectionMenuOpen(null);
                        handleCreateWorkspace(section.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    >
                      <Plus className="w-4 h-4 text-gray-400" />
                      <span>Добавить место</span>
                    </button>
                    <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
                    <button
                      onClick={() => handleDeleteSection(section.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-900/30"
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

      {/* Section Menu Overlay */}
      {sectionMenuOpen && (
        <div
          className="fixed inset-0 z-[55]"
          onClick={() => setSectionMenuOpen(null)}
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
          min-h-screen flex flex-col
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

        <nav className="p-4 flex-1 overflow-y-auto">
          {/* Create buttons - только для админов */}
          {isAdmin && (
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
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Входящие задачи */}
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
              <span className="font-medium">Входящие задачи</span>
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

          {/* Bottom section - только для админов */}
          {isAdmin && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Администрирование
              </div>
              <button
                onClick={() => router.push('/admin/users')}
                data-testid="sidebar-admin-link"
                className="w-full flex items-center gap-3 px-3 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-200 rounded transition-colors cursor-pointer"
              >
                <Users className="w-5 h-5" />
                <span className="font-medium">Пользователи</span>
              </button>
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2">
            <UserAvatar
              firstName={user?.firstName}
              lastName={user?.lastName}
              email={user?.email}
              size="lg"
              showOnline={false}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{getFullName()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              aria-label="Выйти из системы"
              data-testid="sidebar-logout"
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              title="Выйти"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
