import { create } from 'zustand';
import type { ChatConversation, ChatMessage, ChatMessageReaction } from '@/types';
import { chatApi } from '@/lib/api/chat';
import { toast } from '@/lib/toast';

interface ChatState {
  // Data
  conversations: ChatConversation[];
  selectedConversationId: string | null;
  messages: Record<string, ChatMessage[]>;
  hasMore: Record<string, boolean>;
  unreadCounts: Record<string, number>;
  typingUsers: Record<string, string[]>;
  replyToMessage: ChatMessage | null;
  pinnedMessages: Record<string, ChatMessage[]>;
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
    type: 'direct' | 'group' | 'entity' | 'ai_assistant';
    name?: string;
    icon?: string;
    entityId?: string;
    participantIds: string[];
  }) => Promise<ChatConversation>;
  createAiChat: () => Promise<ChatConversation | null>;
  setReplyTo: (message: ChatMessage | null) => void;
  fetchUnreadCounts: () => Promise<void>;
  toggleReaction: (conversationId: string, messageId: string, emoji: string) => Promise<void>;
  pinMessage: (conversationId: string, messageId: string) => Promise<void>;
  unpinMessage: (conversationId: string, messageId: string) => Promise<void>;
  fetchPinnedMessages: (conversationId: string) => Promise<void>;

  // WebSocket handlers
  onNewMessage: (conversationId: string, message: ChatMessage) => void;
  onMessageEdited: (conversationId: string, message: ChatMessage) => void;
  onMessageDeleted: (conversationId: string, messageId: string) => void;
  onTyping: (conversationId: string, userId: string) => void;
  onReadReceipt: (conversationId: string, userId: string, lastReadMessageId: string, lastReadAt?: string) => void;
  onConversationCreated: (conversation: ChatConversation) => void;
  onConversationUpdated: (data: {
    conversationId: string;
    lastMessageAt?: string;
    lastMessagePreview?: string;
    lastMessageAuthorId?: string;
    name?: string | null;
    icon?: string | null;
  }) => void;
  onReactionUpdated: (conversationId: string, messageId: string, reactions: ChatMessageReaction[]) => void;
  onMessagePinned: (conversationId: string, message: ChatMessage) => void;
  onMessageUnpinned: (conversationId: string, messageId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  selectedConversationId: null,
  messages: {},
  hasMore: {},
  unreadCounts: {},
  typingUsers: {},
  replyToMessage: null,
  pinnedMessages: {},
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
    // Add to local state immediately (WebSocket will dedup via onNewMessage)
    set((state) => {
      const existing = state.messages[conversationId] || [];
      if (existing.some((m) => m.id === message.id)) return { replyToMessage: null };
      return {
        messages: { ...state.messages, [conversationId]: [...existing, message] },
        replyToMessage: null,
      };
    });
    return message;
  },

  editMessage: async (conversationId, messageId, content) => {
    const updated = await chatApi.editMessage(conversationId, messageId, content);
    set((state) => {
      const existing = state.messages[conversationId];
      if (!existing) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: existing.map((m) =>
            m.id === messageId ? { ...m, content: updated.content ?? content, isEdited: true } : m,
          ),
        },
      };
    });
  },

  deleteMessage: async (conversationId, messageId) => {
    await chatApi.deleteMessage(conversationId, messageId);
    set((state) => {
      const existing = state.messages[conversationId];
      if (!existing) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: existing.filter((m) => m.id !== messageId),
        },
      };
    });
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

  createAiChat: async () => {
    // Проверяем, есть ли уже AI-чат
    const state = get();
    const existing = state.conversations.find((c) => c.type === 'ai_assistant');
    if (existing) {
      set({ selectedConversationId: existing.id });
      return existing;
    }
    try {
      const conversation = await chatApi.createConversation({
        type: 'ai_assistant',
        name: 'AI Ассистент',
        participantIds: [],
      });
      set((s) => ({
        conversations: [conversation, ...s.conversations],
        selectedConversationId: conversation.id,
      }));
      return conversation;
    } catch {
      toast.error('Не удалось создать чат с AI');
      return null;
    }
  },

  setReplyTo: (message) => set({ replyToMessage: message }),

  fetchUnreadCounts: async () => {
    const counts = await chatApi.getUnreadCounts();
    set({ unreadCounts: counts });
  },

  toggleReaction: async (conversationId, messageId, emoji) => {
    try {
      const result = await chatApi.toggleReaction(conversationId, messageId, emoji);
      const reactions = Array.isArray(result) ? result : result?.reactions;
      if (reactions) {
        set((state) => {
          const existing = state.messages[conversationId];
          if (!existing) return state;
          return {
            messages: {
              ...state.messages,
              [conversationId]: existing.map((m) =>
                m.id === messageId ? { ...m, reactions } : m,
              ),
            },
          };
        });
      }
    } catch {
      toast.error('Не удалось обновить реакцию');
    }
  },

  pinMessage: async (conversationId, messageId) => {
    try {
      await chatApi.pinMessage(conversationId, messageId);
      set((state) => {
        const msgs = state.messages[conversationId] || [];
        const msg = msgs.find((m) => m.id === messageId);
        return {
          messages: {
            ...state.messages,
            [conversationId]: msgs.map((m) =>
              m.id === messageId ? { ...m, isPinned: true } : m,
            ),
          },
          pinnedMessages: {
            ...state.pinnedMessages,
            [conversationId]: msg
              ? [
                  ...(state.pinnedMessages[conversationId] || []).filter((m) => m.id !== messageId),
                  { ...msg, isPinned: true },
                ]
              : state.pinnedMessages[conversationId] || [],
          },
        };
      });
    } catch {
      toast.error('Не удалось закрепить сообщение');
    }
  },

  unpinMessage: async (conversationId, messageId) => {
    try {
      await chatApi.unpinMessage(conversationId, messageId);
      set((state) => {
        const msgs = state.messages[conversationId] || [];
        return {
          messages: {
            ...state.messages,
            [conversationId]: msgs.map((m) =>
              m.id === messageId ? { ...m, isPinned: false } : m,
            ),
          },
          pinnedMessages: {
            ...state.pinnedMessages,
            [conversationId]: (state.pinnedMessages[conversationId] || []).filter(
              (m) => m.id !== messageId,
            ),
          },
        };
      });
    } catch {
      toast.error('Не удалось открепить сообщение');
    }
  },

  fetchPinnedMessages: async (conversationId) => {
    try {
      const pinned = await chatApi.getPinnedMessages(conversationId);
      set((state) => ({
        pinnedMessages: { ...state.pinnedMessages, [conversationId]: pinned },
      }));
    } catch {
      // Допустимо — закреплённые загрузятся при следующем открытии
    }
  },

  // ─── WebSocket handlers ─────────────────────────────────

  onNewMessage: (conversationId, message) => {
    set((state) => {
      const existing = state.messages[conversationId] || [];
      if (existing.some((m) => m.id === message.id)) return state;

      const newMessages = { ...state.messages, [conversationId]: [...existing, message] };

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

      conversations.sort((a, b) => {
        const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return dateB - dateA;
      });

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

  onReadReceipt: (conversationId, userId, lastReadMessageId, lastReadAt) => {
    // Update participant's lastReadAt in conversation data for read receipt display
    set((state) => ({
      conversations: state.conversations.map(c => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          participants: (c.participants || []).map(p => {
            if (p.userId !== userId) return p;
            return {
              ...p,
              lastReadMessageId,
              lastReadAt: lastReadAt || new Date().toISOString(),
            };
          }),
        };
      }),
    }));
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
                ...(data.lastMessageAt !== undefined && { lastMessageAt: data.lastMessageAt }),
                ...(data.lastMessagePreview !== undefined && { lastMessagePreview: data.lastMessagePreview }),
                ...(data.lastMessageAuthorId !== undefined && { lastMessageAuthorId: data.lastMessageAuthorId }),
                ...(data.name !== undefined && { name: data.name }),
                ...(data.icon !== undefined && { icon: data.icon }),
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

  onReactionUpdated: (conversationId, messageId, reactions) => {
    set((state) => {
      const existing = state.messages[conversationId];
      if (!existing) return state;
      return {
        messages: {
          ...state.messages,
          [conversationId]: existing.map((m) =>
            m.id === messageId ? { ...m, reactions } : m,
          ),
        },
      };
    });
  },

  onMessagePinned: (conversationId, message) => {
    set((state) => {
      const current = state.pinnedMessages[conversationId] || [];
      if (current.some(m => m.id === message.id)) return state;
      return {
        pinnedMessages: {
          ...state.pinnedMessages,
          [conversationId]: [...current, message],
        },
      };
    });
  },

  onMessageUnpinned: (conversationId, messageId) => {
    set((state) => {
      const current = state.pinnedMessages[conversationId] || [];
      return {
        pinnedMessages: {
          ...state.pinnedMessages,
          [conversationId]: current.filter(m => m.id !== messageId),
        },
      };
    });
  },
}));
