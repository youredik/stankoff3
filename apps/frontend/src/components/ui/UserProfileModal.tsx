'use client';

import { useEffect, useCallback } from 'react';
import { X, Mail, Building2, Shield, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { UserAvatar } from './UserAvatar';
import { useUserProfileStore } from '@/store/useUserProfileStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePresenceStore } from '@/store/usePresenceStore';
import { useChatStore } from '@/store/useChatStore';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  employee: 'Сотрудник',
};

/**
 * Глобальная модалка профиля пользователя.
 * Открывается через useUserProfileStore.openProfile(user).
 * Показывает: аватар (кликабельный), имя, роль, отдел, email, онлайн-статус.
 * Кнопка «Написать» — создаёт или открывает DM.
 */
export function UserProfileModal() {
  const router = useRouter();
  const { profileUser, closeProfile } = useUserProfileStore();
  const currentUser = useAuthStore((s) => s.user);
  const isOnline = usePresenceStore((s) =>
    profileUser ? s.onlineUserIds.has(profileUser.id) : false,
  );
  const { createConversation, selectConversation, fetchMessages, conversations } = useChatStore();

  // Escape закрывает
  useEffect(() => {
    if (!profileUser) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeProfile(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [profileUser, closeProfile]);

  const handleMessage = useCallback(async () => {
    if (!profileUser || profileUser.id === currentUser?.id) return;

    // Ищем существующий DM
    const existingDm = conversations.find(
      (c) =>
        c.type === 'direct' &&
        c.participants?.some((p) => p.userId === profileUser.id && !p.leftAt),
    );

    if (existingDm) {
      selectConversation(existingDm.id);
      fetchMessages(existingDm.id);
    } else {
      const conv = await createConversation({
        type: 'direct',
        participantIds: [profileUser.id],
      });
      fetchMessages(conv.id);
    }

    closeProfile();
    router.push('/chat');
  }, [profileUser, currentUser, conversations, selectConversation, fetchMessages, createConversation, closeProfile, router]);

  if (!profileUser) return null;

  const isMe = profileUser.id === currentUser?.id;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]" onClick={closeProfile} />

      {/* Modal */}
      <div className="fixed inset-0 z-[91] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient background */}
          <div className="relative h-24 bg-gradient-to-br from-primary-500 to-primary-700">
            <button
              onClick={closeProfile}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/20 hover:bg-black/30 text-white transition-colors"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Avatar overlapping header */}
          <div className="flex justify-center -mt-12">
            <div className="ring-4 ring-white dark:ring-gray-900 rounded-full">
              <UserAvatar
                firstName={profileUser.firstName}
                lastName={profileUser.lastName}
                email={profileUser.email}
                avatar={profileUser.avatar}
                userId={profileUser.id}
                size="xl"
              />
            </div>
          </div>

          {/* User info */}
          <div className="text-center px-6 pt-3 pb-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {profileUser.firstName} {profileUser.lastName}
            </h3>

            {/* Online status */}
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
              <span className={`text-xs ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                {isOnline ? 'В сети' : 'Не в сети'}
              </span>
            </div>
          </div>

          {/* Details */}
          <div className="px-6 pb-4 space-y-2">
            {profileUser.email && (
              <div className="flex items-center gap-3 py-2">
                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{profileUser.email}</p>
                </div>
              </div>
            )}

            {profileUser.department && (
              <div className="flex items-center gap-3 py-2">
                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Отдел</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{profileUser.department}</p>
                </div>
              </div>
            )}

            {profileUser.role && (
              <div className="flex items-center gap-3 py-2">
                <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Роль</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {ROLE_LABELS[profileUser.role] || profileUser.role}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {!isMe && (
            <div className="px-6 pb-5">
              <button
                onClick={handleMessage}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Написать сообщение
              </button>
            </div>
          )}

          {isMe && (
            <div className="px-6 pb-5">
              <button
                onClick={() => { closeProfile(); router.push('/profile'); }}
                className="w-full py-2.5 text-sm font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
              >
                Настройки профиля
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
