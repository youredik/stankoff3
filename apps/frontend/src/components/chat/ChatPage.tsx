'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useChatStore } from '@/store/useChatStore';
import { ConversationList } from './ConversationList';
import { ChatView } from './ChatView';
import { MessageCircle } from 'lucide-react';

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
    <div className="flex h-[calc(100vh-57px)] bg-gray-100 dark:bg-gray-900">
      {/* Conversation list - Telegram left panel */}
      <div className="w-[380px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <ConversationList />
      </div>

      {/* Chat view - Telegram right panel */}
      <div className="flex-1 flex flex-col">
        {selectedConversationId ? (
          <ChatView conversationId={selectedConversationId} />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-[#E8EFFA] dark:bg-gray-900">
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
