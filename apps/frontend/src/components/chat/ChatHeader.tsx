'use client';

import { useMemo } from 'react';
import { MoreVertical, Phone, Search } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { usePresenceStore } from '@/store/usePresenceStore';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { getConversationName } from './ConversationList';

interface ChatHeaderProps {
  conversationId: string;
}

export function ChatHeader({ conversationId }: ChatHeaderProps) {
  const { user } = useAuthStore();
  const conversations = useChatStore((s) => s.conversations);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const onlineUserIds = usePresenceStore((s) => s.onlineUserIds);

  const conversation = conversations.find((c) => c.id === conversationId);
  if (!conversation) return null;

  const name = getConversationName(conversation, user?.id);
  const typing = typingUsers[conversationId] || [];

  // Get other participant for direct chats
  const otherParticipant = conversation.type === 'direct'
    ? conversation.participants?.find((p) => p.userId !== user?.id && !p.leftAt)
    : null;

  // Status text
  let statusText = '';
  if (typing.length > 0) {
    statusText = 'печатает...';
  } else if (conversation.type === 'direct' && otherParticipant) {
    statusText = onlineUserIds.has(otherParticipant.userId) ? 'в сети' : 'не в сети';
  } else {
    const activeCount = conversation.participants?.filter((p) => !p.leftAt).length || 0;
    statusText = `${activeCount} участников`;
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3">
        {conversation.type === 'direct' && otherParticipant?.user ? (
          <UserAvatar
            firstName={otherParticipant.user.firstName}
            lastName={otherParticipant.user.lastName}
            userId={otherParticipant.userId}
            size="md"
          />
        ) : null}

        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {name}
          </h3>
          <p className={`text-xs ${
            typing.length > 0
              ? 'text-primary-500'
              : 'text-gray-500 dark:text-gray-400'
          }`}>
            {statusText}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
          <Search className="w-5 h-5" />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
