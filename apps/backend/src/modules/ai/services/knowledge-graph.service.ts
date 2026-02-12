import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceEntity } from '../../entity/entity.entity';
import { Comment } from '../../entity/comment.entity';
import { KnowledgeBaseService } from './knowledge-base.service';
import { LegacyUrlService } from '../../legacy/services/legacy-url.service';

export interface GraphNode {
  id: string;
  type: 'entity' | 'legacy_request' | 'expert' | 'counterparty' | 'topic';
  label: string;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'similar_to' | 'assigned_to' | 'related_to' | 'belongs_to';
  weight: number;
  label?: string;
}

export interface KnowledgeGraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerNodeId: string;
}

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  // In-memory кэш для результатов buildGraph (TTL 5 мин)
  private readonly cache = new Map<
    string,
    { data: KnowledgeGraphResponse; expiresAt: number }
  >();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly CACHE_MAX_SIZE = 200;
  private readonly MIN_SIMILARITY = 0.7;
  private readonly CONFIDENCE_THRESHOLD = 0.65;

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly entityRepository: Repository<WorkspaceEntity>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly legacyUrlService: LegacyUrlService,
  ) {}

  /**
   * Build a knowledge graph centered on an entity
   */
  async buildGraph(entityId: string): Promise<KnowledgeGraphResponse> {
    // Проверяем кэш
    const cached = this.cache.get(entityId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const entity = await this.entityRepository.findOne({
      where: { id: entityId },
      relations: ['assignee', 'workspace'],
    });

    if (!entity) {
      return { nodes: [], edges: [], centerNodeId: entityId };
    }

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();

    // Center node — current entity
    const centerNodeId = `entity:${entityId}`;
    nodes.push({
      id: centerNodeId,
      type: 'entity',
      label: entity.title || `Заявка ${entity.customId || entity.id.slice(0, 8)}`,
      metadata: {
        customId: entity.customId,
        status: entity.status,
        priority: (entity.data as Record<string, unknown>)?.priority,
        workspaceName: entity.workspace?.name,
      },
    });
    nodeIds.add(centerNodeId);

    // Assigned expert
    if (entity.assignee) {
      const expertNodeId = `expert:${entity.assigneeId}`;
      if (!nodeIds.has(expertNodeId)) {
        nodes.push({
          id: expertNodeId,
          type: 'expert',
          label: `${entity.assignee.firstName} ${entity.assignee.lastName}`,
          metadata: { userId: entity.assigneeId },
        });
        nodeIds.add(expertNodeId);
      }
      edges.push({
        source: centerNodeId,
        target: expertNodeId,
        type: 'assigned_to',
        weight: 1,
        label: 'Исполнитель',
      });
    }

    // Similar cases from RAG
    await this.addSimilarCases(entity, nodes, edges, nodeIds, centerNodeId);

    const result = { nodes, edges, centerNodeId };

    // Сохраняем в кэш
    this.cache.set(entityId, {
      data: result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
    if (this.cache.size > this.CACHE_MAX_SIZE) {
      this.cleanupCache();
    }

    return result;
  }

  /**
   * Сброс кэша для entity (при обновлении)
   */
  invalidateCache(entityId: string): void {
    this.cache.delete(entityId);
  }

  /**
   * Удаление истёкших записей кэша
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  private async addSimilarCases(
    entity: WorkspaceEntity,
    nodes: GraphNode[],
    edges: GraphEdge[],
    nodeIds: Set<string>,
    centerNodeId: string,
  ): Promise<void> {
    if (!this.knowledgeBaseService.isAvailable()) return;

    const query = [entity.title, (entity.data as Record<string, unknown>)?.description]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!query || query.length < 10) return;

    try {
      const results = await this.knowledgeBaseService.searchSimilar({
        query,
        sourceType: 'legacy_request',
        limit: 6,
        minSimilarity: this.MIN_SIMILARITY,
      });

      // Confidence gating: если результаты нерелевантны — не добавляем мусорные узлы
      if (results.length === 0) return;
      const avgSimilarity = results.reduce((sum, r) => sum + r.similarity, 0) / results.length;
      const maxSimilarity = Math.max(...results.map(r => r.similarity));
      if (avgSimilarity < this.CONFIDENCE_THRESHOLD || maxSimilarity < this.MIN_SIMILARITY) return;

      const expertMap = new Map<string, { cases: number; nodeId: string }>();
      const counterpartyMap = new Map<string, string>();
      const topicMap = new Map<string, string>();

      for (const result of results) {
        if (result.sourceType !== 'legacy_request') continue;

        const metadata = result.metadata || {};
        const requestId = metadata.requestId as number;
        if (!requestId) continue;

        // Legacy request node
        const legacyNodeId = `legacy:${requestId}`;
        if (!nodeIds.has(legacyNodeId)) {
          nodes.push({
            id: legacyNodeId,
            type: 'legacy_request',
            label: (metadata.subject as string) || `Заявка #${requestId}`,
            metadata: {
              requestId,
              similarity: Math.round(result.similarity * 100) / 100,
              legacyUrl: this.legacyUrlService.getRequestUrl(
                metadata.requestHash as string | undefined,
                requestId,
              ),
              resolutionTimeHours: metadata.resolutionTimeHours,
            },
          });
          nodeIds.add(legacyNodeId);
        }

        edges.push({
          source: centerNodeId,
          target: legacyNodeId,
          type: 'similar_to',
          weight: result.similarity,
          label: `${Math.round(result.similarity * 100)}%`,
        });

        // Expert nodes from similar cases
        if (metadata.managerName) {
          const name = String(metadata.managerName);
          const expertNodeId = `expert:legacy:${metadata.managerId || name}`;
          const existing = expertMap.get(name);
          if (existing) {
            existing.cases++;
          } else {
            expertMap.set(name, { cases: 1, nodeId: expertNodeId });
          }

          if (!nodeIds.has(expertNodeId)) {
            nodes.push({
              id: expertNodeId,
              type: 'expert',
              label: name,
              metadata: {
                managerId: metadata.managerId,
                department: metadata.managerDepartment,
              },
            });
            nodeIds.add(expertNodeId);
          }

          // Edge from legacy request to expert
          edges.push({
            source: legacyNodeId,
            target: expertNodeId,
            type: 'assigned_to',
            weight: 0.5,
          });
        }

        // Counterparty nodes
        if (metadata.counterpartyName) {
          const cpName = String(metadata.counterpartyName);
          const cpNodeId = `counterparty:${cpName}`;
          if (!counterpartyMap.has(cpName)) {
            counterpartyMap.set(cpName, cpNodeId);
            if (!nodeIds.has(cpNodeId)) {
              nodes.push({
                id: cpNodeId,
                type: 'counterparty',
                label: cpName,
              });
              nodeIds.add(cpNodeId);
            }
          }

          edges.push({
            source: legacyNodeId,
            target: cpNodeId,
            type: 'belongs_to',
            weight: 0.3,
          });
        }

        // Topics
        if (metadata.subject) {
          const words = String(metadata.subject)
            .toLowerCase()
            .replace(/[^а-яёa-z0-9\s]/gi, '')
            .split(/\s+/)
            .filter((w) => w.length >= 5)
            .slice(0, 2);

          for (const word of words) {
            const topicNodeId = `topic:${word}`;
            if (!topicMap.has(word)) {
              topicMap.set(word, topicNodeId);
              if (!nodeIds.has(topicNodeId)) {
                nodes.push({
                  id: topicNodeId,
                  type: 'topic',
                  label: word,
                });
                nodeIds.add(topicNodeId);
              }
            }

            edges.push({
              source: legacyNodeId,
              target: topicNodeId,
              type: 'related_to',
              weight: 0.2,
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Error building similar cases graph: ${error.message}`);
    }
  }
}
