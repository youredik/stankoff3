'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, Smile, X, Mic } from 'lucide-react';
import type { ChatMessage } from '@/types';
import { io } from 'socket.io-client';
import { useAuthStore } from '@/store/useAuthStore';

interface ChatInputProps {
  onSend: (content: string, attachments?: any[]) => void;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  conversationId: string;
}

export function ChatInput({
  onSend,
  replyTo,
  onCancelReply,
  conversationId,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '0';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [content]);

  // Focus on mount and when replying
  useEffect(() => {
    textareaRef.current?.focus();
  }, [replyTo]);

  const handleSend = useCallback(() => {
    if (!content.trim()) return;
    onSend(content);
    setContent('');
    textareaRef.current?.focus();
  }, [content, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Emit typing indicator
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);

      // Throttle typing events
      if (typingTimeoutRef.current) return;
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2000);
    },
    [],
  );

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-700">
          <div className="w-0.5 h-8 bg-primary-500 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
              {replyTo.author?.firstName} {replyTo.author?.lastName}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {(replyTo.content || '').replace(/<[^>]*>/g, '').substring(0, 60)}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 px-4 py-3">
        <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors flex-shrink-0 mb-0.5">
          <Paperclip className="w-5 h-5" />
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение..."
            rows={1}
            className="w-full resize-none bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500 max-h-[200px]"
          />
        </div>

        {content.trim() ? (
          <button
            onClick={handleSend}
            className="p-2.5 rounded-full bg-primary-500 hover:bg-primary-600 text-white transition-colors flex-shrink-0 mb-0.5"
          >
            <Send className="w-5 h-5" />
          </button>
        ) : (
          <button className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors flex-shrink-0 mb-0.5">
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
