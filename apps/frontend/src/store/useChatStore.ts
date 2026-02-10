import { create } from 'zustand';
import type { ChatConversation, ChatMessage } from '@/types';
import { chatApi } from '@/lib/api/chat';

interface ChatState {
  // Data
  conversations: ChatConversation[];
  selectedConversationId: string | null;
  messages: Record<string, ChatMessage[]>; // conversationId → messages
  hasMore: Record<string, boolean>;
  unreadCounts: Record<string, number>;
  typingUsers: Record<string, string[]>; // conversationId → userIds
  replyToMessage: ChatMessage | null;
  loading: boolean;
  messagesLoading: boolean;

  // Actions
  fetchConversations: (search?: string) => Promise<void>;
  selectConversation: (id: string | null) => void;
  fetchMessages: (conversationId: string) => Promise<void>;
  loadMoreMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, data: {
    content?: string;
    type?: 'text' | 'voice';
    replyToId?: string;
    attachments?: any[];
    voiceKey?: string;
    voiceDuration?: number;
    voiceWaveform?: number[];
    mentionedUserIds?: string[];
  }) => Promise<ChatMessage>;
  editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
  markAsRead: (conversationId: string, lastReadMessageId: string) => Promise<void>;
  createConversation: (data: {
    type: 'direct' | 'group' | 'entity';
    name?: string;
    entityId?: string;
    participantIds: string[];
  }) => Promise<ChatConversation>;
  setReplyTo: (message: ChatMessage | null) => void;
  fetchUnreadCounts: () => Promise<void>;

  // WebSocket handlers
  onNewMessage: (conversationId: string, message: ChatMessage) => void;
  onMessageEdited: (conversationId: string, message: ChatMessage) => void;
  onMessageDeleted: (conversationId: string, messageId: string) => void;
  onTyping: (conversationId: string, userId: string) => void;
  onReadReceipt: (conversationId: string, userId: string, lastReadMessageId: string) => void;
  onConversationCreated: (conversation: ChatConversation) => void;
  onConversationUpdated: (data: {
    conversationId: string;
    lastMessageAt: string;
    lastMessagePreview: string;
    lastMessageAuthorId: string;
  }) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  selectedConversationId: null,
  messages: {},
  hasMore: {},
  unreadCounts: {},
  typingUsers: {},
  replyToMessage: null,
  loading: false,
  messagesLoading: false,

  fetchConversations: async (search?: string) => {
    set({ loading: true });
    try {
      const conversations = await chatApi.getConversations(search);
      set({ conversations });
    } finally {
      set({ loading: false });
    }
  },

  selectConversation: (id) => {
    set({ selectedConversationId: id, replyToMessage: null });
  },

  fetchMessages: async (conversationId) => {
    set({ messagesLoading: true });
    try {
      const page = await chatApi.getMessages(conversationId);
      set((state) => ({
        messages: { ...state.messages, [conversationId]: page.messages },
        hasMore: { ...state.hasMore, [conversationId]: page.hasMore },
      }));
    } finally {
      set({ messagesLoading: false });
    }
  },

  loadMoreMessages: async (conversationId) => {
    const state = get();
    const existing = state.messages[conversationId];
    if (!existing || !state.hasMore[conversationId]) return;

    const firstMessage = existing[0];
    if (!firstMessage) return;

    const page = await chatApi.getMessages(conversationId, firstMessage.id);
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: [...page.messages, ...(s.messages[conversationId] || [])],
      },
      hasMore: { ...s.hasMore, [conversationId]: page.hasMore },
    }));
  },

  sendMessage: async (conversationId, data) => {
    const message = await chatApi.sendMessage(conversationId, data);
    set({ replyToMessage: null });
    return message;
  },

  editMessage: async (conversationId, messageId, content) => {
    await chatApi.editMessage(conversationId, messageId, content);
  },

  deleteMessage: async (conversationId, messageId) => {
    await chatApi.deleteMessage(conversationId, messageId);
  },

  markAsRead: async (conversationId, lastReadMessageId) => {
    await chatApi.markAsRead(conversationId, lastReadMessageId);
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [conversationId]: 0 },
    }));
  },

  createConversation: async (data) => {
    const conversation = await chatApi.createConversation(data);
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      selectedConversationId: conversation.id,
    }));
    return conversation;
  },

  setReplyTo: (message) => set({ replyToMessage: message }),

  fetchUnreadCounts: async () => {
    const counts = await chatApi.getUnreadCounts();
    set({ unreadCounts: counts });
  },

  // ─── WebSocket handlers ─────────────────────────────────

  onNewMessage: (conversationId, message) => {
    set((state) => {
      const existing = state.messages[conversationId] || [];
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) return state;

      const newMessages = { ...state.messages, [conversationId]: [...existing, message] };

      // Update conversation in list
      const conversations = state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessageAt: message.createdAt,
              lastMessagePreview:
                message.type === 'voice'
                  ? 'Голосовое сообщение'
                  : (message.content || '').replace(/<[^>]*>/g, '').substring(0, 100),
              lastMessageAuthorId: message.authorId,
              lastMessageAuthor: message.author
                ? { id: message.author.id, firstName: message.author.firstName, lastName: message.author.lastName }
                : null,
            }
          : c,
      );

      // Sort by lastMessageAt
      conversations.sort((a, b) => {
        const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return dateB - dateA;
      });

      // Increment unread if not viewing this conversation
      const unreadCounts = { ...state.unreadCounts };
      if (state.selectedConversationId !== conversationId) {
        unreadCounts[conversationId] = (unreadCounts[conversationId] || 0) + 1;
      }

      return { messages: newMessages, conversations, unreadCounts };
    });
  },

  onMessageEdited: (conversationId, message) => {
    set((state) => {
      const existing = state.messages[conversationId];
      if (!existing) return state;

      return {
        messages: {
          ...state.messages,
          [conversationId]: existing.map((m) => (m.id === message.id ? message : m)),
        },
      };
    });
  },

  onMessageDeleted: (conversationId, messageId) => {
    set((state) => {
      const existing = state.messages[conversationId];
      if (!existing) return state;

      return {
        messages: {
          ...state.messages,
          [conversationId]: existing.map((m) =>
            m.id === messageId ? { ...m, isDeleted: true } : m,
          ),
        },
      };
    });
  },

  onTyping: (conversationId, userId) => {
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      if (current.includes(userId)) return state;

      const newTyping = {
        ...state.typingUsers,
        [conversationId]: [...current, userId],
      };

      // Auto-clear after 3 seconds
      setTimeout(() => {
        set((s) => ({
          typingUsers: {
            ...s.typingUsers,
            [conversationId]: (s.typingUsers[conversationId] || []).filter(
              (id) => id !== userId,
            ),
          },
        }));
      }, 3000);

      return { typingUsers: newTyping };
    });
  },

  onReadReceipt: (conversationId, _userId, _lastReadMessageId) => {
    // Can be used to update checkmarks in the future
    // For now just refetch unread counts
    get().fetchUnreadCounts();
  },

  onConversationCreated: (conversation) => {
    set((state) => {
      if (state.conversations.some((c) => c.id === conversation.id)) return state;
      return { conversations: [conversation, ...state.conversations] };
    });
  },

  onConversationUpdated: (data) => {
    set((state) => ({
      conversations: state.conversations
        .map((c) =>
          c.id === data.conversationId
            ? {
                ...c,
                lastMessageAt: data.lastMessageAt,
                lastMessagePreview: data.lastMessagePreview,
                lastMessageAuthorId: data.lastMessageAuthorId,
              }
            : c,
        )
        .sort((a, b) => {
          const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return dateB - dateA;
        }),
    }));
  },
}));
