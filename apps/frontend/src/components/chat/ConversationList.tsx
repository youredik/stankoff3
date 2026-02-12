'use client';

import { useState, useMemo } from 'react';
import { Search, Plus, Sparkles } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { ConversationItem } from './ConversationItem';
import { NewChatModal } from './NewChatModal';
import type { ChatConversation } from '@/types';

export function ConversationList() {
  const { user } = useAuthStore();
  const {
    conversations,
    selectedConversationId,
    selectConversation,
    fetchConversations,
    fetchMessages,
    unreadCounts,
    createAiChat,
  } = useChatStore();
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const name = getConversationName(c, user?.id);
      return name.toLowerCase().includes(q) || c.lastMessagePreview?.toLowerCase().includes(q);
    });
  }, [conversations, search, user?.id]);

  const handleSelect = (conv: ChatConversation) => {
    selectConversation(conv.id);
    fetchMessages(conv.id);
  };

  return (
    <div data-testid="chat-conversation-list" className="flex flex-col h-full">
      {/* Search header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              data-testid="chat-conv-search"
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 border-0 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:text-gray-200"
            />
          </div>
          <button
            data-testid="chat-ai-btn"
            onClick={async () => {
              const conv = await createAiChat();
              if (conv) {
                selectConversation(conv.id);
                fetchMessages(conv.id);
              }
            }}
            className="p-2 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/30 text-primary-500 transition-colors"
            title="AI Ассистент"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <button
            data-testid="chat-new-btn"
            onClick={() => setShowNewChat(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
            title="Новый чат"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {search ? 'Ничего не найдено' : 'Нет чатов'}
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={conv.id === selectedConversationId}
              currentUserId={user?.id || ''}
              unreadCount={unreadCounts[conv.id] || 0}
              onClick={() => handleSelect(conv)}
            />
          ))
        )}
      </div>

      {showNewChat && (
        <NewChatModal onClose={() => setShowNewChat(false)} />
      )}
    </div>
  );
}

export function getConversationName(
  conv: ChatConversation,
  currentUserId?: string,
): string {
  if (conv.name) return conv.name;

  if (conv.type === 'direct' && currentUserId) {
    const other = conv.participants?.find(
      (p) => p.userId !== currentUserId && !p.leftAt,
    );
    if (other?.user) return `${other.user.firstName} ${other.user.lastName}`;
  }

  if (conv.type === 'entity') {
    return `Обсуждение заявки`;
  }

  if (conv.type === 'ai_assistant') {
    return 'AI Ассистент';
  }

  return 'Без названия';
}
