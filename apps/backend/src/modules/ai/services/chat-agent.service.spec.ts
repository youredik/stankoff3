import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatAgentService } from './chat-agent.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { KnowledgeBaseService } from './knowledge-base.service';
import { AiUsageLog } from '../entities/ai-usage-log.entity';
import { User } from '../../user/user.entity';

describe('ChatAgentService', () => {
  let service: ChatAgentService;
  let providerRegistry: jest.Mocked<Partial<AiProviderRegistry>>;
  let knowledgeBase: jest.Mocked<Partial<KnowledgeBaseService>>;
  let userRepo: jest.Mocked<Partial<Repository<User>>>;
  let usageLogRepo: jest.Mocked<Partial<Repository<AiUsageLog>>>;

  beforeEach(async () => {
    providerRegistry = {
      isCompletionAvailable: jest.fn().mockReturnValue(true),
      complete: jest.fn().mockResolvedValue({
        content: 'Ответ AI-бота',
        inputTokens: 100,
        outputTokens: 50,
        model: 'yandexgpt/latest',
        provider: 'yandex',
      }),
    };

    knowledgeBase = {
      isAvailable: jest.fn().mockReturnValue(true),
      searchSimilar: jest.fn().mockResolvedValue([
        {
          id: 'chunk-1',
          content: 'Решение: замена подшипника',
          similarity: 0.85,
          metadata: { requestId: 12345, subject: 'Вибрация станка' },
          sourceType: 'legacy_request',
          sourceId: '12345',
        },
      ]),
    };

    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'bot-user-id',
        email: 'ai-assistant@stankoff.ru',
        firstName: 'AI',
        lastName: 'Ассистент',
      }),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation(async (data) => ({ ...data, id: 'bot-user-id' })),
    };

    usageLogRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatAgentService,
        { provide: AiProviderRegistry, useValue: providerRegistry },
        { provide: KnowledgeBaseService, useValue: knowledgeBase },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(AiUsageLog), useValue: usageLogRepo },
      ],
    }).compile();

    service = module.get<ChatAgentService>(ChatAgentService);
  });

  describe('getBotUserId', () => {
    it('должен вернуть существующего бота', async () => {
      const id = await service.getBotUserId();
      expect(id).toBe('bot-user-id');
      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'ai-assistant@stankoff.ru' },
      });
    });

    it('должен создать бота если не существует', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);

      const id = await service.getBotUserId();
      expect(id).toBe('bot-user-id');
      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'ai-assistant@stankoff.ru',
          firstName: 'AI',
          lastName: 'Ассистент',
          isActive: false,
        }),
      );
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('должен кэшировать id бота', async () => {
      await service.getBotUserId();
      await service.getBotUserId();
      expect(userRepo.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('isBotUser', () => {
    it('должен вернуть true для бота', async () => {
      expect(await service.isBotUser('bot-user-id')).toBe(true);
    });

    it('должен вернуть false для обычного пользователя', async () => {
      expect(await service.isBotUser('other-user')).toBe(false);
    });
  });

  describe('processMessage', () => {
    it('должен обработать сообщение и вернуть ответ', async () => {
      const result = await service.processMessage(
        'conv-1',
        'Как починить станок?',
        'user-1',
      );

      expect(result).toBe('Ответ AI-бота');
      expect(providerRegistry.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
          temperature: 0.7,
          maxTokens: 1500,
        }),
      );
    });

    it('должен искать в базе знаний для контекста', async () => {
      await service.processMessage('conv-1', 'вибрация ЧПУ станка', 'user-1');

      expect(knowledgeBase.searchSimilar).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'вибрация ЧПУ станка',
          sourceType: 'legacy_request',
          limit: 5,
        }),
      );
    });

    it('должен включать предыдущие сообщения в контекст', async () => {
      const prevMessages = [
        { role: 'user' as const, content: 'Привет' },
        { role: 'assistant' as const, content: 'Здравствуйте!' },
      ];

      await service.processMessage('conv-1', 'Помоги с заявкой', 'user-1', prevMessages);

      const callArgs = (providerRegistry.complete as jest.Mock).mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(4); // system + 2 prev + user
    });

    it('должен вернуть сообщение об ошибке при недоступности AI', async () => {
      (providerRegistry.isCompletionAvailable as jest.Mock).mockReturnValue(false);

      const result = await service.processMessage('conv-1', 'Вопрос', 'user-1');
      expect(result).toContain('недоступен');
    });

    it('должен вернуть сообщение об ошибке при исключении', async () => {
      (providerRegistry.complete as jest.Mock).mockRejectedValue(new Error('API error'));

      const result = await service.processMessage('conv-1', 'Вопрос', 'user-1');
      expect(result).toContain('ошибка');
    });

    it('не должен падать если RAG поиск неудачен', async () => {
      (knowledgeBase.searchSimilar as jest.Mock).mockRejectedValue(new Error('RAG error'));

      const result = await service.processMessage('conv-1', 'длинный вопрос для поиска', 'user-1');
      expect(result).toBe('Ответ AI-бота');
    });

    it('должен логировать использование', async () => {
      await service.processMessage('conv-1', 'Вопрос', 'user-1');

      expect(usageLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'chat',
          success: true,
        }),
      );
    });
  });
});
