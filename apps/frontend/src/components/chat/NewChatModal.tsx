'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Search, Users, UserPlus } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/api/client';

interface NewChatModalProps {
  onClose: () => void;
}

interface UserItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function NewChatModal({ onClose }: NewChatModalProps) {
  const { user } = useAuthStore();
  const { createConversation, fetchMessages } = useChatStore();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    apiClient.get<UserItem[]>('/users').then((r) => setUsers(r.data));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users
      .filter((u) => u.id !== user?.id)
      .filter(
        (u) =>
          !q ||
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
  }, [users, search, user?.id]);

  const handleDirectChat = async (otherUser: UserItem) => {
    setLoading(true);
    try {
      const conv = await createConversation({
        type: 'direct',
        participantIds: [otherUser.id],
      });
      fetchMessages(conv.id);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (selectedIds.length === 0 || !groupName.trim()) return;
    setLoading(true);
    try {
      const conv = await createConversation({
        type: 'group',
        name: groupName,
        icon: groupIcon || undefined,
        participantIds: selectedIds,
      });
      fetchMessages(conv.id);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Новый чат
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => { setMode('direct'); setSelectedIds([]); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mode === 'direct'
                ? 'text-primary-600 border-b-2 border-primary-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Личный
          </button>
          <button
            onClick={() => setMode('group')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mode === 'group'
                ? 'text-primary-600 border-b-2 border-primary-500'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            Групповой
          </button>
        </div>

        {/* Group name + icon */}
        {mode === 'group' && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowIconPicker(!showIconPicker)}
                className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title="Выбрать иконку"
              >
                {groupIcon || <Users className="w-5 h-5 text-gray-400" />}
              </button>
              <input
                type="text"
                placeholder="Название группы..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 border-0 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:text-gray-200"
              />
            </div>
            {showIconPicker && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                {['💬', '🏢', '🚀', '💡', '🎯', '📊', '🔧', '📋', '🎨', '📦', '🔥', '⭐', '💎', '🌍', '📱', '🎮', '🎵', '📸', '🏆', '❤️'].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { setGroupIcon(groupIcon === emoji ? '' : emoji); setShowIconPicker(false); }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${groupIcon === emoji ? 'bg-primary-100 dark:bg-primary-900/30 ring-1 ring-primary-500' : ''}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Найти пользователя..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 border-0 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:text-gray-200"
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-2">
          {filtered.map((u) => (
            <div
              key={u.id}
              onClick={() => mode === 'direct' ? handleDirectChat(u) : toggleUser(u.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                selectedIds.includes(u.id)
                  ? 'bg-primary-50 dark:bg-primary-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <UserAvatar
                firstName={u.firstName}
                lastName={u.lastName}
                userId={u.id}
                size="md"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {u.firstName} {u.lastName}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
              </div>
              {mode === 'group' && (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(u.id)}
                  onChange={() => toggleUser(u.id)}
                  className="w-4 h-4 text-primary-600 rounded"
                />
              )}
            </div>
          ))}
        </div>

        {/* Create group button */}
        {mode === 'group' && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleCreateGroup}
              disabled={selectedIds.length === 0 || !groupName.trim() || loading}
              className="w-full py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              Создать группу ({selectedIds.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
