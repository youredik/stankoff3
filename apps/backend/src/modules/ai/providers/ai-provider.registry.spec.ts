import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiProviderRegistry } from './ai-provider.registry';
import { OpenAiProvider } from './openai.provider';
import { YandexCloudProvider } from './yandex-cloud.provider';
import { LlmCompletionResult, LlmEmbeddingResult } from './base-llm.provider';

describe('AiProviderRegistry', () => {
  let registry: AiProviderRegistry;
  let yandexProvider: jest.Mocked<YandexCloudProvider>;
  let openAiProvider: jest.Mocked<OpenAiProvider>;

  const mockCompletionResult: LlmCompletionResult = {
    content: 'Test response',
    inputTokens: 10,
    outputTokens: 20,
    model: 'test-model',
  };

  const mockEmbeddingResult: LlmEmbeddingResult = {
    embedding: new Array(256).fill(0.1),
    inputTokens: 10,
    model: 'test-embedding-model',
  };

  beforeEach(async () => {
    yandexProvider = {
      name: 'yandex',
      isConfigured: false,
      complete: jest.fn(),
      embed: jest.fn(),
    } as unknown as jest.Mocked<YandexCloudProvider>;

    openAiProvider = {
      name: 'openai',
      isConfigured: false,
      complete: jest.fn(),
      embed: jest.fn(),
    } as unknown as jest.Mocked<OpenAiProvider>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiProviderRegistry,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                AI_LLM_PRIORITY: 'yandex,openai',
                AI_EMBEDDING_PRIORITY: 'yandex,openai',
              };
              return config[key];
            }),
          },
        },
        { provide: YandexCloudProvider, useValue: yandexProvider },
        { provide: OpenAiProvider, useValue: openAiProvider },
      ],
    }).compile();

    registry = module.get<AiProviderRegistry>(AiProviderRegistry);
  });

  describe('isAvailable', () => {
    it('должен вернуть false если нет доступных провайдеров', () => {
      expect(registry.isAvailable()).toBe(false);
    });

    it('должен вернуть true если есть хотя бы один доступный провайдер', () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });
      expect(registry.isCompletionAvailable()).toBe(true);
    });
  });

  describe('isCompletionAvailable', () => {
    it('должен вернуть true если Yandex доступен', () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });
      expect(registry.isCompletionAvailable()).toBe(true);
    });

    it('должен вернуть true если OpenAI доступен', () => {
      Object.defineProperty(openAiProvider, 'isConfigured', { value: true });
      expect(registry.isCompletionAvailable()).toBe(true);
    });

    it('должен вернуть false если нет доступных LLM провайдеров', () => {
      expect(registry.isCompletionAvailable()).toBe(false);
    });
  });

  describe('isEmbeddingAvailable', () => {
    it('должен вернуть true если Yandex доступен (поддерживает embeddings)', () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });
      expect(registry.isEmbeddingAvailable()).toBe(true);
    });

    it('должен вернуть true если OpenAI доступен', () => {
      Object.defineProperty(openAiProvider, 'isConfigured', { value: true });
      expect(registry.isEmbeddingAvailable()).toBe(true);
    });
  });

  describe('complete', () => {
    it('должен использовать Yandex как первый по приоритету', async () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });
      yandexProvider.complete.mockResolvedValue(mockCompletionResult);

      const result = await registry.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.provider).toBe('yandex');
      expect(yandexProvider.complete).toHaveBeenCalled();
    });

    it('должен fallback на OpenAI если Yandex недоступен', async () => {
      Object.defineProperty(openAiProvider, 'isConfigured', { value: true });
      openAiProvider.complete.mockResolvedValue(mockCompletionResult);

      const result = await registry.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.provider).toBe('openai');
      expect(openAiProvider.complete).toHaveBeenCalled();
    });

    it('должен fallback если первый провайдер вернул ошибку', async () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });
      Object.defineProperty(openAiProvider, 'isConfigured', { value: true });

      yandexProvider.complete.mockRejectedValue(new Error('Yandex error'));
      openAiProvider.complete.mockResolvedValue(mockCompletionResult);

      const result = await registry.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.provider).toBe('openai');
      expect(yandexProvider.complete).toHaveBeenCalled();
      expect(openAiProvider.complete).toHaveBeenCalled();
    });

    it('должен выбросить ошибку если все провайдеры недоступны', async () => {
      await expect(
        registry.complete({ messages: [{ role: 'user', content: 'test' }] }),
      ).rejects.toThrow('Все AI провайдеры недоступны');
    });
  });

  describe('embed', () => {
    it('должен использовать Yandex как первый по приоритету для embeddings', async () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });
      yandexProvider.embed.mockResolvedValue(mockEmbeddingResult);

      const result = await registry.embed('test text');

      expect(result.provider).toBe('yandex');
      expect(yandexProvider.embed).toHaveBeenCalledWith('test text');
    });

    it('должен fallback на OpenAI если Yandex недоступен', async () => {
      Object.defineProperty(openAiProvider, 'isConfigured', { value: true });
      openAiProvider.embed.mockResolvedValue(mockEmbeddingResult);

      const result = await registry.embed('test text');

      expect(result.provider).toBe('openai');
      expect(openAiProvider.embed).toHaveBeenCalledWith('test text');
    });

    it('должен выбросить ошибку если нет провайдеров для embeddings', async () => {
      await expect(registry.embed('test text')).rejects.toThrow(
        'Нет доступных провайдеров для embeddings',
      );
    });
  });

  describe('getProvidersInfo', () => {
    it('должен вернуть информацию о всех провайдерах', () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });

      const info = registry.getProvidersInfo();

      expect(info).toHaveLength(2);
      expect(info.find((p) => p.name === 'yandex')?.isConfigured).toBe(true);
      expect(info.find((p) => p.name === 'openai')?.isConfigured).toBe(false);
    });

    it('должен правильно указывать поддержку embeddings', () => {
      const info = registry.getProvidersInfo();

      expect(info.find((p) => p.name === 'yandex')?.supportsEmbeddings).toBe(true);
      expect(info.find((p) => p.name === 'openai')?.supportsEmbeddings).toBe(true);
    });
  });

  describe('getProvider', () => {
    it('должен вернуть провайдер по имени', () => {
      const provider = registry.getProvider('yandex');
      expect(provider).toBe(yandexProvider);
    });

    it('должен вернуть null для несуществующего провайдера', () => {
      const provider = registry.getProvider('unknown' as any);
      expect(provider).toBeNull();
    });
  });

  describe('getCompletionProvider', () => {
    it('должен вернуть Yandex как первый доступный LLM провайдер', () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });

      const provider = registry.getCompletionProvider();
      expect(provider).toBe(yandexProvider);
    });

    it('должен вернуть OpenAI если Yandex недоступен', () => {
      Object.defineProperty(openAiProvider, 'isConfigured', { value: true });

      const provider = registry.getCompletionProvider();
      expect(provider).toBe(openAiProvider);
    });

    it('должен вернуть null если нет доступных LLM провайдеров', () => {
      const provider = registry.getCompletionProvider();
      expect(provider).toBeNull();
    });
  });

  describe('getEmbeddingProvider', () => {
    it('должен вернуть Yandex как первый доступный embedding провайдер', () => {
      Object.defineProperty(yandexProvider, 'isConfigured', { value: true });

      const provider = registry.getEmbeddingProvider();
      expect(provider).toBe(yandexProvider);
    });

    it('должен fallback на OpenAI если Yandex недоступен', () => {
      Object.defineProperty(openAiProvider, 'isConfigured', { value: true });

      const provider = registry.getEmbeddingProvider();
      expect(provider).toBe(openAiProvider);
    });
  });
});
