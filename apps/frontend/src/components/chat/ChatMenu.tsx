'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { LogOut, UserPlus, Edit3, Users, X, Search, Check, Pencil } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { chatApi } from '@/lib/api/chat';
import { getConversationName } from './ConversationList';

interface ChatMenuProps {
  conversationId: string;
  onClose: () => void;
}

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function ChatMenu({ conversationId, onClose }: ChatMenuProps) {
  const { user } = useAuthStore();
  const conversations = useChatStore((s) => s.conversations);
  const fetchConversations = useChatStore((s) => s.fetchConversations);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [allUsers, setAllUsers] = useState<UserItem[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation) return null;

  const isGroup = conversation.type === 'group';
  const isEntity = conversation.type === 'entity';
  const canManageMembers = isGroup || isEntity;

  const activeParticipants = conversation.participants?.filter(p => !p.leftAt) || [];
  const myParticipant = activeParticipants.find(p => p.userId === user?.id);
  const isOwner = myParticipant?.role === 'owner';

  const handleLeave = async () => {
    if (!user) return;
    try {
      await chatApi.removeParticipant(conversationId, user.id);
      useChatStore.getState().selectConversation(null);
      fetchConversations();
      onClose();
    } catch {
      // error
    }
  };

  const handleAddMembers = async (userId: string) => {
    setLoading(true);
    try {
      await chatApi.addParticipants(conversationId, [userId]);
      fetchConversations();
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await chatApi.removeParticipant(conversationId, userId);
      fetchConversations();
    } catch {
      // error
    }
  };

  const handleUpdateIcon = async (emoji: string) => {
    try {
      await chatApi.updateConversation(conversationId, { icon: emoji || '' });
      fetchConversations();
      setShowIconPicker(false);
    } catch {
      // error
    }
  };

  const startEditingName = useCallback(() => {
    setNameValue(conversation.name || '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [conversation.name]);

  const handleRename = useCallback(async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === conversation.name) {
      setEditingName(false);
      return;
    }
    try {
      await chatApi.updateConversation(conversationId, { name: trimmed });
      fetchConversations();
    } catch {
      // error
    }
    setEditingName(false);
  }, [nameValue, conversation.name, conversationId, fetchConversations]);

  // Load users for add member
  useEffect(() => {
    if (showAddMembers && allUsers.length === 0) {
      import('@/lib/api/client').then(({ apiClient }) =>
        apiClient.get<UserItem[]>('/users').then(r => setAllUsers(r.data))
      );
    }
  }, [showAddMembers, allUsers.length]);

  const participantIds = new Set(activeParticipants.map(p => p.userId));
  const availableUsers = useMemo(() => {
    const q = memberSearch.toLowerCase();
    return allUsers
      .filter(u => !participantIds.has(u.id))
      .filter(u => !q || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, participantIds, memberSearch]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div
        data-testid="chat-menu-panel"
        ref={menuRef}
        className="absolute right-2 top-12 z-50 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {showAddMembers ? 'Добавить участников' : 'Настройки чата'}
          </h3>
          <button onClick={showAddMembers ? () => setShowAddMembers(false) : onClose} aria-label="Закрыть меню" className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {showAddMembers ? (
          /* Add members UI */
          <div>
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  data-testid="chat-menu-member-search"
                  type="text"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="Найти пользователя..."
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 border-0 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:text-gray-200"
                />
              </div>
            </div>
            <div className="max-h-[250px] overflow-y-auto px-2 pb-2">
              {availableUsers.map(u => (
                <button
                  key={u.id}
                  data-testid="chat-menu-add-user"
                  onClick={() => handleAddMembers(u.id)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <UserAvatar firstName={u.firstName} lastName={u.lastName} userId={u.id} size="sm" />
                  <div className="text-left">
                    <span className="text-sm text-gray-900 dark:text-gray-100">{u.firstName} {u.lastName}</span>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                </button>
              ))}
              {availableUsers.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Нет доступных пользователей</p>
              )}
            </div>
          </div>
        ) : (
          /* Main menu */
          <div>
            {/* Rename group chat */}
            {canManageMembers && (
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <span className="text-xs font-medium text-gray-500 uppercase mb-1.5 block">Название чата</span>
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={nameInputRef}
                      data-testid="chat-menu-name-input"
                      type="text"
                      value={nameValue}
                      onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingName(false); }}
                      maxLength={100}
                      placeholder="Введите название..."
                      className="flex-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1.5 border-0 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:text-gray-200"
                    />
                    <button onClick={handleRename} className="p-1.5 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors" title="Сохранить">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditingName(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors" title="Отмена">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    data-testid="chat-menu-rename-btn"
                    onClick={startEditingName}
                    className="flex items-center gap-2 w-full text-left group"
                  >
                    <span className="text-sm text-gray-900 dark:text-gray-100 truncate flex-1">
                      {getConversationName(conversation, user?.id)}
                    </span>
                    <Pencil className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>
            )}

            {/* Participants */}
            <div data-testid="chat-menu-participants" className="px-4 py-2">
              <div className="flex items-center justify-between mb-2">
                <span data-testid="chat-menu-participant-count" className="text-xs font-medium text-gray-500 uppercase">
                  Участники ({activeParticipants.length})
                </span>
                {canManageMembers && (
                  <button
                    data-testid="chat-menu-add-btn"
                    onClick={() => setShowAddMembers(true)}
                    className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Добавить
                  </button>
                )}
              </div>
              <div className="max-h-[180px] overflow-y-auto space-y-0.5">
                {activeParticipants.map(p => (
                  <div key={p.id} data-testid="chat-menu-participant" className="flex items-center gap-2.5 py-1.5 group">
                    <UserAvatar
                      firstName={p.user?.firstName || ''}
                      lastName={p.user?.lastName || ''}
                      userId={p.userId}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate block">
                        {p.user?.firstName} {p.user?.lastName}
                        {p.userId === user?.id && <span className="text-xs text-gray-400 ml-1">(вы)</span>}
                      </span>
                      <span className="text-[10px] text-gray-400">{p.role === 'owner' ? 'Владелец' : p.role === 'admin' ? 'Админ' : ''}</span>
                    </div>
                    {isOwner && p.userId !== user?.id && canManageMembers && (
                      <button
                        data-testid="chat-menu-remove-btn"
                        onClick={() => handleRemoveMember(p.userId)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 transition-opacity"
                        title="Удалить"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Icon picker for group/entity chats */}
            {canManageMembers && (
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-500 uppercase">Иконка чата</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowIconPicker(!showIconPicker)}
                    className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    title="Выбрать иконку"
                  >
                    {conversation.icon || <Edit3 className="w-4 h-4 text-gray-400" />}
                  </button>
                  <span className="text-xs text-gray-400">{conversation.icon ? 'Нажмите чтобы изменить' : 'Нажмите чтобы выбрать'}</span>
                </div>
                {showIconPicker && (
                  <div className="flex flex-wrap gap-1.5 mt-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    {['💬', '🏢', '🚀', '💡', '🎯', '📊', '🔧', '📋', '🎨', '📦', '🔥', '⭐', '💎', '🌍', '📱', '🎮', '🎵', '📸', '🏆', '❤️'].map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleUpdateIcon(conversation.icon === emoji ? '' : emoji)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-base hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${conversation.icon === emoji ? 'bg-primary-100 dark:bg-primary-900/30 ring-1 ring-primary-500' : ''}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="border-t border-gray-100 dark:border-gray-700 py-1">
              {canManageMembers && (
                <button
                  data-testid="chat-menu-leave-btn"
                  onClick={handleLeave}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Покинуть чат
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
