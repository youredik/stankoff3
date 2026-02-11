import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { YandexCloudProvider } from './yandex-cloud.provider';

// Мок глобального fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('YandexCloudProvider', () => {
  let provider: YandexCloudProvider;

  const defaultConfig: Record<string, string> = {
    YANDEX_CLOUD_API_KEY: 'test-api-key',
    YANDEX_CLOUD_FOLDER_ID: 'test-folder-id',
    YANDEX_CLOUD_MODEL: 'yandexgpt-lite/latest',
  };

  async function createProvider(config: Record<string, string> = defaultConfig): Promise<YandexCloudProvider> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YandexCloudProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => config[key]),
          },
        },
      ],
    }).compile();

    return module.get<YandexCloudProvider>(YandexCloudProvider);
  }

  beforeEach(async () => {
    mockFetch.mockReset();
    provider = await createProvider();
  });

  describe('isConfigured', () => {
    it('должен быть true если API key и folder ID настроены', () => {
      expect(provider.isConfigured).toBe(true);
    });

    it('должен быть false если API key не настроен', async () => {
      const p = await createProvider({ YANDEX_CLOUD_FOLDER_ID: 'folder' });
      expect(p.isConfigured).toBe(false);
    });

    it('должен быть false если folder ID не настроен', async () => {
      const p = await createProvider({ YANDEX_CLOUD_API_KEY: 'key' });
      expect(p.isConfigured).toBe(false);
    });

    it('должен быть false если ничего не настроено', async () => {
      const p = await createProvider({});
      expect(p.isConfigured).toBe(false);
    });
  });

  describe('name', () => {
    it('должен быть "yandex"', () => {
      expect(provider.name).toBe('yandex');
    });
  });

  describe('complete', () => {
    it('должен отправить запрос и вернуть результат', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            alternatives: [
              { message: { role: 'assistant', text: 'Ответ от YandexGPT' } },
            ],
            usage: { inputTextTokens: '15', completionTokens: '25' },
            modelVersion: '07.03.2024',
          },
        }),
      });

      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Привет' }],
      });

      expect(result.content).toBe('Ответ от YandexGPT');
      expect(result.inputTokens).toBe(15);
      expect(result.outputTokens).toBe(25);
      expect(result.model).toContain('yandexgpt-lite/latest');

      // Проверяем параметры запроса
      expect(mockFetch).toHaveBeenCalledWith(
        'https://llm.api.cloud.yandex.net/foundationModels/v1/completion',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Api-Key test-api-key',
            'x-folder-id': 'test-folder-id',
          }),
        }),
      );

      // Проверяем тело запроса
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.modelUri).toBe('gpt://test-folder-id/yandexgpt-lite/latest');
      expect(body.messages[0]).toEqual({ role: 'user', text: 'Привет' });
      expect(body.completionOptions.stream).toBe(false);
    });

    it('должен передавать temperature и maxTokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            alternatives: [{ message: { role: 'assistant', text: 'ok' } }],
            usage: { inputTextTokens: '5', completionTokens: '1' },
          },
        }),
      });

      await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.3,
        maxTokens: 500,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.completionOptions.temperature).toBe(0.3);
      expect(body.completionOptions.maxTokens).toBe('500');
    });

    it('должен выбросить ошибку при HTTP ошибке', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        provider.complete({ messages: [{ role: 'user', content: 'test' }] }),
      ).rejects.toThrow('Yandex Cloud ошибка: 401 - Unauthorized');
    });

    it('должен выбросить ошибку если не настроен', async () => {
      const p = await createProvider({});

      await expect(
        p.complete({ messages: [{ role: 'user', content: 'test' }] }),
      ).rejects.toThrow('Yandex Cloud не настроен');
    });

    it('должен обработать пустой ответ', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { alternatives: [], usage: {} },
        }),
      });

      const result = await provider.complete({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.content).toBe('');
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
    });
  });

  describe('completeStream', () => {
    it('должен стримить дельты из полного текста', async () => {
      // Yandex streaming возвращает полный текст, а не дельту
      const streamData = [
        JSON.stringify({ result: { alternatives: [{ message: { text: 'Привет' } }] } }) + '\n',
        JSON.stringify({ result: { alternatives: [{ message: { text: 'Привет, мир' } }] } }) + '\n',
        JSON.stringify({ result: { alternatives: [{ message: { text: 'Привет, мир!' } }] } }) + '\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(async () => {
          if (chunkIndex < streamData.length) {
            const value = new TextEncoder().encode(streamData[chunkIndex]);
            chunkIndex++;
            return { done: false, value };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: jest.fn(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const chunks: string[] = [];
      for await (const chunk of provider.completeStream({
        messages: [{ role: 'user', content: 'test' }],
      })) {
        chunks.push(chunk);
      }

      // Должен вернуть дельты: "Привет", ", мир", "!"
      expect(chunks).toEqual(['Привет', ', мир', '!']);
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('должен выбросить ошибку при HTTP ошибке в стриминге', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Error',
      });

      const gen = provider.completeStream({
        messages: [{ role: 'user', content: 'test' }],
      });

      await expect(gen.next()).rejects.toThrow('Yandex Cloud streaming ошибка: 500 - Internal Error');
    });

    it('должен выбросить ошибку если не настроен', async () => {
      const p = await createProvider({});

      const gen = p.completeStream({
        messages: [{ role: 'user', content: 'test' }],
      });

      await expect(gen.next()).rejects.toThrow('Yandex Cloud не настроен');
    });

    it('должен отправить stream: true в completionOptions', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: jest.fn(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of provider.completeStream({
        messages: [{ role: 'user', content: 'test' }],
      })) {
        // consume
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.completionOptions.stream).toBe(true);
    });
  });

  describe('embed', () => {
    it('должен отправить запрос и вернуть embedding', async () => {
      const mockEmbedding = new Array(256).fill(0.1);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embedding: mockEmbedding,
          numTokens: '8',
          modelVersion: '06.12.2023',
        }),
      });

      const result = await provider.embed('тестовый текст');

      expect(result.embedding).toEqual(mockEmbedding);
      expect(result.embedding).toHaveLength(256);
      expect(result.inputTokens).toBe(8);
      expect(result.model).toBe('text-search-doc/latest');

      // Проверяем параметры запроса
      expect(mockFetch).toHaveBeenCalledWith(
        'https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Api-Key test-api-key',
            'x-folder-id': 'test-folder-id',
          }),
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.modelUri).toBe('emb://test-folder-id/text-search-doc/latest');
      expect(body.text).toBe('тестовый текст');
    });

    it('должен выбросить ошибку при HTTP ошибке', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(provider.embed('test')).rejects.toThrow(
        'Yandex Cloud embeddings ошибка: 500 - Internal Server Error',
      );
    });

    it('должен выбросить ошибку если не настроен', async () => {
      const p = await createProvider({});

      await expect(p.embed('test')).rejects.toThrow('Yandex Cloud не настроен');
    });
  });

  describe('кастомная модель', () => {
    it('должен использовать модель из конфига', async () => {
      const p = await createProvider({
        ...defaultConfig,
        YANDEX_CLOUD_MODEL: 'yandexgpt/latest',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            alternatives: [{ message: { role: 'assistant', text: 'ok' } }],
            usage: { inputTextTokens: '1', completionTokens: '1' },
          },
        }),
      });

      await p.complete({ messages: [{ role: 'user', content: 'test' }] });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.modelUri).toBe('gpt://test-folder-id/yandexgpt/latest');
    });

    it('должен использовать дефолтную модель yandexgpt-lite/latest', async () => {
      const p = await createProvider({
        YANDEX_CLOUD_API_KEY: 'key',
        YANDEX_CLOUD_FOLDER_ID: 'folder',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            alternatives: [{ message: { role: 'assistant', text: 'ok' } }],
            usage: { inputTextTokens: '1', completionTokens: '1' },
          },
        }),
      });

      await p.complete({ messages: [{ role: 'user', content: 'test' }] });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.modelUri).toBe('gpt://folder/yandexgpt-lite/latest');
    });
  });
});
