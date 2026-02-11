'use client';

import { useState, useEffect } from 'react';
import { Trash2, Loader2, UserPlus } from 'lucide-react';
import { workspacesApi } from '@/lib/api/workspaces';
import { rbacApi } from '@/lib/api/rbac';
import { usersApi } from '@/lib/api/users';
import type { WorkspaceMember, User, Role } from '@/types';

interface WorkspaceMembersProps {
  workspaceId: string;
}

export function WorkspaceMembers({ workspaceId }: WorkspaceMembersProps) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [wsRoles, setWsRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [membersData, usersData, rolesData] = await Promise.all([
        workspacesApi.getMembers(workspaceId),
        usersApi.getAll(),
        rbacApi.getRoles('workspace'),
      ]);
      setMembers(membersData);
      setAllUsers(usersData);
      setWsRoles(rolesData);

      // Выбираем дефолтную роль
      const defaultRole = rolesData.find((r) => r.isDefault) || rolesData.find((r) => r.slug === 'ws_editor');
      if (defaultRole && !selectedRoleId) {
        setSelectedRoleId(defaultRole.id);
      }
    } finally {
      setLoading(false);
    }
  };

  const availableUsers = allUsers.filter(
    (user) => !members.some((m) => m.userId === user.id)
  );

  const handleAddMember = async () => {
    if (!selectedUserId || !selectedRoleId) return;
    setAdding(true);
    try {
      const role = wsRoles.find((r) => r.id === selectedRoleId);
      const legacyRole = role ? slugToLegacyWsRole(role.slug) : 'editor';
      await workspacesApi.addMember(workspaceId, selectedUserId, legacyRole);
      await loadData();
      setShowAddModal(false);
      setSelectedUserId('');
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateRole = async (userId: string, roleId: string) => {
    const role = wsRoles.find((r) => r.id === roleId);
    const legacyRole = role ? slugToLegacyWsRole(role.slug) : 'editor';
    try {
      await workspacesApi.updateMemberRole(workspaceId, userId, legacyRole);
      setMembers(
        members.map((m) =>
          m.userId === userId ? { ...m, role: legacyRole, roleId } : m,
        )
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

  const getMemberRoleId = (member: WorkspaceMember): string => {
    if (member.roleId) return member.roleId;
    const role = wsRoles.find((r) => r.slug === legacyToSlug(member.role));
    return role?.id || '';
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Пользователь</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Роль</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
                        {member.user?.firstName?.[0]}{member.user?.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {member.user?.firstName} {member.user?.lastName}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{member.user?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={getMemberRoleId(member)}
                      onChange={(e) => handleUpdateRole(member.userId, e.target.value)}
                      className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer"
                    >
                      {wsRoles.map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
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

      {wsRoles.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Доступные роли:</h3>
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {wsRoles.map((role) => (
              <li key={role.id}>
                <span className="font-medium">{role.name}</span>
                {role.description && <span> — {role.description}</span>}
                {!role.description && role.isSystem && (
                  <span> — {role.permissions.includes('workspace:*') ? 'полный доступ' : `${role.permissions.length} permissions`}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAddModal && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowAddModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md pointer-events-auto">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Добавить участника</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Пользователь</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Роль</label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {wsRoles.map((role) => (
                      <option key={role.id} value={role.id}>{role.name}</option>
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
                  disabled={!selectedUserId || !selectedRoleId || adding}
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

function slugToLegacyWsRole(slug: string): 'viewer' | 'editor' | 'admin' {
  if (slug === 'ws_admin') return 'admin';
  if (slug === 'ws_viewer') return 'viewer';
  return 'editor';
}

function legacyToSlug(role: string): string {
  if (role === 'admin') return 'ws_admin';
  if (role === 'viewer') return 'ws_viewer';
  return 'ws_editor';
}
