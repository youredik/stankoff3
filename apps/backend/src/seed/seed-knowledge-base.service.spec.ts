import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeArticle } from '../modules/knowledge-base/entities/knowledge-article.entity';
import { Workspace } from '../modules/workspace/workspace.entity';
import { User } from '../modules/user/user.entity';
import { SeedKnowledgeBaseService } from './seed-knowledge-base.service';
import { KNOWLEDGE_BASE_ARTICLES } from './data/knowledge-base-articles';
import { SeedWorkspaces } from './seed-structure.service';
import * as fs from 'fs';

describe('SeedKnowledgeBaseService', () => {
  let service: SeedKnowledgeBaseService;
  let articleRepo: jest.Mocked<Repository<KnowledgeArticle>>;

  const mockWorkspaces: SeedWorkspaces = {
    zk: { id: 'ws-zk', prefix: 'ZK' } as Workspace,
    kp: { id: 'ws-kp', prefix: 'KP' } as Workspace,
    sz: { id: 'ws-sz', prefix: 'SZ' } as Workspace,
    rek: { id: 'ws-rek', prefix: 'REK' } as Workspace,
    mk: { id: 'ws-mk', prefix: 'MK' } as Workspace,
    kn: { id: 'ws-kn', prefix: 'KN' } as Workspace,
    sk: { id: 'ws-sk', prefix: 'SK' } as Workspace,
    dv: { id: 'ws-dv', prefix: 'DV' } as Workspace,
    fd: { id: 'ws-fd', prefix: 'FD' } as Workspace,
    sr: { id: 'ws-sr', prefix: 'SR' } as Workspace,
    dg: { id: 'ws-dg', prefix: 'DG' } as Workspace,
    ved: { id: 'ws-ved', prefix: 'VED' } as Workspace,
    hr: { id: 'ws-hr', prefix: 'HR' } as Workspace,
    tn: { id: 'ws-tn', prefix: 'TN' } as Workspace,
  };

  const mockItWs = { id: 'ws-it', prefix: 'DEV' } as Workspace;

  const mockUsers = [
    { id: 'u1', email: 'youredik@gmail.com' },
    { id: 'u2', email: 'grachev@stankoff.ru' },
    { id: 'u3', email: 'andrey@stankoff.ru' },
    { id: 'u4', email: 'anna.sidorova@stankoff.ru' },
  ] as User[];

  beforeEach(async () => {
    // Мокаем readFileSync чтобы seedBusinessProcessesDoc не пытался читать файл
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('File not found');
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedKnowledgeBaseService,
        {
          provide: getRepositoryToken(KnowledgeArticle),
          useValue: {
            save: jest.fn().mockImplementation((articles) => Promise.resolve(articles)),
          },
        },
      ],
    }).compile();

    service = module.get(SeedKnowledgeBaseService);
    articleRepo = module.get(getRepositoryToken(KnowledgeArticle));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createAll', () => {
    it('должен создать правильное количество статей', async () => {
      await service.createAll(mockWorkspaces, mockItWs, mockUsers);

      expect(articleRepo.save).toHaveBeenCalledTimes(1);
      const savedArticles = articleRepo.save.mock.calls[0][0] as Array<Partial<KnowledgeArticle>>;
      expect(savedArticles).toHaveLength(KNOWLEDGE_BASE_ARTICLES.length);
    });

    it('должен установить type=faq и status=published для всех статей', async () => {
      await service.createAll(mockWorkspaces, mockItWs, mockUsers);

      const savedArticles = articleRepo.save.mock.calls[0][0] as Array<Partial<KnowledgeArticle>>;
      for (const article of savedArticles) {
        expect(article.type).toBe('faq');
        expect(article.status).toBe('published');
      }
    });

    it('должен корректно маппить workspaceKey в workspaceId', async () => {
      await service.createAll(mockWorkspaces, mockItWs, mockUsers);

      const savedArticles = articleRepo.save.mock.calls[0][0] as Array<Partial<KnowledgeArticle>>;

      // Глобальные статьи (workspaceKey=null) -> workspaceId=null
      const globalArticles = savedArticles.filter((a) => a.workspaceId === null);
      expect(globalArticles.length).toBeGreaterThan(0);

      // ZK статьи
      const zkArticles = savedArticles.filter((a) => a.workspaceId === 'ws-zk');
      expect(zkArticles.length).toBeGreaterThan(0);

      // IT статьи
      const itArticles = savedArticles.filter((a) => a.workspaceId === 'ws-it');
      expect(itArticles.length).toBeGreaterThan(0);
    });

    it('должен корректно маппить authorEmail в authorId', async () => {
      await service.createAll(mockWorkspaces, mockItWs, mockUsers);

      const savedArticles = articleRepo.save.mock.calls[0][0] as Array<Partial<KnowledgeArticle>>;

      // Статьи с известным автором
      const articlesWithAuthor = savedArticles.filter((a) => a.authorId !== null);
      expect(articlesWithAuthor.length).toBeGreaterThan(0);

      // Проверяем конкретный маппинг
      const youredikArticles = savedArticles.filter((a) => a.authorId === 'u1');
      expect(youredikArticles.length).toBeGreaterThan(0);
    });

    it('должен установить authorId=null для неизвестных email', async () => {
      // Передаём пустой массив пользователей
      await service.createAll(mockWorkspaces, mockItWs, []);

      const savedArticles = articleRepo.save.mock.calls[0][0] as Array<Partial<KnowledgeArticle>>;
      for (const article of savedArticles) {
        expect(article.authorId).toBeNull();
      }
    });

    it('должен заполнить title, content, category и tags для каждой статьи', async () => {
      await service.createAll(mockWorkspaces, mockItWs, mockUsers);

      const savedArticles = articleRepo.save.mock.calls[0][0] as Array<Partial<KnowledgeArticle>>;
      for (const article of savedArticles) {
        expect(article.title).toBeTruthy();
        expect(article.content).toBeTruthy();
        expect(article.category).toBeTruthy();
        expect(article.tags).toBeDefined();
        expect(Array.isArray(article.tags)).toBe(true);
        expect(article.tags!.length).toBeGreaterThan(0);
      }
    });
  });
});
