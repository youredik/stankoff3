import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeArticleService } from './services/knowledge-article.service';
import { UserRole } from '../user/user.entity';

describe('KnowledgeBaseController', () => {
  let controller: KnowledgeBaseController;
  let service: jest.Mocked<KnowledgeArticleService>;

  const mockUser = { id: 'user-1', role: UserRole.EMPLOYEE } as any;
  const mockAdmin = { id: 'admin-1', role: UserRole.ADMIN } as any;

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, perPage: 20, totalPages: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: 'a-1', title: 'Test' }),
      createFaq: jest.fn().mockResolvedValue({ id: 'a-1', title: 'FAQ', type: 'faq' }),
      uploadDocument: jest.fn().mockResolvedValue({ id: 'a-1', title: 'Doc', type: 'document' }),
      update: jest.fn().mockResolvedValue({ id: 'a-1', title: 'Updated' }),
      delete: jest.fn().mockResolvedValue(undefined),
      getCategories: jest.fn().mockResolvedValue(['Техподдержка', 'Документация']),
      getStats: jest.fn().mockResolvedValue({ totalDocuments: 5, totalFaq: 3 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
      providers: [{ provide: KnowledgeArticleService, useValue: mockService }],
    }).compile();

    controller = module.get<KnowledgeBaseController>(KnowledgeBaseController);
    service = module.get(KnowledgeArticleService);
  });

  it('должен быть определён', () => {
    expect(controller).toBeDefined();
  });

  describe('getArticles', () => {
    it('должен вызвать findAll с фильтрами и пользователем', async () => {
      const filters = { type: 'faq' as const, page: 1, perPage: 20 };
      await controller.getArticles(filters, mockUser);

      expect(service.findAll).toHaveBeenCalledWith(filters, 'user-1', UserRole.EMPLOYEE);
    });
  });

  describe('getArticle', () => {
    it('должен вызвать findOne с id и пользователем', async () => {
      await controller.getArticle('a-1', mockUser);
      expect(service.findOne).toHaveBeenCalledWith('a-1', 'user-1', UserRole.EMPLOYEE);
    });
  });

  describe('createFaq', () => {
    it('должен создать FAQ с id пользователя', async () => {
      const dto = { title: 'Вопрос', content: 'Ответ' };
      const result = await controller.createFaq(dto as any, mockUser);

      expect(service.createFaq).toHaveBeenCalledWith(dto, 'user-1');
      expect(result.type).toBe('faq');
    });
  });

  describe('uploadDocument', () => {
    it('должен загрузить документ', async () => {
      const file = { originalname: 'test.pdf', buffer: Buffer.from(''), size: 100 } as any;
      await controller.uploadDocument(file, 'Документ', '', '', '', mockUser);

      expect(service.uploadDocument).toHaveBeenCalledWith(
        file,
        { title: 'Документ', workspaceId: undefined, category: undefined, tags: [] },
        'user-1',
      );
    });

    it('должен распарсить JSON теги', async () => {
      const file = { originalname: 'test.pdf' } as any;
      await controller.uploadDocument(file, 'Doc', '', 'Категория', '["тег1","тег2"]', mockUser);

      expect(service.uploadDocument).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ tags: ['тег1', 'тег2'], category: 'Категория' }),
        'user-1',
      );
    });
  });

  describe('updateArticle', () => {
    it('должен обновить статью', async () => {
      const dto = { title: 'Новый заголовок' };
      await controller.updateArticle('a-1', dto as any, mockUser);

      expect(service.update).toHaveBeenCalledWith('a-1', dto, 'user-1', UserRole.EMPLOYEE);
    });
  });

  describe('deleteArticle', () => {
    it('должен удалить статью и вернуть success', async () => {
      const result = await controller.deleteArticle('a-1', mockAdmin);

      expect(service.delete).toHaveBeenCalledWith('a-1', 'admin-1', UserRole.ADMIN);
      expect(result).toEqual({ success: true });
    });
  });

  describe('getCategories', () => {
    it('должен вернуть категории', async () => {
      const result = await controller.getCategories();
      expect(service.getCategories).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(['Техподдержка', 'Документация']);
    });

    it('должен передать workspaceId', async () => {
      await controller.getCategories('ws-1');
      expect(service.getCategories).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('getStats', () => {
    it('должен вернуть статистику', async () => {
      const result = await controller.getStats();
      expect(service.getStats).toHaveBeenCalledWith(undefined);
      expect(result).toHaveProperty('totalDocuments');
    });
  });
});
