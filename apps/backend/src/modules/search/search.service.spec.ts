import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SearchService } from './search.service';
import { WorkspaceEntity } from '../entity/entity.entity';
import { Comment } from '../entity/comment.entity';
import { AuditLog } from '../audit-log/audit-log.entity';

describe('SearchService', () => {
  let service: SearchService;
  let dataSource: { query: jest.Mock };

  const mockEntityResult = {
    id: 'entity-1',
    customId: 'TST-1',
    title: 'Test Entity',
    workspaceId: 'ws-1',
    createdAt: new Date(),
    rank: 0.5,
  };

  const mockCommentResult = {
    id: 'comment-1',
    entityId: 'entity-1',
    content: 'Test comment',
    customId: 'TST-1',
    workspaceId: 'ws-1',
    createdAt: new Date(),
    rank: 0.4,
  };

  const mockAuditResult = {
    id: 'audit-1',
    entityId: 'entity-1',
    workspaceId: 'ws-1',
    content: 'Created entity',
    customId: 'TST-1',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockEntityRepo = {};
    const mockCommentRepo = {};
    const mockAuditRepo = {};
    const mockDataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(WorkspaceEntity), useValue: mockEntityRepo },
        { provide: getRepositoryToken(Comment), useValue: mockCommentRepo },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    dataSource = module.get(DataSource);
  });

  describe('search', () => {
    it('должен искать по entities и comments по умолчанию', async () => {
      dataSource.query
        .mockResolvedValueOnce([mockEntityResult])
        .mockResolvedValueOnce([mockCommentResult]);

      const result = await service.search('test');

      expect(result).toHaveLength(2);
      expect(dataSource.query).toHaveBeenCalledTimes(2);
    });

    it('должен вернуть пустой массив для пустого запроса', async () => {
      const result = await service.search('');

      expect(result).toEqual([]);
    });

    it('должен вернуть пустой массив для запроса только из спецсимволов', async () => {
      const result = await service.search('&|!():*');

      expect(result).toEqual([]);
    });

    it('должен искать по audit logs если указано в types', async () => {
      dataSource.query.mockResolvedValue([mockAuditResult]);

      const result = await service.search('test', { types: ['audit'] });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('audit');
    });

    it('должен фильтровать по workspaceId', async () => {
      dataSource.query
        .mockResolvedValueOnce([mockEntityResult])
        .mockResolvedValueOnce([mockCommentResult]);

      await service.search('test', { workspaceId: 'ws-1' });

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('"workspaceId" = $2'),
        expect.arrayContaining(['ws-1']),
      );
    });

    it('должен применять пагинацию', async () => {
      const manyResults = Array(10).fill(mockEntityResult);
      dataSource.query
        .mockResolvedValueOnce(manyResults)
        .mockResolvedValueOnce([]);

      const result = await service.search('test', { limit: 5, offset: 2 });

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('должен сортировать по rank', async () => {
      dataSource.query
        .mockResolvedValueOnce([{ ...mockEntityResult, rank: 0.9 }])
        .mockResolvedValueOnce([{ ...mockCommentResult, rank: 0.3 }]);

      const result = await service.search('test');

      expect(result[0].rank).toBeGreaterThan(result[1].rank);
    });
  });

  describe('searchEntities', () => {
    it('должен искать по entities', async () => {
      dataSource.query.mockResolvedValue([mockEntityResult]);

      const result = await service.searchEntities('test');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('entity');
    });

    it('должен исключать internal workspaces из результатов', async () => {
      dataSource.query.mockResolvedValue([mockEntityResult]);

      await service.searchEntities('test');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('"isInternal" = true'),
        expect.any(Array),
      );
    });

    it('должен вернуть пустой массив для пустого запроса', async () => {
      const result = await service.searchEntities('');

      expect(result).toEqual([]);
    });

    it('должен фильтровать по workspaceId', async () => {
      dataSource.query.mockResolvedValue([mockEntityResult]);

      await service.searchEntities('test', 'ws-1');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('"workspaceId" = $2'),
        expect.arrayContaining(['ws-1']),
      );
    });

    it('должен применять limit', async () => {
      dataSource.query.mockResolvedValue([mockEntityResult]);

      await service.searchEntities('test', undefined, 25);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([25]),
      );
    });
  });

  describe('searchComments', () => {
    it('должен искать по комментариям', async () => {
      dataSource.query.mockResolvedValue([mockCommentResult]);

      const result = await service.searchComments('test');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('comment');
    });

    it('должен исключать internal workspaces из результатов', async () => {
      dataSource.query.mockResolvedValue([mockCommentResult]);

      await service.searchComments('test');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('"isInternal" = true'),
        expect.any(Array),
      );
    });

    it('должен вернуть пустой массив для пустого запроса', async () => {
      const result = await service.searchComments('');

      expect(result).toEqual([]);
    });

    it('должен применять коэффициент релевантности 0.8', async () => {
      dataSource.query.mockResolvedValue([{ ...mockCommentResult, rank: 1.0 }]);

      const result = await service.searchComments('test');

      expect(result[0].rank).toBe(0.8);
    });

    it('должен обрезать content до 200 символов', async () => {
      const longContent = 'a'.repeat(300);
      dataSource.query.mockResolvedValue([{ ...mockCommentResult, content: longContent }]);

      const result = await service.searchComments('test');

      expect(result[0].content?.length).toBe(200);
    });

    it('должен фильтровать по workspaceId', async () => {
      dataSource.query.mockResolvedValue([mockCommentResult]);

      await service.searchComments('test', 'ws-1');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('"workspaceId" = $2'),
        expect.arrayContaining(['ws-1']),
      );
    });
  });

  describe('searchAuditLogs', () => {
    it('должен искать по audit logs', async () => {
      dataSource.query.mockResolvedValue([mockAuditResult]);

      const result = await service.searchAuditLogs('test');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('audit');
    });

    it('должен исключать internal workspaces из результатов', async () => {
      dataSource.query.mockResolvedValue([mockAuditResult]);

      await service.searchAuditLogs('test');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('"isInternal" = true'),
        expect.any(Array),
      );
    });

    it('должен вернуть пустой массив для пустого запроса', async () => {
      const result = await service.searchAuditLogs('');

      expect(result).toEqual([]);
    });

    it('должен использовать фиксированный rank 0.5', async () => {
      dataSource.query.mockResolvedValue([mockAuditResult]);

      const result = await service.searchAuditLogs('test');

      expect(result[0].rank).toBe(0.5);
    });

    it('должен обрезать content до 200 символов', async () => {
      const longContent = 'a'.repeat(300);
      dataSource.query.mockResolvedValue([{ ...mockAuditResult, content: longContent }]);

      const result = await service.searchAuditLogs('test');

      expect(result[0].content?.length).toBe(200);
    });

    it('должен фильтровать по workspaceId', async () => {
      dataSource.query.mockResolvedValue([mockAuditResult]);

      await service.searchAuditLogs('test', 'ws-1');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('"workspaceId" = $2'),
        expect.arrayContaining(['ws-1']),
      );
    });
  });

  describe('sanitizeQuery', () => {
    it('должен удалять спецсимволы PostgreSQL FTS', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.searchEntities('test & query | (with:special*)');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['test query with special']),
      );
    });

    it('должен схлопывать множественные пробелы', async () => {
      dataSource.query.mockResolvedValue([]);

      await service.searchEntities('test    query');

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['test query']),
      );
    });
  });
});
