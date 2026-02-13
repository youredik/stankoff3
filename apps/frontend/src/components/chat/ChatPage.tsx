'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useChatStore } from '@/store/useChatStore';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';
import { MessageCircle, ArrowLeft } from 'lucide-react';

export function ChatPage() {
  const searchParams = useSearchParams();
  const {
    selectedConversationId,
    selectConversation,
    fetchConversations,
    fetchUnreadCounts,
  } = useChatStore();

  useEffect(() => {
    fetchConversations();
    fetchUnreadCounts();
  }, [fetchConversations, fetchUnreadCounts]);

  // Auto-select conversation from URL
  useEffect(() => {
    const convId = searchParams.get('conversation');
    if (convId) selectConversation(convId);
  }, [searchParams, selectConversation]);

  return (
    <div data-testid="chat-page" className="flex flex-1 min-h-0 bg-gray-100 dark:bg-gray-900">
      {/* Conversation list — hidden on mobile when chat is open */}
      <div className={`w-full sm:w-[380px] sm:flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${selectedConversationId ? 'hidden sm:block' : ''}`}>
        <ConversationList />
      </div>

      {/* Chat view — hidden on mobile when no chat is selected */}
      <div className={`flex-1 flex flex-col ${selectedConversationId ? '' : 'hidden sm:flex'}`}>
        {selectedConversationId ? (
          <>
            {/* Mobile back button */}
            <button
              onClick={() => selectConversation(null as unknown as string)}
              className="sm:hidden flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              aria-label="Назад к списку"
            >
              <ArrowLeft className="w-4 h-4" />
              Назад
            </button>
            <ChatView conversationId={selectedConversationId} />
          </>
        ) : (
          <div data-testid="chat-empty-state" className="flex-1 flex items-center justify-center bg-[#E8EFFA] dark:bg-gray-900">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-12 h-12 text-primary-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                Выберите чат для начала общения
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
