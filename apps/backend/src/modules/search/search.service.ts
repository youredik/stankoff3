import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { WorkspaceEntity } from '../entity/entity.entity';
import { Comment } from '../entity/comment.entity';
import { AuditLog } from '../audit-log/audit-log.entity';

export interface SearchResult {
  type: 'entity' | 'comment' | 'audit';
  id: string;
  entityId?: string;
  customId?: string;
  title?: string;
  content?: string;
  workspaceId: string;
  createdAt: Date;
  rank: number;
}

export interface SearchOptions {
  workspaceId?: string;
  limit?: number;
  offset?: number;
  types?: ('entity' | 'comment' | 'audit')[];
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Глобальный поиск по заявкам, комментариям и истории
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { workspaceId, limit = 50, offset = 0, types = ['entity', 'comment'] } = options;

    const results: SearchResult[] = [];
    const sanitizedQuery = this.sanitizeQuery(query);

    if (!sanitizedQuery) {
      return [];
    }

    // Поиск по заявкам
    if (types.includes('entity')) {
      const entities = await this.searchEntities(sanitizedQuery, workspaceId, limit);
      results.push(...entities);
    }

    // Поиск по комментариям
    if (types.includes('comment')) {
      const comments = await this.searchComments(sanitizedQuery, workspaceId, limit);
      results.push(...comments);
    }

    // Поиск по истории изменений
    if (types.includes('audit')) {
      const audits = await this.searchAuditLogs(sanitizedQuery, workspaceId, limit);
      results.push(...audits);
    }

    // Сортируем по релевантности и применяем пагинацию
    return results
      .sort((a, b) => b.rank - a.rank)
      .slice(offset, offset + limit);
  }

  /**
   * Поиск только по заявкам
   */
  async searchEntities(
    query: string,
    workspaceId?: string,
    limit = 50,
  ): Promise<SearchResult[]> {
    const sanitizedQuery = this.sanitizeQuery(query);
    if (!sanitizedQuery) return [];

    let sql = `
      SELECT
        id,
        "customId",
        title,
        "workspaceId",
        "createdAt",
        ts_rank("searchVector", plainto_tsquery('russian', $1)) as rank
      FROM entities
      WHERE "searchVector" @@ plainto_tsquery('russian', $1)
        AND "workspaceId" NOT IN (SELECT id FROM workspaces WHERE "isInternal" = true)
    `;

    const params: any[] = [sanitizedQuery];

    if (workspaceId) {
      sql += ` AND "workspaceId" = $2`;
      params.push(workspaceId);
    }

    sql += ` ORDER BY rank DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const rows = await this.dataSource.query(sql, params);

    return rows.map((row: any) => ({
      type: 'entity' as const,
      id: row.id,
      customId: row.customId,
      title: row.title,
      workspaceId: row.workspaceId,
      createdAt: row.createdAt,
      rank: parseFloat(row.rank),
    }));
  }

  /**
   * Поиск только по комментариям
   */
  async searchComments(
    query: string,
    workspaceId?: string,
    limit = 50,
  ): Promise<SearchResult[]> {
    const sanitizedQuery = this.sanitizeQuery(query);
    if (!sanitizedQuery) return [];

    let sql = `
      SELECT
        c.id,
        c."entityId",
        c.content,
        e."customId",
        e."workspaceId",
        c."createdAt",
        ts_rank(c."searchVector", plainto_tsquery('russian', $1)) as rank
      FROM comments c
      JOIN entities e ON e.id = c."entityId"
      WHERE c."searchVector" @@ plainto_tsquery('russian', $1)
        AND e."workspaceId" NOT IN (SELECT id FROM workspaces WHERE "isInternal" = true)
    `;

    const params: any[] = [sanitizedQuery];

    if (workspaceId) {
      sql += ` AND e."workspaceId" = $2`;
      params.push(workspaceId);
    }

    sql += ` ORDER BY rank DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const rows = await this.dataSource.query(sql, params);

    return rows.map((row: any) => ({
      type: 'comment' as const,
      id: row.id,
      entityId: row.entityId,
      customId: row.customId,
      content: row.content?.substring(0, 200),
      workspaceId: row.workspaceId,
      createdAt: row.createdAt,
      rank: parseFloat(row.rank) * 0.8, // Комментарии чуть ниже по релевантности
    }));
  }

  /**
   * Поиск по истории изменений
   */
  async searchAuditLogs(
    query: string,
    workspaceId?: string,
    limit = 50,
  ): Promise<SearchResult[]> {
    const sanitizedQuery = this.sanitizeQuery(query);
    if (!sanitizedQuery) return [];

    // Поиск по description в details
    let sql = `
      SELECT
        a.id,
        a."entityId",
        a."workspaceId",
        a.details->>'description' as content,
        e."customId",
        a."createdAt"
      FROM audit_logs a
      LEFT JOIN entities e ON e.id = a."entityId"
      WHERE a.details->>'description' ILIKE $1
        AND a."workspaceId" NOT IN (SELECT id FROM workspaces WHERE "isInternal" = true)
    `;

    const params: any[] = [`%${sanitizedQuery}%`];

    if (workspaceId) {
      sql += ` AND a."workspaceId" = $2`;
      params.push(workspaceId);
    }

    sql += ` ORDER BY a."createdAt" DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const rows = await this.dataSource.query(sql, params);

    return rows.map((row: any) => ({
      type: 'audit' as const,
      id: row.id,
      entityId: row.entityId,
      customId: row.customId,
      content: row.content?.substring(0, 200),
      workspaceId: row.workspaceId,
      createdAt: row.createdAt,
      rank: 0.5, // История ниже по релевантности
    }));
  }

  /**
   * Очистка поискового запроса от спецсимволов
   */
  private sanitizeQuery(query: string): string {
    if (!query) return '';
    // Удаляем спецсимволы PostgreSQL FTS
    return query
      .replace(/[&|!():*<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
