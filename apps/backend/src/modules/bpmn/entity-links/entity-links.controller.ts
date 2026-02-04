import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { EntityLinksService } from './entity-links.service';
import { EntityLinkType } from '../entities/entity-link.entity';

class CreateLinkDto {
  sourceEntityId: string;
  targetEntityId: string;
  linkType: EntityLinkType;
  metadata?: Record<string, any>;
}

class CreateLinkedEntityDto {
  sourceEntityId: string;
  targetWorkspaceId: string;
  title: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high';
  data?: Record<string, any>;
  linkType?: EntityLinkType;
}

@Controller('bpmn/entity-links')
export class EntityLinksController {
  constructor(private readonly linksService: EntityLinksService) {}

  /**
   * Create a link between two entities
   * POST /api/bpmn/entity-links
   */
  @Post()
  async createLink(@Body() dto: CreateLinkDto, @Request() req: any) {
    return this.linksService.createLink({
      ...dto,
      createdById: req.user.id,
    });
  }

  /**
   * Get all links for an entity
   * GET /api/bpmn/entity-links/entity/:entityId
   */
  @Get('entity/:entityId')
  async getLinksForEntity(@Param('entityId', ParseUUIDPipe) entityId: string) {
    return this.linksService.getLinksForEntity(entityId);
  }

  /**
   * Get linked entities with details
   * GET /api/bpmn/entity-links/entity/:entityId/linked?direction=both
   */
  @Get('entity/:entityId/linked')
  async getLinkedEntities(
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Query('direction') direction?: 'outgoing' | 'incoming' | 'both',
  ) {
    return this.linksService.getLinkedEntities(entityId, direction || 'both');
  }

  /**
   * Get links by type
   * GET /api/bpmn/entity-links/entity/:entityId/type/:linkType
   */
  @Get('entity/:entityId/type/:linkType')
  async getLinksByType(
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Param('linkType') linkType: EntityLinkType,
  ) {
    return this.linksService.getLinksByType(entityId, linkType);
  }

  /**
   * Create an entity and link it to source
   * POST /api/bpmn/entity-links/spawn
   */
  @Post('spawn')
  async createLinkedEntity(@Body() dto: CreateLinkedEntityDto, @Request() req: any) {
    return this.linksService.createLinkedEntity({
      ...dto,
      createdById: req.user.id,
    });
  }

  /**
   * Get link statistics for workspace
   * GET /api/bpmn/entity-links/statistics?workspaceId=xxx
   */
  @Get('statistics')
  async getStatistics(@Query('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.linksService.getLinkStatistics(workspaceId);
  }

  /**
   * Delete a link
   * DELETE /api/bpmn/entity-links/:id
   */
  @Delete(':id')
  async deleteLink(@Param('id', ParseUUIDPipe) id: string) {
    await this.linksService.deleteLink(id);
    return { success: true };
  }
}
