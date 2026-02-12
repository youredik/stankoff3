import { create } from 'zustand';
import { aiApi } from '@/lib/api/ai';
import { useAuthStore } from './useAuthStore';
import { toast } from '@/lib/toast';
import type {
  AiAssistantResponse,
  AiClassification,
  ConversationSummary,
  GeneratedResponse,
  KnowledgeGraphResponse,
} from '@/types/ai';

const CACHE_TTL = 5 * 60 * 1000; // 5 минут — зеркалит backend кэш
const CLASSIFICATION_CACHE_TTL = 10 * 60 * 1000; // 10 минут — классификация меняется редко

interface AssistanceCacheEntry {
  data: AiAssistantResponse;
  loadedAt: number;
}

interface ClassificationCacheEntry {
  data: AiClassification | null;
  loadedAt: number;
}

interface SummaryCacheEntry {
  data: ConversationSummary;
  loadedAt: number;
  commentCount: number;
}

interface KnowledgeGraphCacheEntry {
  data: KnowledgeGraphResponse;
  loadedAt: number;
}

interface AiState {
  // Кэш подсказок по entityId
  assistanceCache: Map<string, AssistanceCacheEntry>;
  assistanceLoading: Map<string, boolean>;

  // Кэш классификации по entityId (с TTL)
  classificationCache: Map<string, ClassificationCacheEntry>;
  classificationLoading: Map<string, boolean>;

  // Сгенерированный ответ (эфемерный, не кэшируется)
  generatedResponse: GeneratedResponse | null;
  isGenerating: boolean;
  streamingDraft: string;

  // Кэш summary по entityId (с TTL + commentCount)
  summaryCache: Map<string, SummaryCacheEntry>;
  summaryLoading: Map<string, boolean>;

  // Кэш графа знаний по entityId (с TTL)
  knowledgeGraphCache: Map<string, KnowledgeGraphCacheEntry>;
  knowledgeGraphLoading: Map<string, boolean>;

  // Actions
  fetchAssistance: (entityId: string, forceRefresh?: boolean) => Promise<AiAssistantResponse | null>;
  fetchClassification: (entityId: string) => Promise<AiClassification | null>;
  classifyEntity: (
    entityId: string,
    title: string,
    description?: string,
    workspaceId?: string,
  ) => Promise<AiClassification | null>;
  applyClassification: (entityId: string) => Promise<AiClassification | null>;
  generateResponse: (entityId: string, additionalContext?: string) => Promise<GeneratedResponse | null>;
  generateResponseStream: (entityId: string, additionalContext?: string) => Promise<GeneratedResponse | null>;
  fetchSummary: (entityId: string, commentCount?: number) => Promise<ConversationSummary | null>;
  fetchKnowledgeGraph: (entityId: string, forceRefresh?: boolean) => Promise<KnowledgeGraphResponse | null>;
  onClassificationReady: (entityId: string) => void;
  invalidateAssistance: (entityId: string) => void;
  invalidateKnowledgeGraph: (entityId: string) => void;
  clearAll: () => void;
}

export const useAiStore = create<AiState>((set, get) => ({
  assistanceCache: new Map(),
  assistanceLoading: new Map(),
  classificationCache: new Map(),
  classificationLoading: new Map(),
  generatedResponse: null,
  isGenerating: false,
  streamingDraft: '',
  summaryCache: new Map(),
  summaryLoading: new Map(),
  knowledgeGraphCache: new Map(),
  knowledgeGraphLoading: new Map(),

  fetchAssistance: async (entityId, forceRefresh = false) => {
    if (!entityId) return null;

    // Проверяем кэш
    if (!forceRefresh) {
      const cached = get().assistanceCache.get(entityId);
      if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
        return cached.data;
      }
    }

    // Уже загружается — не дублируем
    if (get().assistanceLoading.get(entityId)) {
      const cached = get().assistanceCache.get(entityId);
      return cached?.data ?? null;
    }

    set((state) => {
      const loading = new Map(state.assistanceLoading);
      loading.set(entityId, true);
      return { assistanceLoading: loading };
    });

    try {
      const data = await aiApi.getAssistance(entityId);
      set((state) => {
        const cache = new Map(state.assistanceCache);
        const loading = new Map(state.assistanceLoading);
        cache.set(entityId, { data, loadedAt: Date.now() });
        loading.set(entityId, false);
        return { assistanceCache: cache, assistanceLoading: loading };
      });
      return data;
    } catch {
      set((state) => {
        const loading = new Map(state.assistanceLoading);
        loading.set(entityId, false);
        return { assistanceLoading: loading };
      });
      return null;
    }
  },

  fetchClassification: async (entityId) => {
    if (!entityId) return null;

    // Проверяем кэш с TTL
    const cached = get().classificationCache.get(entityId);
    if (cached && Date.now() - cached.loadedAt < CLASSIFICATION_CACHE_TTL) {
      return cached.data;
    }

    // Уже загружается — не дублируем
    if (get().classificationLoading.get(entityId)) {
      return cached?.data ?? null;
    }

    set((state) => {
      const loading = new Map(state.classificationLoading);
      loading.set(entityId, true);
      return { classificationLoading: loading };
    });

    try {
      const data = await aiApi.getClassification(entityId);
      set((state) => {
        const cache = new Map(state.classificationCache);
        const loading = new Map(state.classificationLoading);
        cache.set(entityId, { data, loadedAt: Date.now() });
        loading.set(entityId, false);
        return { classificationCache: cache, classificationLoading: loading };
      });
      return data;
    } catch {
      set((state) => {
        const loading = new Map(state.classificationLoading);
        loading.set(entityId, false);
        return { classificationLoading: loading };
      });
      return null;
    }
  },

  classifyEntity: async (entityId, title, description, workspaceId) => {
    set((state) => {
      const loading = new Map(state.classificationLoading);
      loading.set(entityId, true);
      return { classificationLoading: loading };
    });

    try {
      const result = await aiApi.classifyAndSave(entityId, {
        title,
        description: description || '',
        workspaceId,
      });
      set((state) => {
        const cache = new Map(state.classificationCache);
        const loading = new Map(state.classificationLoading);
        cache.set(entityId, { data: result, loadedAt: Date.now() });
        loading.set(entityId, false);
        return { classificationCache: cache, classificationLoading: loading };
      });
      return result;
    } catch {
      toast.error('Не удалось классифицировать заявку');
      set((state) => {
        const loading = new Map(state.classificationLoading);
        loading.set(entityId, false);
        return { classificationLoading: loading };
      });
      return null;
    }
  },

  applyClassification: async (entityId) => {
    try {
      const applied = await aiApi.applyClassification(entityId);
      set((state) => {
        const cache = new Map(state.classificationCache);
        cache.set(entityId, { data: applied, loadedAt: Date.now() });
        return { classificationCache: cache };
      });
      return applied;
    } catch {
      toast.error('Не удалось применить классификацию');
      return null;
    }
  },

  generateResponse: async (entityId, additionalContext) => {
    if (get().isGenerating) return null;

    set({ isGenerating: true, generatedResponse: null });

    try {
      const response = await aiApi.suggestResponse(entityId, additionalContext);
      set({ generatedResponse: response, isGenerating: false });
      return response;
    } catch {
      toast.error('Не удалось сгенерировать ответ');
      set({ isGenerating: false });
      return null;
    }
  },

  generateResponseStream: async (entityId, additionalContext) => {
    if (get().isGenerating) return null;

    set({ isGenerating: true, streamingDraft: '', generatedResponse: null });

    try {
      const token = useAuthStore.getState().accessToken;
      const response = await fetch(`/api/ai/assist/${entityId}/suggest-response/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ additionalContext }),
      });

      if (!response.ok) {
        set({ isGenerating: false });
        return null;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let draft = '';
      let buffer = '';
      let sources: GeneratedResponse['sources'] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));
            if (event.type === 'chunk') {
              draft += event.text;
              set({ streamingDraft: draft });
            } else if (event.type === 'done') {
              sources = event.sources || [];
            }
          } catch {
            // Игнорируем невалидный JSON
          }
        }
      }

      const result: GeneratedResponse = { draft, sources };
      set({ generatedResponse: result, isGenerating: false, streamingDraft: '' });
      return result;
    } catch {
      toast.error('Не удалось сгенерировать ответ');
      set({ isGenerating: false, streamingDraft: '' });
      return null;
    }
  },

  fetchSummary: async (entityId, commentCount?) => {
    if (!entityId) return null;

    // Проверяем кэш: валиден если TTL не истёк И commentCount совпадает
    const cached = get().summaryCache.get(entityId);
    if (cached) {
      const isFresh = Date.now() - cached.loadedAt < CACHE_TTL;
      const commentCountMatches = commentCount === undefined || cached.commentCount === commentCount;
      if (isFresh && commentCountMatches) {
        return cached.data;
      }
    }

    // Уже загружается — не дублируем
    if (get().summaryLoading.get(entityId)) {
      return cached?.data ?? null;
    }

    set((state) => {
      const loading = new Map(state.summaryLoading);
      loading.set(entityId, true);
      return { summaryLoading: loading };
    });

    try {
      const data = await aiApi.getSummary(entityId);
      set((state) => {
        const cache = new Map(state.summaryCache);
        const loading = new Map(state.summaryLoading);
        cache.set(entityId, {
          data,
          loadedAt: Date.now(),
          commentCount: commentCount ?? data.commentCount,
        });
        loading.set(entityId, false);
        return { summaryCache: cache, summaryLoading: loading };
      });
      return data;
    } catch {
      set((state) => {
        const loading = new Map(state.summaryLoading);
        loading.set(entityId, false);
        return { summaryLoading: loading };
      });
      return null;
    }
  },

  fetchKnowledgeGraph: async (entityId, forceRefresh = false) => {
    if (!entityId) return null;

    // Проверяем кэш
    if (!forceRefresh) {
      const cached = get().knowledgeGraphCache.get(entityId);
      if (cached && Date.now() - cached.loadedAt < CACHE_TTL) {
        return cached.data;
      }
    }

    // Уже загружается — не дублируем
    if (get().knowledgeGraphLoading.get(entityId)) {
      const cached = get().knowledgeGraphCache.get(entityId);
      return cached?.data ?? null;
    }

    set((state) => {
      const loading = new Map(state.knowledgeGraphLoading);
      loading.set(entityId, true);
      return { knowledgeGraphLoading: loading };
    });

    try {
      const data = await aiApi.getKnowledgeGraph(entityId);
      set((state) => {
        const cache = new Map(state.knowledgeGraphCache);
        const loading = new Map(state.knowledgeGraphLoading);
        cache.set(entityId, { data, loadedAt: Date.now() });
        loading.set(entityId, false);
        return { knowledgeGraphCache: cache, knowledgeGraphLoading: loading };
      });
      return data;
    } catch {
      set((state) => {
        const loading = new Map(state.knowledgeGraphLoading);
        loading.set(entityId, false);
        return { knowledgeGraphLoading: loading };
      });
      return null;
    }
  },

  onClassificationReady: (entityId) => {
    // Инвалидируем кэш чтобы fetchClassification не вернул старые данные
    set((state) => {
      const cache = new Map(state.classificationCache);
      cache.delete(entityId);
      return { classificationCache: cache };
    });
    get().fetchClassification(entityId);
  },

  invalidateAssistance: (entityId) => {
    set((state) => {
      const cache = new Map(state.assistanceCache);
      cache.delete(entityId);
      return { assistanceCache: cache };
    });
  },

  invalidateKnowledgeGraph: (entityId) => {
    set((state) => {
      const cache = new Map(state.knowledgeGraphCache);
      cache.delete(entityId);
      return { knowledgeGraphCache: cache };
    });
  },

  clearAll: () => {
    set({
      assistanceCache: new Map(),
      assistanceLoading: new Map(),
      classificationCache: new Map(),
      classificationLoading: new Map(),
      generatedResponse: null,
      isGenerating: false,
      streamingDraft: '',
      summaryCache: new Map(),
      summaryLoading: new Map(),
      knowledgeGraphCache: new Map(),
      knowledgeGraphLoading: new Map(),
    });
  },
}));
