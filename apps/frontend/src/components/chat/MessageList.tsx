'use client';

import { useEffect, useRef, useCallback, useLayoutEffect, useState } from 'react';
import { useMemo } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { DateSeparator } from './DateSeparator';
import { useChatStore } from '@/store/useChatStore';
import type { ChatMessage } from '@/types';

interface MessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onReply: (message: ChatMessage) => void;
  conversationId: string;
}

function shouldShowDate(current: ChatMessage, previous: ChatMessage | null): boolean {
  if (!previous) return true;
  const d1 = new Date(current.createdAt).toDateString();
  const d2 = new Date(previous.createdAt).toDateString();
  return d1 !== d2;
}

function isFirstInGroup(current: ChatMessage, previous: ChatMessage | null): boolean {
  if (!previous) return true;
  if (previous.authorId !== current.authorId) return true;
  if (previous.type === 'system') return true;
  // Different day
  const d1 = new Date(current.createdAt).toDateString();
  const d2 = new Date(previous.createdAt).toDateString();
  if (d1 !== d2) return true;
  // More than 5 minutes apart
  const diff = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return diff > 5 * 60 * 1000;
}

function isLastInGroup(current: ChatMessage, next: ChatMessage | null): boolean {
  if (!next) return true;
  if (next.authorId !== current.authorId) return true;
  if (next.type === 'system') return true;
  const d1 = new Date(current.createdAt).toDateString();
  const d2 = new Date(next.createdAt).toDateString();
  if (d1 !== d2) return true;
  const diff = new Date(next.createdAt).getTime() - new Date(current.createdAt).getTime();
  return diff > 5 * 60 * 1000;
}

export function MessageList({
  messages,
  currentUserId,
  loading,
  hasMore,
  onLoadMore,
  onReply,
  conversationId,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMessagesLenRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const prevConversationIdRef = useRef(conversationId);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Reset on conversation change (during render, before effects)
  if (prevConversationIdRef.current !== conversationId) {
    isInitialLoadRef.current = true;
    prevMessagesLenRef.current = 0;
    prevConversationIdRef.current = conversationId;
  }

  // Compute the latest read time by OTHER participants (for read receipt checkmarks)
  const conversations = useChatStore((s) => s.conversations);
  const readByOthersAt = useMemo(() => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv?.participants) return null;
    let maxReadAt: string | null = null;
    for (const p of conv.participants) {
      if (p.userId === currentUserId || p.leftAt) continue;
      if (p.lastReadAt && (!maxReadAt || p.lastReadAt > maxReadAt)) {
        maxReadAt = p.lastReadAt;
      }
    }
    return maxReadAt;
  }, [conversations, conversationId, currentUserId]);

  // Initial load: scroll to bottom BEFORE paint (Telegram-style, no animation)
  useLayoutEffect(() => {
    if (messages.length > 0 && isInitialLoadRef.current) {
      const el = containerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      isInitialLoadRef.current = false;
      prevMessagesLenRef.current = messages.length;
    }
  }, [messages.length, conversationId]);

  // New messages: smooth scroll only if user is already at bottom
  useEffect(() => {
    if (
      !isInitialLoadRef.current &&
      messages.length > prevMessagesLenRef.current &&
      isAtBottomRef.current
    ) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLenRef.current = messages.length;
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // Check if at bottom
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);

    // Load more when scrolled to top
    if (el.scrollTop < 100 && hasMore && !loading) {
      const prevHeight = el.scrollHeight;
      onLoadMore();
      // Maintain scroll position after prepending
      requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight - prevHeight;
        }
      });
    }
  }, [hasMore, loading, onLoadMore]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-2"
      >
        {/* Load more spinner */}
        {loading && messages.length > 0 && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {/* Initial loading */}
        {loading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const next = i < messages.length - 1 ? messages[i + 1] : null;

          return (
            <div key={msg.id} id={`msg-${msg.id}`}>
              {shouldShowDate(msg, prev) && (
                <DateSeparator date={msg.createdAt} />
              )}
              {!msg.isDeleted && (
                <MessageBubble
                  message={msg}
                  isOwn={msg.authorId === currentUserId}
                  isFirstInGroup={isFirstInGroup(msg, prev)}
                  isLastInGroup={isLastInGroup(msg, next)}
                  onReply={() => onReply(msg)}
                  conversationId={conversationId}
                  isRead={!!readByOthersAt && msg.createdAt <= readByOthersAt}
                />
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-white dark:bg-gray-700 shadow-lg flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowDown className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
      )}
    </div>
  );
}
