'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, UserPlus } from 'lucide-react';
import { workspacesApi } from '@/lib/api/workspaces';
import { usersApi } from '@/lib/api/users';
import type { WorkspaceMember, WorkspaceRole, User } from '@/types';

interface WorkspaceMembersProps {
  workspaceId: string;
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  viewer: 'Просмотр',
  editor: 'Редактор',
  admin: 'Администратор',
};

const ROLE_COLORS: Record<WorkspaceRole, string> = {
  viewer: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
  editor: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
  admin: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300',
};

export function WorkspaceMembers({ workspaceId }: WorkspaceMembersProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole>('editor');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [membersData, usersData] = await Promise.all([
        workspacesApi.getMembers(workspaceId),
        usersApi.getAll(),
      ]);
      setMembers(membersData);
      setAllUsers(usersData);
    } finally {
      setLoading(false);
    }
  };

  // Пользователи, которых ещё нет в workspace
  const availableUsers = allUsers.filter(
    (user) => !members.some((m) => m.userId === user.id)
  );

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      const newMember = await workspacesApi.addMember(
        workspaceId,
        selectedUserId,
        selectedRole
      );
      // Загружаем данные заново для получения user relation
      await loadData();
      setShowAddModal(false);
      setSelectedUserId('');
      setSelectedRole('editor');
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateRole = async (userId: string, role: WorkspaceRole) => {
    try {
      await workspacesApi.updateMemberRole(workspaceId, userId, role);
      setMembers(
        members.map((m) => (m.userId === userId ? { ...m, role } : m))
      );
    } catch (error) {
      console.error('Failed to update role:', error);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Удалить участника из рабочего места?')) return;

    setRemoving(userId);
    try {
      await workspacesApi.removeMember(workspaceId, userId);
      setMembers(members.filter((m) => m.userId !== userId));
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Участники</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {members.length} участников в рабочем месте
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          disabled={availableUsers.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UserPlus className="w-4 h-4" />
          <span>Добавить</span>
        </button>
      </div>

      {/* Members List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {members.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <p>Нет участников</p>
            <p className="text-sm mt-1">
              Добавьте участников, чтобы они получили доступ к рабочему месту
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Пользователь
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Роль
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
                        {member.user?.firstName?.[0]}
                        {member.user?.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {member.user?.firstName} {member.user?.lastName}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {member.user?.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleUpdateRole(member.userId, e.target.value as WorkspaceRole)
                      }
                      className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleRemoveMember(member.userId)}
                      disabled={removing === member.userId}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                      title="Удалить"
                    >
                      {removing === member.userId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Roles Description */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Описание ролей:</h3>
        <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <span className="font-medium">Просмотр</span> — только просмотр
            заявок и комментариев
          </li>
          <li>
            <span className="font-medium">Редактор</span> — создание и
            редактирование заявок, комментариев
          </li>
          <li>
            <span className="font-medium">Администратор</span> — полный доступ:
            настройки, участники, удаление
          </li>
        </ul>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowAddModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md pointer-events-auto">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Добавить участника
                </h3>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Пользователь
                  </label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">Выберите пользователя</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Роль
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(e) =>
                      setSelectedRole(e.target.value as WorkspaceRole)
                    }
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleAddMember}
                  disabled={!selectedUserId || adding}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {adding && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Добавить</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
