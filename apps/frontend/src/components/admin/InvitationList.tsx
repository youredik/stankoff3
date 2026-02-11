'use client';

import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Loader2,
  RotateCcw,
  XCircle,
  Mail,
} from 'lucide-react';
import { invitationsApi } from '@/lib/api/invitations';
import { InviteModal } from './InviteModal';
import type { Invitation, InvitationStatus } from '@/types';

const STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: 'Ожидает',
  accepted: 'Принято',
  expired: 'Просрочено',
  revoked: 'Отозвано',
};

const STATUS_COLORS: Record<InvitationStatus, string> = {
  pending:
    'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300',
  accepted:
    'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
  expired: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
  revoked: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
};

type StatusFilter = 'all' | InvitationStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Ожидающие' },
  { value: 'accepted', label: 'Принятые' },
  { value: 'expired', label: 'Просроченные' },
  { value: 'revoked', label: 'Отозванные' },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Супер-админ',
  department_head: 'Руководитель отдела',
  employee: 'Сотрудник',
  section_admin: 'Админ раздела',
  section_viewer: 'Просмотр раздела',
  ws_admin: 'Админ workspace',
  ws_editor: 'Редактор workspace',
  ws_viewer: 'Просмотр workspace',
};

function getRoleLabel(slug: string): string {
  return ROLE_LABELS[slug] || slug;
}

export function InvitationList() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invitationsApi.getAll();
      setInvitations(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Ошибка загрузки приглашений';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (invitation: Invitation) => {
    setActionLoading(invitation.id);
    try {
      await invitationsApi.resend(invitation.id);
      await loadInvitations();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Ошибка повторной отправки';
      alert(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async (invitation: Invitation) => {
    if (
      !window.confirm(
        `Отозвать приглашение для ${invitation.email}?`,
      )
    ) {
      return;
    }

    setActionLoading(invitation.id);
    try {
      await invitationsApi.revoke(invitation.id);
      await loadInvitations();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Ошибка отзыва приглашения';
      alert(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleInviteSuccess = () => {
    loadInvitations();
  };

  const filteredInvitations = invitations.filter((inv) => {
    // Фильтр по статусу
    if (statusFilter !== 'all' && inv.status !== statusFilter) {
      return false;
    }

    // Фильтр по поиску
    if (search) {
      const searchLower = search.toLowerCase();
      const fullName = [inv.firstName, inv.lastName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        inv.email.toLowerCase().includes(searchLower) ||
        fullName.includes(searchLower)
      );
    }

    return true;
  });

  const statusCounts = invitations.reduce(
    (acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="text-red-600 dark:text-red-400 text-center">
          {error}
        </div>
        <button
          onClick={loadInvitations}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Приглашения
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {invitations.length} приглашений
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>Пригласить сотрудника</span>
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === 'all'
              ? invitations.length
              : statusCounts[tab.value] || 0;
          const isActive = statusFilter === tab.value;

          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                isActive
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по email или имени..."
          className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                ФИО
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Роль
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Пригласил
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Дата
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredInvitations.map((invitation) => {
              const fullName = [invitation.firstName, invitation.lastName]
                .filter(Boolean)
                .join(' ');

              const invitedByName = invitation.invitedBy
                ? `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`
                : '—';

              const createdDate = new Date(
                invitation.createdAt,
              ).toLocaleDateString('ru-RU');

              const isPending = invitation.status === 'pending';
              const isActionLoading = actionLoading === invitation.id;

              return (
                <tr
                  key={invitation.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                      <span className="text-gray-900 dark:text-gray-100 text-sm">
                        {invitation.email}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400 text-sm">
                    {fullName || '—'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded ${STATUS_COLORS[invitation.status]}`}
                    >
                      {STATUS_LABELS[invitation.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400 text-sm">
                    {getRoleLabel(invitation.globalRoleSlug)}
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400 text-sm">
                    {invitedByName}
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400 text-sm">
                    {createdDate}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {isPending && (
                        <>
                          <button
                            onClick={() => handleResend(invitation)}
                            disabled={isActionLoading}
                            className="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Повторить отправку"
                          >
                            {isActionLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleRevoke(invitation)}
                            disabled={isActionLoading}
                            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                            title="Отозвать"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredInvitations.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                >
                  {search || statusFilter !== 'all'
                    ? 'Ничего не найдено'
                    : 'Нет приглашений'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          onSuccess={handleInviteSuccess}
        />
      )}
    </div>
  );
}
