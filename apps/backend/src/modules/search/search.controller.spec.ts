import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: jest.Mocked<SearchService>;

  const mockResults = [
    { id: 'entity-1', type: 'entity', title: 'Test', rank: 0.9 },
    { id: 'comment-1', type: 'comment', content: 'Test comment', rank: 0.7 },
  ];

  beforeEach(async () => {
    const mockSearchService = {
      search: jest.fn(),
      searchEntities: jest.fn(),
      searchComments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockSearchService }],
    }).compile();

    controller = module.get<SearchController>(SearchController);
    searchService = module.get(SearchService);
  });

  describe('search', () => {
    it('должен вернуть результаты поиска', async () => {
      searchService.search.mockResolvedValue(mockResults as any);

      const result = await controller.search('test');

      expect(result).toEqual(mockResults);
      expect(searchService.search).toHaveBeenCalledWith('test', {
        workspaceId: undefined,
        limit: 50,
        offset: 0,
        types: ['entity', 'comment'],
      });
    });

    it('должен применить параметры фильтрации', async () => {
      searchService.search.mockResolvedValue([]);

      await controller.search('test', 'ws-1', 'entity,audit', '10', '5');

      expect(searchService.search).toHaveBeenCalledWith('test', {
        workspaceId: 'ws-1',
        limit: 10,
        offset: 5,
        types: ['entity', 'audit'],
      });
    });
  });

  describe('searchEntities', () => {
    it('должен искать только по заявкам', async () => {
      searchService.searchEntities.mockResolvedValue([mockResults[0]] as any);

      const result = await controller.searchEntities('test', 'ws-1', '25');

      expect(result).toHaveLength(1);
      expect(searchService.searchEntities).toHaveBeenCalledWith('test', 'ws-1', 25);
    });

    it('должен использовать значения по умолчанию', async () => {
      searchService.searchEntities.mockResolvedValue([]);

      await controller.searchEntities('test');

      expect(searchService.searchEntities).toHaveBeenCalledWith('test', undefined, 50);
    });
  });

  describe('searchComments', () => {
    it('должен искать только по комментариям', async () => {
      searchService.searchComments.mockResolvedValue([mockResults[1]] as any);

      const result = await controller.searchComments('test', 'ws-1', '30');

      expect(result).toHaveLength(1);
      expect(searchService.searchComments).toHaveBeenCalledWith('test', 'ws-1', 30);
    });
  });
});
