'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';

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
  } = useChatStore();

  const currentMessages = messages[conversationId] || [];
  const canLoadMore = hasMore[conversationId] || false;

  useEffect(() => {
    fetchMessages(conversationId);
  }, [conversationId, fetchMessages]);

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

  const handleLoadMore = useCallback(() => {
    loadMoreMessages(conversationId);
  }, [conversationId, loadMoreMessages]);

  return (
    <div className="flex flex-col h-full bg-[#E8EFFA] dark:bg-[#0E1621]">
      <ChatHeader conversationId={conversationId} />

      <MessageList
        messages={currentMessages}
        currentUserId={user?.id || ''}
        loading={messagesLoading}
        hasMore={canLoadMore}
        onLoadMore={handleLoadMore}
        onReply={setReplyTo}
      />

      <ChatInput
        onSend={handleSend}
        replyTo={replyToMessage}
        onCancelReply={() => setReplyTo(null)}
        conversationId={conversationId}
      />
    </div>
  );
}
