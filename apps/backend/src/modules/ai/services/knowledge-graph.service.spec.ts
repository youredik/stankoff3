import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import { LegacyUrlService } from '../../legacy/services/legacy-url.service';
import { WorkspaceEntity } from '../../entity/entity.entity';
import { Comment } from '../../entity/comment.entity';

describe('KnowledgeGraphService', () => {
  let service: KnowledgeGraphService;
  let entityRepo: jest.Mocked<Repository<WorkspaceEntity>>;
  let knowledgeBaseService: jest.Mocked<KnowledgeBaseService>;
  let legacyUrlService: jest.Mocked<LegacyUrlService>;

  const mockEntity = {
    id: 'entity-1',
    title: 'Проблема с подшипником серводвигателя',
    customId: 'SRV-42',
    status: 'in-progress',
    workspaceId: 'ws-1',
    assigneeId: 'user-1',
    assignee: { id: 'user-1', firstName: 'Иван', lastName: 'Иванов' },
    workspace: { id: 'ws-1', name: 'Сервис' },
    data: { description: 'Скрежет при запуске', priority: 'high' },
  } as unknown as WorkspaceEntity;

  const mockSearchResults = [
    {
      id: 'chunk-1',
      content: 'Замена подшипника серводвигателя...',
      sourceType: 'legacy_request',
      sourceId: 'req-1',
      metadata: {
        requestId: 45231,
        subject: 'Замена подшипника Fanuc',
        managerName: 'Петров Сергей',
        managerId: 15,
        managerDepartment: 'Сервис',
        counterpartyName: 'ООО МеталлСтрой',
      },
      similarity: 0.92,
    },
    {
      id: 'chunk-2',
      content: 'Диагностика серводвигателя...',
      sourceType: 'legacy_request',
      sourceId: 'req-2',
      metadata: {
        requestId: 38102,
        subject: 'Диагностика серводвигателя',
        managerName: 'Иванов Иван',
        managerId: 12,
      },
      similarity: 0.85,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeGraphService,
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockEntity),
          },
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: {},
        },
        {
          provide: KnowledgeBaseService,
          useValue: {
            isAvailable: jest.fn().mockReturnValue(true),
            searchSimilar: jest.fn().mockResolvedValue(mockSearchResults),
          },
        },
        {
          provide: LegacyUrlService,
          useValue: {
            getRequestUrl: jest.fn().mockImplementation((hash?: string | null, id?: number) =>
              hash ? `https://legacy.example.com/request/view/${hash}` : `https://legacy.example.com/request/list`,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<KnowledgeGraphService>(KnowledgeGraphService);
    entityRepo = module.get(getRepositoryToken(WorkspaceEntity));
    knowledgeBaseService = module.get(KnowledgeBaseService) as jest.Mocked<KnowledgeBaseService>;
    legacyUrlService = module.get(LegacyUrlService) as jest.Mocked<LegacyUrlService>;
  });

  describe('buildGraph', () => {
    it('должен вернуть пустой граф если entity не найден', async () => {
      entityRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.buildGraph('non-existent');

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('должен построить граф с центральным узлом entity', async () => {
      const result = await service.buildGraph('entity-1');

      expect(result.centerNodeId).toBe('entity:entity-1');

      const centerNode = result.nodes.find((n) => n.id === result.centerNodeId);
      expect(centerNode).toBeDefined();
      expect(centerNode!.type).toBe('entity');
      expect(centerNode!.label).toBe('Проблема с подшипником серводвигателя');
    });

    it('должен добавить узел назначенного эксперта', async () => {
      const result = await service.buildGraph('entity-1');

      const expertNode = result.nodes.find((n) => n.id === 'expert:user-1');
      expect(expertNode).toBeDefined();
      expect(expertNode!.type).toBe('expert');
      expect(expertNode!.label).toBe('Иван Иванов');

      const assignEdge = result.edges.find(
        (e) => e.source === 'entity:entity-1' && e.target === 'expert:user-1',
      );
      expect(assignEdge).toBeDefined();
      expect(assignEdge!.type).toBe('assigned_to');
    });

    it('должен добавить узлы похожих legacy заявок', async () => {
      const result = await service.buildGraph('entity-1');

      const legacyNodes = result.nodes.filter((n) => n.type === 'legacy_request');
      expect(legacyNodes.length).toBe(2);

      const leg1 = legacyNodes.find((n) => n.id === 'legacy:45231');
      expect(leg1).toBeDefined();
      expect(leg1!.metadata?.similarity).toBe(0.92);
    });

    it('должен добавить рёбра similarity между entity и legacy', async () => {
      const result = await service.buildGraph('entity-1');

      const simEdges = result.edges.filter((e) => e.type === 'similar_to');
      expect(simEdges.length).toBe(2);
      expect(simEdges[0].source).toBe('entity:entity-1');
      expect(simEdges[0].weight).toBe(0.92);
    });

    it('должен добавить узлы экспертов из legacy результатов', async () => {
      const result = await service.buildGraph('entity-1');

      const expertNodes = result.nodes.filter((n) => n.type === 'expert');
      // user-1 (assignee) + 2 legacy experts
      expect(expertNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('должен добавить узел контрагента', async () => {
      const result = await service.buildGraph('entity-1');

      const cpNodes = result.nodes.filter((n) => n.type === 'counterparty');
      expect(cpNodes.length).toBe(1);
      expect(cpNodes[0].label).toBe('ООО МеталлСтрой');
    });

    it('должен возвращать из кэша при повторном вызове', async () => {
      const result1 = await service.buildGraph('entity-1');
      const result2 = await service.buildGraph('entity-1');

      expect(result1).toEqual(result2);
      // searchSimilar вызван только один раз — второй раз из кэша
      expect(knowledgeBaseService.searchSimilar).toHaveBeenCalledTimes(1);
    });

    it('должен перезапросить данные после invalidateCache', async () => {
      await service.buildGraph('entity-1');
      service.invalidateCache('entity-1');
      await service.buildGraph('entity-1');

      // searchSimilar вызван дважды — кэш был сброшен
      expect(knowledgeBaseService.searchSimilar).toHaveBeenCalledTimes(2);
    });

    it('должен graceful degrade если AI недоступен', async () => {
      knowledgeBaseService.isAvailable.mockReturnValue(false);

      const result = await service.buildGraph('entity-1');

      // Должен вернуть только center node + assigned expert
      expect(result.nodes.length).toBe(2);
    });

    it('должен graceful degrade если поиск упал', async () => {
      knowledgeBaseService.searchSimilar.mockRejectedValue(new Error('Connection error'));

      const result = await service.buildGraph('entity-1');

      // Не должен бросить ошибку, только center + assignee
      expect(result.nodes.length).toBe(2);
    });

    it('не должен добавлять нерелевантные узлы при низком similarity', async () => {
      knowledgeBaseService.searchSimilar.mockResolvedValue([
        {
          id: 'chunk-low-1',
          content: 'Заточной станок S50-CBN...',
          sourceType: 'legacy_request',
          sourceId: 'req-low-1',
          metadata: { requestId: 123647, subject: 'Заточной станок S50-CBN' },
          similarity: 0.62,
        },
        {
          id: 'chunk-low-2',
          content: 'Поставка оборудования...',
          sourceType: 'legacy_request',
          sourceId: 'req-low-2',
          metadata: { requestId: 219182, subject: 'Поставка оборудования' },
          similarity: 0.59,
        },
      ]);

      const result = await service.buildGraph('entity-1');

      // Только center node + assigned expert, без мусорных legacy узлов
      expect(result.nodes.length).toBe(2);
      const legacyNodes = result.nodes.filter((n) => n.type === 'legacy_request');
      expect(legacyNodes.length).toBe(0);
    });

    it('должен использовать minSimilarity = 0.7', async () => {
      await service.buildGraph('entity-1');

      expect(knowledgeBaseService.searchSimilar).toHaveBeenCalledWith(
        expect.objectContaining({
          minSimilarity: 0.7,
        }),
      );
    });
  });
});
