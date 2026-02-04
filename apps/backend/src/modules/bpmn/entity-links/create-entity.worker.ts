import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EntityLinksService } from './entity-links.service';
import { EntityLinkType } from '../entities/entity-link.entity';

/**
 * Worker that handles create-entity service tasks from Zeebe
 *
 * This worker allows BPMN processes to create new entities in any workspace
 * and automatically link them to the source entity (cross-workspace support).
 *
 * Job type in BPMN: "create-entity"
 *
 * Variables expected:
 * - sourceEntityId: UUID of the source entity (optional, for linking)
 * - targetWorkspaceId: UUID of the workspace to create entity in
 * - title: Title for the new entity
 * - status: Initial status (optional, defaults to "new")
 * - priority: Priority level (optional, defaults to "medium")
 * - data: Additional entity data (optional, JSON object)
 * - linkType: Type of link to create (optional, defaults to "spawned")
 *
 * Returns:
 * - createdEntityId: UUID of the newly created entity
 * - createdEntityCustomId: Human-readable ID (e.g., "WRK-123")
 * - linkId: UUID of the created link (if sourceEntityId provided)
 */
@Injectable()
export class CreateEntityWorker {
  private readonly logger = new Logger(CreateEntityWorker.name);

  constructor(
    @Inject(forwardRef(() => EntityLinksService))
    private readonly linksService: EntityLinksService,
  ) {}

  /**
   * Handle create-entity job from Zeebe
   */
  async handleCreateEntity(job: {
    key: string;
    variables: Record<string, any>;
    processInstanceKey: string;
  }): Promise<{
    createdEntityId: string;
    createdEntityCustomId: string;
    linkId?: string;
  }> {
    const variables = job.variables;

    this.logger.log(`Handling create-entity job ${job.key}`);

    const {
      sourceEntityId,
      targetWorkspaceId,
      title,
      status = 'new',
      priority = 'medium',
      data = {},
      linkType = EntityLinkType.SPAWNED,
      createdById,
    } = variables;

    if (!targetWorkspaceId) {
      throw new Error('targetWorkspaceId is required');
    }

    if (!title) {
      throw new Error('title is required');
    }

    // If sourceEntityId is provided, create entity with link
    if (sourceEntityId) {
      const { entity, link } = await this.linksService.createLinkedEntity({
        sourceEntityId,
        targetWorkspaceId,
        title,
        status,
        priority: priority as 'low' | 'medium' | 'high',
        data,
        linkType,
        createdById,
        processInstanceId: String(job.processInstanceKey),
      });

      this.logger.log(
        `Created linked entity ${entity.id} (${entity.customId}) from job ${job.key}`,
      );

      return {
        createdEntityId: entity.id,
        createdEntityCustomId: entity.customId,
        linkId: link.id,
      };
    }

    // Create standalone entity without link
    // In this case, we need to use EntityService directly
    // This is handled by EntityLinksService internally
    const { entity } = await this.linksService.createLinkedEntity({
      sourceEntityId: '', // Will be handled specially
      targetWorkspaceId,
      title,
      status,
      priority: priority as 'low' | 'medium' | 'high',
      data,
      createdById,
    });

    this.logger.log(
      `Created standalone entity ${entity.id} (${entity.customId}) from job ${job.key}`,
    );

    return {
      createdEntityId: entity.id,
      createdEntityCustomId: entity.customId,
    };
  }

  /**
   * Handle update-entity-status job from Zeebe
   * Job type: "update-entity-status"
   */
  async handleUpdateStatus(job: {
    key: string;
    variables: Record<string, any>;
  }): Promise<{ success: boolean }> {
    const { entityId, status, userId } = job.variables;

    if (!entityId || !status) {
      throw new Error('entityId and status are required');
    }

    this.logger.log(`Handling update-entity-status job ${job.key}`);

    // Note: This should call EntityService.updateStatus()
    // For now, we just log it as the actual implementation requires EntityService injection
    this.logger.log(`Would update entity ${entityId} to status ${status}`);

    return { success: true };
  }

  /**
   * Handle link-entities job from Zeebe
   * Job type: "link-entities"
   */
  async handleLinkEntities(job: {
    key: string;
    variables: Record<string, any>;
    processInstanceKey: string;
  }): Promise<{ linkId: string }> {
    const {
      sourceEntityId,
      targetEntityId,
      linkType = EntityLinkType.RELATED,
      metadata = {},
      createdById,
    } = job.variables;

    if (!sourceEntityId || !targetEntityId) {
      throw new Error('sourceEntityId and targetEntityId are required');
    }

    this.logger.log(`Handling link-entities job ${job.key}`);

    const link = await this.linksService.createLink({
      sourceEntityId,
      targetEntityId,
      linkType,
      metadata,
      createdById,
      processInstanceId: String(job.processInstanceKey),
    });

    this.logger.log(`Created link ${link.id} from job ${job.key}`);

    return { linkId: link.id };
  }
}
