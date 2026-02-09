import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { IncidentService } from './incident.service';

@Controller('bpmn/incidents')
export class IncidentController {
  constructor(private readonly incidentService: IncidentService) {}

  /**
   * Get all incidents for a workspace
   * GET /api/bpmn/incidents?workspaceId=xxx
   */
  @Get()
  async findIncidents(@Query('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.incidentService.findIncidents(workspaceId);
  }

  /**
   * Get incident count for badge
   * GET /api/bpmn/incidents/count?workspaceId=xxx
   */
  @Get('count')
  async getIncidentCount(@Query('workspaceId', ParseUUIDPipe) workspaceId: string) {
    const count = await this.incidentService.getIncidentCount(workspaceId);
    return { count };
  }

  /**
   * Retry an incident (reset status to active)
   * POST /api/bpmn/incidents/:id/retry
   */
  @Post(':id/retry')
  async retryIncident(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentService.retryIncident(id);
  }

  /**
   * Cancel an incident (terminate the process instance)
   * POST /api/bpmn/incidents/:id/cancel
   */
  @Post(':id/cancel')
  async cancelIncident(@Param('id', ParseUUIDPipe) id: string) {
    await this.incidentService.cancelIncident(id);
    return { success: true };
  }
}
