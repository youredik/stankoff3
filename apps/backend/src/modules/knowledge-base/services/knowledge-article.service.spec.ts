import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { KnowledgeArticleService } from './knowledge-article.service';
import { KnowledgeArticle } from '../entities/knowledge-article.entity';
import { S3Service } from '../../s3/s3.service';
import { DocumentParserService } from './document-parser.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { UserRole } from '../../user/user.entity';

describe('KnowledgeArticleService', () => {
  let service: KnowledgeArticleService;
  let articleRepo: any;
  let s3Service: jest.Mocked<Partial<S3Service>>;
  let parserService: jest.Mocked<Partial<DocumentParserService>>;
  let knowledgeBase: jest.Mocked<Partial<KnowledgeBaseService>>;

  const createMockQueryBuilder = () => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getMany: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    clone: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const mockQb = createMockQueryBuilder();

    articleRepo = {
      create: jest.fn((data) => ({ id: 'article-1', ...data })),
      save: jest.fn((entity) => Promise.resolve({ ...entity, id: entity.id || 'article-1' })),
      findOne: jest.fn(),
      remove: jest.fn((entity) => Promise.resolve(entity)),
      createQueryBuilder: jest.fn(() => mockQb),
    };

    s3Service = {
      uploadFileWithThumbnail: jest.fn().mockResolvedValue({ key: 's3-key-123' }),
    };

    parserService = {
      parseDocument: jest.fn().mockResolvedValue('Распарсенный текст документа'),
    };

    knowledgeBase = {
      isAvailable: jest.fn().mockReturnValue(false),
      addChunk: jest.fn().mockResolvedValue({}),
      removeChunksBySource: jest.fn().mockResolvedValue(5),
      getStats: jest.fn().mockResolvedValue({
        totalChunks: 10,
        bySourceType: { document: 5, faq: 3 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeArticleService,
        { provide: getRepositoryToken(KnowledgeArticle), useValue: articleRepo },
        { provide: S3Service, useValue: s3Service },
        { provide: DocumentParserService, useValue: parserService },
        { provide: KnowledgeBaseService, useValue: knowledgeBase },
      ],
    }).compile();

    service = module.get<KnowledgeArticleService>(KnowledgeArticleService);
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  describe('createFaq', () => {
    it('должен создать FAQ статью', async () => {
      const dto = { title: 'Как сбросить пароль?', content: 'Нажмите ссылку...' };
      const result = await service.createFaq(dto, 'user-1');

      expect(articleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: dto.title, content: dto.content, type: 'faq', authorId: 'user-1' }),
      );
      expect(articleRepo.save).toHaveBeenCalled();
      expect(result.title).toBe(dto.title);
    });

    it('должен создать FAQ с категорией и тегами', async () => {
      const dto = {
        title: 'Вопрос',
        content: 'Ответ',
        category: 'Техподдержка',
        tags: ['пароль', 'вход'],
      };
      const result = await service.createFaq(dto, 'user-1');

      expect(articleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Техподдержка', tags: ['пароль', 'вход'] }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('uploadDocument', () => {
    const mockFile = {
      originalname: 'manual.pdf',
      size: 1024,
      mimetype: 'application/pdf',
      buffer: Buffer.from('pdf content'),
    } as Express.Multer.File;

    it('должен загрузить документ в S3 и создать статью', async () => {
      const result = await service.uploadDocument(
        mockFile,
        { title: 'Инструкция' },
        'user-1',
      );

      expect(s3Service.uploadFileWithThumbnail).toHaveBeenCalledWith(mockFile, 'knowledge-base');
      expect(result.type).toBe('document');
      expect(result.fileKey).toBe('s3-key-123');
      expect(result.fileSize).toBe(1024);
    });

    it('должен выбросить ошибку если файл не загружен', async () => {
      await expect(
        service.uploadDocument(null as any, { title: 'test' }, 'user-1'),
      ).rejects.toThrow('Файл не загружен');
    });
  });

  describe('findOne', () => {
    it('должен вернуть статью по ID', async () => {
      const article = { id: 'a-1', title: 'Test', status: 'published', authorId: 'user-1' };
      articleRepo.findOne.mockResolvedValue(article);

      const result = await service.findOne('a-1', 'user-1', UserRole.EMPLOYEE);
      expect(result).toEqual(article);
    });

    it('должен выбросить NotFoundException', async () => {
      articleRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('not-found', 'user-1', UserRole.EMPLOYEE),
      ).rejects.toThrow(NotFoundException);
    });

    it('должен запретить доступ к чужому черновику', async () => {
      const article = { id: 'a-1', status: 'draft', authorId: 'user-other' };
      articleRepo.findOne.mockResolvedValue(article);

      await expect(
        service.findOne('a-1', 'user-1', UserRole.EMPLOYEE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен разрешить админу доступ к любому черновику', async () => {
      const article = { id: 'a-1', status: 'draft', authorId: 'user-other' };
      articleRepo.findOne.mockResolvedValue(article);

      const result = await service.findOne('a-1', 'admin-1', UserRole.ADMIN);
      expect(result).toEqual(article);
    });
  });

  describe('update', () => {
    it('должен обновить статью автором', async () => {
      const article = {
        id: 'a-1', title: 'Old', type: 'faq', status: 'published', authorId: 'user-1',
      };
      articleRepo.findOne.mockResolvedValue(article);

      const result = await service.update('a-1', { title: 'New' }, 'user-1', UserRole.EMPLOYEE);
      expect(articleRepo.save).toHaveBeenCalled();
      expect(result.title).toBe('New');
    });

    it('должен запретить редактирование чужой статьи', async () => {
      const article = { id: 'a-1', status: 'published', authorId: 'user-other' };
      articleRepo.findOne.mockResolvedValue(article);

      await expect(
        service.update('a-1', { title: 'hack' }, 'user-1', UserRole.EMPLOYEE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('должен разрешить админу редактировать любую статью', async () => {
      const article = { id: 'a-1', title: 'Old', type: 'faq', status: 'published', authorId: 'user-other' };
      articleRepo.findOne.mockResolvedValue(article);

      const result = await service.update('a-1', { title: 'Updated' }, 'admin-1', UserRole.ADMIN);
      expect(result.title).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('должен удалить статью автором', async () => {
      const article = { id: 'a-1', type: 'faq', status: 'published', authorId: 'user-1' };
      articleRepo.findOne.mockResolvedValue(article);

      await service.delete('a-1', 'user-1', UserRole.EMPLOYEE);

      expect(knowledgeBase.removeChunksBySource).toHaveBeenCalledWith('faq', 'a-1');
      expect(articleRepo.remove).toHaveBeenCalledWith(article);
    });

    it('должен удалить статью админом', async () => {
      const article = { id: 'a-1', type: 'document', status: 'published', authorId: 'user-other' };
      articleRepo.findOne.mockResolvedValue(article);

      await service.delete('a-1', 'admin-1', UserRole.ADMIN);
      expect(articleRepo.remove).toHaveBeenCalled();
    });

    it('должен запретить удаление чужой статьи', async () => {
      const article = { id: 'a-1', status: 'published', authorId: 'user-other' };
      articleRepo.findOne.mockResolvedValue(article);

      await expect(
        service.delete('a-1', 'user-1', UserRole.EMPLOYEE),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('должен вызвать createQueryBuilder с фильтрами', async () => {
      const result = await service.findAll(
        { type: 'faq', page: 1, perPage: 10 },
        'user-1',
        UserRole.EMPLOYEE,
      );

      expect(articleRepo.createQueryBuilder).toHaveBeenCalledWith('article');
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('totalPages');
    });
  });

  describe('getCategories', () => {
    it('должен вернуть отсортированный список категорий', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getRawMany.mockResolvedValue([
        { category: 'Техподдержка' },
        { category: 'Документация' },
        { category: null },
      ]);
      articleRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getCategories();
      expect(result).toEqual(['Документация', 'Техподдержка']);
    });
  });

  describe('getStats', () => {
    it('должен вернуть статистику', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getCount.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
      articleRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getStats();

      expect(result).toEqual({
        totalDocuments: 5,
        totalFaq: 3,
        totalArticles: 8,
        documentChunks: 5,
        faqChunks: 3,
        totalChunks: 8,
      });
    });
  });
});
