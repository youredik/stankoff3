import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntityLink, EntityLinkType } from '../entities/entity-link.entity';
import { EntityService } from '../../entity/entity.service';

export interface CreateLinkDto {
  sourceEntityId: string;
  targetEntityId: string;
  linkType: EntityLinkType;
  metadata?: Record<string, any>;
  createdById?: string;
  processInstanceId?: string;
}

export interface EntityWithLinks {
  id: string;
  customId?: string;
  title?: string;
  status?: string;
  workspaceId: string;
  linkType: EntityLinkType;
  linkId: string;
  linkedAt: Date;
}

@Injectable()
export class EntityLinksService {
  private readonly logger = new Logger(EntityLinksService.name);

  constructor(
    @InjectRepository(EntityLink)
    private linkRepository: Repository<EntityLink>,
    @Inject(forwardRef(() => EntityService))
    private entityService: EntityService,
  ) {}

  // ==================== CRUD Operations ====================

  /**
   * Create a link between two entities
   */
  async createLink(dto: CreateLinkDto): Promise<EntityLink> {
    // Validate both entities exist
    await this.entityService.findOne(dto.sourceEntityId);
    await this.entityService.findOne(dto.targetEntityId);

    // Check for duplicate link
    const existing = await this.linkRepository.findOne({
      where: {
        sourceEntityId: dto.sourceEntityId,
        targetEntityId: dto.targetEntityId,
        linkType: dto.linkType,
      },
    });

    if (existing) {
      this.logger.warn(`Link already exists: ${existing.id}`);
      return existing;
    }

    // Prevent self-links
    if (dto.sourceEntityId === dto.targetEntityId) {
      throw new BadRequestException('Cannot link entity to itself');
    }

    const link = this.linkRepository.create({
      sourceEntityId: dto.sourceEntityId,
      targetEntityId: dto.targetEntityId,
      linkType: dto.linkType,
      metadata: dto.metadata || {},
      createdById: dto.createdById,
      processInstanceId: dto.processInstanceId,
    });

    const saved = await this.linkRepository.save(link);
    this.logger.log(
      `Created ${dto.linkType} link: ${dto.sourceEntityId} -> ${dto.targetEntityId}`,
    );

    // Create reverse link for bidirectional types
    if (this.shouldCreateReverseLink(dto.linkType)) {
      const reverseType = this.getReverseType(dto.linkType);
      const reverseLink = this.linkRepository.create({
        sourceEntityId: dto.targetEntityId,
        targetEntityId: dto.sourceEntityId,
        linkType: reverseType,
        metadata: { originalLinkId: saved.id, ...dto.metadata },
        createdById: dto.createdById,
        processInstanceId: dto.processInstanceId,
      });
      await this.linkRepository.save(reverseLink);
    }

    return saved;
  }

  /**
   * Get all links for an entity (both as source and target)
   */
  async getLinksForEntity(entityId: string): Promise<EntityLink[]> {
    return this.linkRepository.find({
      where: [{ sourceEntityId: entityId }, { targetEntityId: entityId }],
      relations: ['sourceEntity', 'targetEntity', 'createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get linked entities with details
   */
  async getLinkedEntities(
    entityId: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both',
  ): Promise<EntityWithLinks[]> {
    const links = await this.linkRepository.find({
      where:
        direction === 'outgoing'
          ? { sourceEntityId: entityId }
          : direction === 'incoming'
            ? { targetEntityId: entityId }
            : [{ sourceEntityId: entityId }, { targetEntityId: entityId }],
      relations: ['sourceEntity', 'targetEntity'],
    });

    const result: EntityWithLinks[] = [];

    for (const link of links) {
      // Determine the "other" entity
      const isSource = link.sourceEntityId === entityId;
      const linkedEntity = isSource ? link.targetEntity : link.sourceEntity;

      if (linkedEntity) {
        result.push({
          id: linkedEntity.id,
          customId: linkedEntity.customId,
          title: linkedEntity.title,
          status: linkedEntity.status,
          workspaceId: linkedEntity.workspaceId,
          linkType: link.linkType,
          linkId: link.id,
          linkedAt: link.createdAt,
        });
      }
    }

    return result;
  }

  /**
   * Get links by type
   */
  async getLinksByType(
    entityId: string,
    linkType: EntityLinkType,
  ): Promise<EntityLink[]> {
    return this.linkRepository.find({
      where: { sourceEntityId: entityId, linkType },
      relations: ['targetEntity'],
    });
  }

  /**
   * Delete a link
   */
  async deleteLink(linkId: string): Promise<void> {
    const link = await this.linkRepository.findOne({ where: { id: linkId } });
    if (!link) {
      throw new NotFoundException(`Link ${linkId} not found`);
    }

    // Delete reverse link if exists
    if (this.shouldCreateReverseLink(link.linkType)) {
      await this.linkRepository.delete({
        sourceEntityId: link.targetEntityId,
        targetEntityId: link.sourceEntityId,
        linkType: this.getReverseType(link.linkType),
      });
    }

    await this.linkRepository.remove(link);
    this.logger.log(`Deleted link ${linkId}`);
  }

  /**
   * Delete all links for an entity
   */
  async deleteLinksForEntity(entityId: string): Promise<number> {
    const result = await this.linkRepository.delete([
      { sourceEntityId: entityId },
      { targetEntityId: entityId },
    ]);

    this.logger.log(`Deleted ${result.affected} links for entity ${entityId}`);
    return result.affected || 0;
  }

  // ==================== BPMN Integration ====================

  /**
   * Create an entity and link it to the source entity
   * Used by BPMN workers to spawn sub-entities
   */
  async createLinkedEntity(params: {
    sourceEntityId: string;
    targetWorkspaceId: string;
    title: string;
    status?: string;
    priority?: 'low' | 'medium' | 'high';
    data?: Record<string, any>;
    linkType?: EntityLinkType;
    createdById?: string;
    processInstanceId?: string;
  }): Promise<{ entity: any; link: EntityLink }> {
    // Create the new entity
    const entity = await this.entityService.create(
      {
        workspaceId: params.targetWorkspaceId,
        title: params.title,
        status: params.status || 'new',
        priority: params.priority || 'medium',
        data: params.data || {},
      },
      params.createdById,
    );

    // Create link between source and new entity
    const link = await this.createLink({
      sourceEntityId: params.sourceEntityId,
      targetEntityId: entity.id,
      linkType: params.linkType || EntityLinkType.SPAWNED,
      createdById: params.createdById,
      processInstanceId: params.processInstanceId,
      metadata: {
        spawnedFrom: params.sourceEntityId,
        spawnedTo: entity.id,
        targetWorkspaceId: params.targetWorkspaceId,
      },
    });

    this.logger.log(
      `Created linked entity ${entity.id} (${entity.customId}) from ${params.sourceEntityId}`,
    );

    return { entity, link };
  }

  /**
   * Get all entities spawned by a process instance
   */
  async getEntitiesByProcessInstance(processInstanceId: string): Promise<EntityLink[]> {
    return this.linkRepository.find({
      where: { processInstanceId },
      relations: ['sourceEntity', 'targetEntity'],
    });
  }

  // ==================== Helper Methods ====================

  private shouldCreateReverseLink(linkType: EntityLinkType): boolean {
    const bidirectionalTypes = [
      EntityLinkType.BLOCKS,
      EntityLinkType.BLOCKED_BY,
      EntityLinkType.PARENT,
      EntityLinkType.CHILD,
    ];
    return bidirectionalTypes.includes(linkType);
  }

  private getReverseType(linkType: EntityLinkType): EntityLinkType {
    const reverseMap: Record<EntityLinkType, EntityLinkType> = {
      [EntityLinkType.BLOCKS]: EntityLinkType.BLOCKED_BY,
      [EntityLinkType.BLOCKED_BY]: EntityLinkType.BLOCKS,
      [EntityLinkType.PARENT]: EntityLinkType.CHILD,
      [EntityLinkType.CHILD]: EntityLinkType.PARENT,
      [EntityLinkType.RELATED]: EntityLinkType.RELATED,
      [EntityLinkType.SPAWNED]: EntityLinkType.SPAWNED,
      [EntityLinkType.DUPLICATE]: EntityLinkType.DUPLICATE,
    };
    return reverseMap[linkType] || linkType;
  }

  // ==================== Statistics ====================

  async getLinkStatistics(workspaceId: string): Promise<{
    totalLinks: number;
    byType: Record<string, number>;
    crossWorkspaceLinks: number;
  }> {
    const links = await this.linkRepository
      .createQueryBuilder('link')
      .innerJoin('link.sourceEntity', 'source')
      .where('source.workspaceId = :workspaceId', { workspaceId })
      .getMany();

    const byType: Record<string, number> = {};
    let crossWorkspaceLinks = 0;

    for (const link of links) {
      byType[link.linkType] = (byType[link.linkType] || 0) + 1;

      // Check if cross-workspace (need to load target entity)
      const targetEntity = await this.entityService.findOne(link.targetEntityId);
      if (targetEntity && targetEntity.workspaceId !== workspaceId) {
        crossWorkspaceLinks++;
      }
    }

    return {
      totalLinks: links.length,
      byType,
      crossWorkspaceLinks,
    };
  }
}
