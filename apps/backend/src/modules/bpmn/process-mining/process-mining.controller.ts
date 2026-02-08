import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ProcessMiningService, ProcessMiningStats, TimeAnalysis, ElementStats } from './process-mining.service';

@Controller('bpmn/mining')
export class ProcessMiningController {
  constructor(private readonly miningService: ProcessMiningService) {}

  /**
   * Get detailed statistics for a specific process definition
   */
  @Get('definitions/:id/stats')
  async getProcessStats(
    @Param('id', ParseUUIDPipe) definitionId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ProcessMiningStats> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.miningService.getProcessStats(definitionId, start, end);
  }

  /**
   * Get time-based analysis for a process definition
   */
  @Get('definitions/:id/time-analysis')
  async getTimeAnalysis(
    @Param('id', ParseUUIDPipe) definitionId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<TimeAnalysis> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.miningService.getTimeAnalysis(definitionId, start, end);
  }

  /**
   * Get per-element execution statistics for heat map
   */
  @Get('definitions/:id/element-stats')
  async getElementStats(
    @Param('id', ParseUUIDPipe) definitionId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ElementStats> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.miningService.getElementStats(definitionId, start, end);
  }

  /**
   * Get workspace-wide process mining statistics
   */
  @Get('workspaces/:workspaceId/stats')
  async getWorkspaceStats(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<{
    totalDefinitions: number;
    totalInstances: number;
    avgCompletionRate: number;
    avgDurationMinutes: number;
    topProcessesByVolume: { name: string; count: number }[];
    topProcessesByDuration: { name: string; avgMinutes: number }[];
    statusDistribution: { status: string; count: number }[];
  }> {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.miningService.getWorkspaceStats(workspaceId, start, end);
  }
}
