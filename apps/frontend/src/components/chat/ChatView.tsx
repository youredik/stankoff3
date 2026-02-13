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
    conversations,
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
  const isAiChat = conversations.find((c) => c.id === conversationId)?.type === 'ai_assistant';

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
    async (content: string, attachments?: any[], mentionedUserIds?: string[]) => {
      const text = content.replace(/<[^>]*>/g, '').trim();
      if (!text && (!attachments || attachments.length === 0)) return;
      await sendMessage(conversationId, {
        content,
        replyToId: replyToMessage?.id,
        attachments,
        mentionedUserIds,
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

  const scrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('animate-highlight-msg');
      setTimeout(() => el.classList.remove('animate-highlight-msg'), 2000);
    }
  }, []);

  return (
    <div data-testid="chat-view" className="flex flex-col h-full bg-[#E8EFFA] dark:bg-[#0E1621]">
      <ChatHeader
        conversationId={conversationId}
        onSearchClick={() => setShowSearch(!showSearch)}
        onMenuClick={() => setShowMenu(!showMenu)}
        pinnedCount={pinned.length}
      />

      {/* Pinned message banner */}
      {pinned.length > 0 && (() => {
        const lastPinned = pinned[pinned.length - 1];
        return (
          <button
            data-testid="chat-pinned-banner"
            onClick={() => scrollToMessage(lastPinned.id)}
            className="flex items-center gap-2 px-4 py-1.5 bg-white/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 backdrop-blur-sm w-full text-left hover:bg-white/90 dark:hover:bg-gray-800/90 transition-colors cursor-pointer"
          >
            <div className="w-0.5 h-6 bg-primary-500 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                Закреплённое сообщение
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {(lastPinned?.content || '').replace(/<[^>]*>/g, '').substring(0, 80)}
              </p>
            </div>
          </button>
        );
      })()}

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
        isAiChat={isAiChat}
      />
    </div>
  );
}
