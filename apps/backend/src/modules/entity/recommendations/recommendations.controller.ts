import { Controller, Get, Query, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  RecommendationsService,
  AssigneeRecommendation,
  PriorityRecommendation,
  ResponseTimeEstimate,
  SimilarEntity,
} from './recommendations.service';

@Controller('recommendations')
@UseGuards(JwtAuthGuard)
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  /**
   * Get recommended assignees for a new entity
   */
  @Get('assignees')
  async recommendAssignees(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('title') title: string,
    @Query('description') description?: string,
    @Query('limit') limit?: string,
  ): Promise<AssigneeRecommendation[]> {
    return this.recommendationsService.recommendAssignees(
      workspaceId,
      title,
      description,
      limit ? parseInt(limit, 10) : 5,
    );
  }

  /**
   * Get priority recommendation for an entity
   */
  @Get('priority')
  async recommendPriority(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('title') title: string,
    @Query('description') description?: string,
  ): Promise<PriorityRecommendation> {
    return this.recommendationsService.recommendPriority(
      workspaceId,
      title,
      description,
    );
  }

  /**
   * Get estimated response time
   */
  @Get('response-time')
  async estimateResponseTime(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('title') title?: string,
    @Query('assigneeId') assigneeId?: string,
  ): Promise<ResponseTimeEstimate> {
    return this.recommendationsService.estimateResponseTime(
      workspaceId,
      title,
      assigneeId,
    );
  }

  /**
   * Find similar entities
   */
  @Get('similar')
  async findSimilarEntities(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('title') title: string,
    @Query('description') description?: string,
    @Query('excludeEntityId') excludeEntityId?: string,
    @Query('limit') limit?: string,
  ): Promise<SimilarEntity[]> {
    return this.recommendationsService.findSimilarEntities(
      workspaceId,
      title,
      description,
      excludeEntityId,
      limit ? parseInt(limit, 10) : 5,
    );
  }
}
