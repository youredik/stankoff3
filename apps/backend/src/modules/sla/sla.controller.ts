import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SlaService, SlaStatusInfo } from './sla.service';
import { SlaDefinition, SlaTargetType } from './entities/sla-definition.entity';
import { SlaInstance } from './entities/sla-instance.entity';
import { CreateSlaDefinitionDto, UpdateSlaDefinitionDto } from './dto/create-sla-definition.dto';

interface AuthenticatedRequest {
  user: { id: string };
}

@Controller('sla')
@UseGuards(JwtAuthGuard)
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  // ===================== Definition Endpoints =====================

  @Get('definitions')
  async getDefinitions(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<SlaDefinition[]> {
    return this.slaService.findDefinitions(workspaceId);
  }

  @Get('definitions/:id')
  async getDefinition(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SlaDefinition> {
    return this.slaService.findDefinition(id);
  }

  @Post('definitions')
  async createDefinition(
    @Body() dto: CreateSlaDefinitionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SlaDefinition> {
    return this.slaService.createDefinition(dto, req.user.id);
  }

  @Put('definitions/:id')
  async updateDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSlaDefinitionDto,
  ): Promise<SlaDefinition> {
    return this.slaService.updateDefinition(id, dto);
  }

  @Delete('definitions/:id')
  async deleteDefinition(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.slaService.deleteDefinition(id);
  }

  // ===================== Status Endpoints =====================

  @Get('status/:targetType/:targetId')
  async getStatus(
    @Param('targetType') targetType: SlaTargetType,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ): Promise<SlaStatusInfo | null> {
    return this.slaService.getStatus(targetType, targetId);
  }

  @Get('dashboard')
  async getDashboard(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{
    total: number;
    pending: number;
    met: number;
    breached: number;
    atRisk: number;
  }> {
    return this.slaService.getDashboard(workspaceId);
  }

  // ===================== Instance Control Endpoints =====================

  @Post('instances/:id/pause')
  async pauseInstance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ): Promise<SlaInstance> {
    return this.slaService.pauseSla(id, reason || 'Manual pause');
  }

  @Post('instances/:id/resume')
  async resumeInstance(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SlaInstance> {
    return this.slaService.resumeSla(id);
  }
}
