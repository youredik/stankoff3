'use client';

import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Users, Sparkles } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { getConversationName } from './ConversationList';
import type { ChatConversation } from '@/types';

interface ConversationItemProps {
  conversation: ChatConversation;
  isSelected: boolean;
  currentUserId: string;
  unreadCount: number;
  onClick: () => void;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Вчера';
  return format(date, 'dd.MM', { locale: ru });
}

export function ConversationItem({
  conversation,
  isSelected,
  currentUserId,
  unreadCount,
  onClick,
}: ConversationItemProps) {
  const name = getConversationName(conversation, currentUserId);

  // Get other user for direct chats
  const otherParticipant = conversation.type === 'direct'
    ? conversation.participants?.find((p) => p.userId !== currentUserId && !p.leftAt)
    : null;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-primary-500 text-white'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {conversation.type === 'ai_assistant' ? (
          <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-violet-500 rounded-full flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        ) : conversation.type === 'direct' && otherParticipant?.user ? (
          <UserAvatar
            firstName={otherParticipant.user.firstName}
            lastName={otherParticipant.user.lastName}
            userId={otherParticipant.userId}
            size="md"
          />
        ) : conversation.icon ? (
          <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center text-lg">
            {conversation.icon}
          </div>
        ) : (
          <div className="w-8 h-8 bg-primary-200 dark:bg-primary-800 rounded-full flex items-center justify-center">
            <Users className="w-4 h-4 text-primary-600 dark:text-primary-300" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 truncate">
            <span
              className={`font-medium text-sm truncate ${
                isSelected ? 'text-white' : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {name}
            </span>
            {conversation.type === 'ai_assistant' && (
              <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                isSelected
                  ? 'bg-white/20 text-white'
                  : 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400'
              }`}>
                AI
              </span>
            )}
          </span>
          <span
            className={`text-xs flex-shrink-0 ml-2 ${
              isSelected
                ? 'text-white/70'
                : unreadCount > 0
                  ? 'text-primary-500'
                  : 'text-gray-400'
            }`}
          >
            {formatTime(conversation.lastMessageAt)}
          </span>
        </div>

        <div className="flex items-center justify-between mt-0.5">
          <p
            className={`text-xs truncate ${
              isSelected ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {conversation.lastMessagePreview || 'Нет сообщений'}
          </p>

          {unreadCount > 0 && (
            <span
              className={`flex-shrink-0 ml-2 min-w-[20px] h-5 flex items-center justify-center rounded-full text-[11px] font-medium px-1.5 ${
                isSelected
                  ? 'bg-white text-primary-500'
                  : 'bg-primary-500 text-white'
              }`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
