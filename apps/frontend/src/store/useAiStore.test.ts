import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAiStore } from './useAiStore';
import type { AiAssistantResponse, AiClassification, GeneratedResponse, ConversationSummary, KnowledgeGraphResponse } from '@/types/ai';

// Mock AI API
vi.mock('@/lib/api/ai', () => ({
  aiApi: {
    getAssistance: vi.fn(),
    getClassification: vi.fn(),
    classifyAndSave: vi.fn(),
    applyClassification: vi.fn(),
    suggestResponse: vi.fn(),
    getSummary: vi.fn(),
    getKnowledgeGraph: vi.fn(),
  },
}));

// Mock auth store
vi.mock('./useAuthStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'test-token' }) },
}));

import { aiApi } from '@/lib/api/ai';

const mockAssistance: AiAssistantResponse = {
  available: true,
  similarCases: [
    {
      requestId: 123,
      subject: 'Тестовая заявка',
      resolution: 'Решение',
      similarity: 0.92,
      legacyUrl: 'https://example.com/123',
    },
  ],
  suggestedExperts: [
    { name: 'Иванов И.И.', relevantCases: 5, topics: ['CNC'] },
  ],
  suggestedActions: ['Назначить эксперта'],
  keywords: ['ЧПУ'],
};

const mockClassification: AiClassification = {
  id: 'cls-1',
  entityId: 'entity-1',
  category: 'technical_support',
  priority: 'high',
  skills: ['mechanical'],
  confidence: 0.85,
  reasoning: 'Тестовое обоснование',
  provider: 'yandex',
  model: 'llama-3.1-70b',
  applied: false,
  createdAt: '2026-02-10T00:00:00Z',
  updatedAt: '2026-02-10T00:00:00Z',
};

const mockGeneratedResponse: GeneratedResponse = {
  draft: 'Добрый день! Рекомендуем...',
  sources: [{ type: 'legacy_request', id: '123', title: 'Заявка #123', similarity: 0.9 }],
};

describe('useAiStore', () => {
  beforeEach(() => {
    useAiStore.setState({
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
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('должен иметь пустое начальное состояние', () => {
      const state = useAiStore.getState();
      expect(state.assistanceCache.size).toBe(0);
      expect(state.assistanceLoading.size).toBe(0);
      expect(state.classificationCache.size).toBe(0);
      expect(state.classificationLoading.size).toBe(0);
      expect(state.generatedResponse).toBeNull();
      expect(state.isGenerating).toBe(false);
      expect(state.streamingDraft).toBe('');
      expect(state.summaryCache.size).toBe(0);
      expect(state.summaryLoading.size).toBe(0);
      expect(state.knowledgeGraphCache.size).toBe(0);
      expect(state.knowledgeGraphLoading.size).toBe(0);
    });
  });

  describe('fetchAssistance', () => {
    it('должен загрузить данные из API и закэшировать', async () => {
      vi.mocked(aiApi.getAssistance).mockResolvedValue(mockAssistance);

      const result = await useAiStore.getState().fetchAssistance('entity-1');

      expect(aiApi.getAssistance).toHaveBeenCalledWith('entity-1');
      expect(result).toEqual(mockAssistance);

      const state = useAiStore.getState();
      expect(state.assistanceCache.get('entity-1')?.data).toEqual(mockAssistance);
      expect(state.assistanceLoading.get('entity-1')).toBe(false);
    });

    it('должен вернуть данные из кэша если TTL не истёк', async () => {
      vi.mocked(aiApi.getAssistance).mockResolvedValue(mockAssistance);

      // Первый вызов — загрузка
      await useAiStore.getState().fetchAssistance('entity-1');
      expect(aiApi.getAssistance).toHaveBeenCalledTimes(1);

      // Второй вызов — из кэша
      const result = await useAiStore.getState().fetchAssistance('entity-1');
      expect(aiApi.getAssistance).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockAssistance);
    });

    it('должен перезагрузить данные при forceRefresh', async () => {
      vi.mocked(aiApi.getAssistance).mockResolvedValue(mockAssistance);

      await useAiStore.getState().fetchAssistance('entity-1');
      await useAiStore.getState().fetchAssistance('entity-1', true);

      expect(aiApi.getAssistance).toHaveBeenCalledTimes(2);
    });

    it('должен вернуть null при ошибке API', async () => {
      vi.mocked(aiApi.getAssistance).mockRejectedValue(new Error('Network error'));

      const result = await useAiStore.getState().fetchAssistance('entity-1');

      expect(result).toBeNull();
      expect(useAiStore.getState().assistanceLoading.get('entity-1')).toBe(false);
    });

    it('должен вернуть null для пустого entityId', async () => {
      const result = await useAiStore.getState().fetchAssistance('');
      expect(result).toBeNull();
      expect(aiApi.getAssistance).not.toHaveBeenCalled();
    });
  });

  describe('fetchClassification', () => {
    it('должен загрузить классификацию из API', async () => {
      vi.mocked(aiApi.getClassification).mockResolvedValue(mockClassification);

      const result = await useAiStore.getState().fetchClassification('entity-1');

      expect(aiApi.getClassification).toHaveBeenCalledWith('entity-1');
      expect(result).toEqual(mockClassification);

      const state = useAiStore.getState();
      expect(state.classificationCache.get('entity-1')?.data).toEqual(mockClassification);
      expect(state.classificationLoading.get('entity-1')).toBe(false);
    });

    it('должен вернуть данные из кэша если TTL не истёк', async () => {
      vi.mocked(aiApi.getClassification).mockResolvedValue(mockClassification);

      await useAiStore.getState().fetchClassification('entity-1');
      expect(aiApi.getClassification).toHaveBeenCalledTimes(1);

      // Второй вызов — из кэша
      const result = await useAiStore.getState().fetchClassification('entity-1');
      expect(aiApi.getClassification).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockClassification);
    });

    it('должен вернуть null при ошибке API', async () => {
      vi.mocked(aiApi.getClassification).mockRejectedValue(new Error('Not found'));

      const result = await useAiStore.getState().fetchClassification('entity-1');

      expect(result).toBeNull();
      expect(useAiStore.getState().classificationLoading.get('entity-1')).toBe(false);
    });
  });

  describe('classifyEntity', () => {
    it('должен классифицировать и обновить кэш', async () => {
      vi.mocked(aiApi.classifyAndSave).mockResolvedValue(mockClassification);

      const result = await useAiStore.getState().classifyEntity(
        'entity-1',
        'Тестовая заявка',
        'Описание проблемы',
        'workspace-1',
      );

      expect(aiApi.classifyAndSave).toHaveBeenCalledWith('entity-1', {
        title: 'Тестовая заявка',
        description: 'Описание проблемы',
        workspaceId: 'workspace-1',
      });
      expect(result).toEqual(mockClassification);
      expect(useAiStore.getState().classificationCache.get('entity-1')?.data).toEqual(mockClassification);
    });

    it('должен вернуть null при ошибке', async () => {
      vi.mocked(aiApi.classifyAndSave).mockRejectedValue(new Error('Error'));

      const result = await useAiStore.getState().classifyEntity('entity-1', 'Заявка');

      expect(result).toBeNull();
      expect(useAiStore.getState().classificationLoading.get('entity-1')).toBe(false);
    });
  });

  describe('applyClassification', () => {
    it('должен применить классификацию и обновить кэш', async () => {
      const appliedClassification = { ...mockClassification, applied: true, appliedAt: '2026-02-10T12:00:00Z' };
      vi.mocked(aiApi.applyClassification).mockResolvedValue(appliedClassification);

      const result = await useAiStore.getState().applyClassification('entity-1');

      expect(aiApi.applyClassification).toHaveBeenCalledWith('entity-1');
      expect(result).toEqual(appliedClassification);
      expect(useAiStore.getState().classificationCache.get('entity-1')?.data?.applied).toBe(true);
    });

    it('должен вернуть null при ошибке', async () => {
      vi.mocked(aiApi.applyClassification).mockRejectedValue(new Error('Error'));

      const result = await useAiStore.getState().applyClassification('entity-1');
      expect(result).toBeNull();
    });
  });

  describe('generateResponse', () => {
    it('должен сгенерировать ответ и сохранить в store', async () => {
      vi.mocked(aiApi.suggestResponse).mockResolvedValue(mockGeneratedResponse);

      const result = await useAiStore.getState().generateResponse('entity-1');

      expect(aiApi.suggestResponse).toHaveBeenCalledWith('entity-1', undefined);
      expect(result).toEqual(mockGeneratedResponse);

      const state = useAiStore.getState();
      expect(state.generatedResponse).toEqual(mockGeneratedResponse);
      expect(state.isGenerating).toBe(false);
    });

    it('должен передать additionalContext', async () => {
      vi.mocked(aiApi.suggestResponse).mockResolvedValue(mockGeneratedResponse);

      await useAiStore.getState().generateResponse('entity-1', 'Дополнительный контекст');

      expect(aiApi.suggestResponse).toHaveBeenCalledWith('entity-1', 'Дополнительный контекст');
    });

    it('должен вернуть null при ошибке', async () => {
      vi.mocked(aiApi.suggestResponse).mockRejectedValue(new Error('Error'));

      const result = await useAiStore.getState().generateResponse('entity-1');

      expect(result).toBeNull();
      expect(useAiStore.getState().isGenerating).toBe(false);
    });
  });

  describe('onClassificationReady', () => {
    it('должен перезагрузить классификацию из API', async () => {
      vi.mocked(aiApi.getClassification).mockResolvedValue(mockClassification);

      useAiStore.getState().onClassificationReady('entity-1');

      // Дожидаемся async вызова
      await vi.waitFor(() => {
        expect(aiApi.getClassification).toHaveBeenCalledWith('entity-1');
      });
    });
  });

  describe('fetchSummary', () => {
    const mockSummary: ConversationSummary = {
      summary: 'Клиент сообщил о проблеме. Требуется диагностика.',
      commentCount: 15,
    };

    it('должен загрузить summary из API', async () => {
      vi.mocked(aiApi.getSummary).mockResolvedValue(mockSummary);

      const result = await useAiStore.getState().fetchSummary('entity-1');

      expect(aiApi.getSummary).toHaveBeenCalledWith('entity-1');
      expect(result).toEqual(mockSummary);
      expect(useAiStore.getState().summaryCache.get('entity-1')?.data).toEqual(mockSummary);
      expect(useAiStore.getState().summaryLoading.get('entity-1')).toBe(false);
    });

    it('должен вернуть null при ошибке', async () => {
      vi.mocked(aiApi.getSummary).mockRejectedValue(new Error('Error'));

      const result = await useAiStore.getState().fetchSummary('entity-1');

      expect(result).toBeNull();
      expect(useAiStore.getState().summaryLoading.get('entity-1')).toBe(false);
    });

    it('должен вернуть null для пустого entityId', async () => {
      const result = await useAiStore.getState().fetchSummary('');
      expect(result).toBeNull();
      expect(aiApi.getSummary).not.toHaveBeenCalled();
    });
  });

  describe('invalidateAssistance', () => {
    it('должен удалить запись из кэша', async () => {
      vi.mocked(aiApi.getAssistance).mockResolvedValue(mockAssistance);

      await useAiStore.getState().fetchAssistance('entity-1');
      expect(useAiStore.getState().assistanceCache.has('entity-1')).toBe(true);

      useAiStore.getState().invalidateAssistance('entity-1');
      expect(useAiStore.getState().assistanceCache.has('entity-1')).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('должен сбросить всё состояние', async () => {
      vi.mocked(aiApi.getAssistance).mockResolvedValue(mockAssistance);
      vi.mocked(aiApi.getClassification).mockResolvedValue(mockClassification);
      vi.mocked(aiApi.suggestResponse).mockResolvedValue(mockGeneratedResponse);

      await useAiStore.getState().fetchAssistance('entity-1');
      await useAiStore.getState().fetchClassification('entity-1');
      await useAiStore.getState().generateResponse('entity-1');

      useAiStore.getState().clearAll();

      const state = useAiStore.getState();
      expect(state.assistanceCache.size).toBe(0);
      expect(state.assistanceLoading.size).toBe(0);
      expect(state.classificationCache.size).toBe(0);
      expect(state.classificationLoading.size).toBe(0);
      expect(state.generatedResponse).toBeNull();
      expect(state.isGenerating).toBe(false);
      expect(state.streamingDraft).toBe('');
      expect(state.summaryCache.size).toBe(0);
      expect(state.summaryLoading.size).toBe(0);
      expect(state.knowledgeGraphCache.size).toBe(0);
      expect(state.knowledgeGraphLoading.size).toBe(0);
    });
  });

  describe('fetchKnowledgeGraph', () => {
    const mockGraph: KnowledgeGraphResponse = {
      nodes: [{ id: 'entity:1', type: 'entity', label: 'Тест' }],
      edges: [],
      centerNodeId: 'entity:1',
    };

    it('должен загрузить граф из API и закэшировать', async () => {
      vi.mocked(aiApi.getKnowledgeGraph).mockResolvedValue(mockGraph);

      const result = await useAiStore.getState().fetchKnowledgeGraph('entity-1');

      expect(aiApi.getKnowledgeGraph).toHaveBeenCalledWith('entity-1');
      expect(result).toEqual(mockGraph);
      expect(useAiStore.getState().knowledgeGraphCache.get('entity-1')?.data).toEqual(mockGraph);
    });

    it('должен вернуть данные из кэша если TTL не истёк', async () => {
      vi.mocked(aiApi.getKnowledgeGraph).mockResolvedValue(mockGraph);

      await useAiStore.getState().fetchKnowledgeGraph('entity-1');
      expect(aiApi.getKnowledgeGraph).toHaveBeenCalledTimes(1);

      const result = await useAiStore.getState().fetchKnowledgeGraph('entity-1');
      expect(aiApi.getKnowledgeGraph).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockGraph);
    });

    it('должен перезагрузить при forceRefresh', async () => {
      vi.mocked(aiApi.getKnowledgeGraph).mockResolvedValue(mockGraph);

      await useAiStore.getState().fetchKnowledgeGraph('entity-1');
      await useAiStore.getState().fetchKnowledgeGraph('entity-1', true);

      expect(aiApi.getKnowledgeGraph).toHaveBeenCalledTimes(2);
    });
  });
});
