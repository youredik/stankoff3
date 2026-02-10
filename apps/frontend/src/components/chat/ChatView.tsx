'use client';

import { useEffect, useState, useCallback } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ChatSearchPanel } from './ChatSearchPanel';
import { ChatMenu } from './ChatMenu';
import { getSocket } from '@/lib/socket';

interface ChatViewProps {
  conversationId: string;
}

export function ChatView({ conversationId }: ChatViewProps) {
  const { user } = useAuthStore();
  const {
    messages,
    messagesLoading,
    hasMore,
    fetchMessages,
    loadMoreMessages,
    sendMessage,
    markAsRead,
    replyToMessage,
    setReplyTo,
    pinnedMessages,
    fetchPinnedMessages,
  } = useChatStore();
  const [showSearch, setShowSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const currentMessages = messages[conversationId] || [];
  const canLoadMore = hasMore[conversationId] || false;
  const pinned = pinnedMessages[conversationId] || [];

  useEffect(() => {
    fetchMessages(conversationId);
    fetchPinnedMessages(conversationId);
    // Join socket room
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('chat:join', { conversationId });
    }
    return () => {
      if (socket?.connected) {
        socket.emit('chat:leave', { conversationId });
      }
    };
  }, [conversationId, fetchMessages, fetchPinnedMessages]);

  // Mark as read when viewing messages
  useEffect(() => {
    if (currentMessages.length > 0 && user) {
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg.authorId !== user.id) {
        markAsRead(conversationId, lastMsg.id);
      }
    }
  }, [currentMessages, conversationId, user, markAsRead]);

  const handleSend = useCallback(
    async (content: string, attachments?: any[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;
      await sendMessage(conversationId, {
        content,
        replyToId: replyToMessage?.id,
        attachments,
      });
    },
    [conversationId, sendMessage, replyToMessage],
  );

  const handleSendVoice = useCallback(
    async (voiceKey: string, duration: number, waveform: number[]) => {
      await sendMessage(conversationId, {
        type: 'voice',
        voiceKey,
        voiceDuration: duration,
        voiceWaveform: waveform,
      });
    },
    [conversationId, sendMessage],
  );

  const handleLoadMore = useCallback(() => {
    loadMoreMessages(conversationId);
  }, [conversationId, loadMoreMessages]);

  return (
    <div className="flex flex-col h-full bg-[#E8EFFA] dark:bg-[#0E1621]">
      <ChatHeader
        conversationId={conversationId}
        onSearchClick={() => setShowSearch(!showSearch)}
        onMenuClick={() => setShowMenu(!showMenu)}
        pinnedCount={pinned.length}
      />

      {/* Pinned message banner */}
      {pinned.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-white/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 backdrop-blur-sm">
          <div className="w-0.5 h-6 bg-primary-500 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
              Закреплённое сообщение
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {(pinned[pinned.length - 1]?.content || '').replace(/<[^>]*>/g, '').substring(0, 80)}
            </p>
          </div>
        </div>
      )}

      {showSearch && (
        <ChatSearchPanel
          conversationId={conversationId}
          onClose={() => setShowSearch(false)}
        />
      )}

      {showMenu && (
        <ChatMenu
          conversationId={conversationId}
          onClose={() => setShowMenu(false)}
        />
      )}

      <MessageList
        messages={currentMessages}
        currentUserId={user?.id || ''}
        loading={messagesLoading}
        hasMore={canLoadMore}
        onLoadMore={handleLoadMore}
        onReply={setReplyTo}
        conversationId={conversationId}
      />

      <ChatInput
        onSend={handleSend}
        onSendVoice={handleSendVoice}
        replyTo={replyToMessage}
        onCancelReply={() => setReplyTo(null)}
        conversationId={conversationId}
      />
    </div>
  );
}
