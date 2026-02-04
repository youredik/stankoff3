import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { BpmnService } from './bpmn.service';
import { BpmnTemplatesService } from './bpmn-templates.service';
import { ProcessDefinition } from './entities/process-definition.entity';
import { ProcessInstance } from './entities/process-instance.entity';

@Controller('bpmn')
@UseGuards(JwtAuthGuard)
export class BpmnController {
  constructor(
    private readonly bpmnService: BpmnService,
    private readonly templatesService: BpmnTemplatesService,
  ) {}

  // ==================== Health ====================

  @Public()
  @Get('health')
  async getHealth() {
    return this.bpmnService.getHealth();
  }

  // ==================== Process Definitions ====================

  @Get('definitions/:workspaceId')
  async getDefinitions(
    @Param('workspaceId') workspaceId: string,
  ): Promise<ProcessDefinition[]> {
    return this.bpmnService.findAllDefinitions(workspaceId);
  }

  @Get('definition/:id')
  async getDefinition(@Param('id') id: string): Promise<ProcessDefinition> {
    return this.bpmnService.findDefinition(id);
  }

  @Post('definitions/:workspaceId')
  async createDefinition(
    @Param('workspaceId') workspaceId: string,
    @Body()
    body: {
      name: string;
      description?: string;
      processId: string;
      bpmnXml: string;
      isDefault?: boolean;
    },
    @Request() req: any,
  ): Promise<ProcessDefinition> {
    return this.bpmnService.createDefinition(workspaceId, body, req.user?.id);
  }

  @Post('definition/:id/deploy')
  async deployDefinition(
    @Param('id') id: string,
  ): Promise<ProcessDefinition> {
    return this.bpmnService.deployDefinition(id);
  }

  // ==================== Process Instances ====================

  @Get('instances/workspace/:workspaceId')
  async getWorkspaceInstances(
    @Param('workspaceId') workspaceId: string,
  ): Promise<ProcessInstance[]> {
    return this.bpmnService.findInstancesByWorkspace(workspaceId);
  }

  @Get('instances/entity/:entityId')
  async getEntityInstances(
    @Param('entityId') entityId: string,
  ): Promise<ProcessInstance[]> {
    return this.bpmnService.findInstancesByEntity(entityId);
  }

  @Post('instances/start')
  async startInstance(
    @Body()
    body: {
      definitionId: string;
      entityId?: string;
      businessKey?: string;
      variables?: Record<string, any>;
    },
    @Request() req: any,
  ): Promise<ProcessInstance> {
    return this.bpmnService.startProcess(
      body.definitionId,
      body.variables || {},
      {
        entityId: body.entityId,
        businessKey: body.businessKey,
        startedById: req.user?.id,
      },
    );
  }

  // ==================== Statistics ====================

  @Get('statistics/definition/:id')
  async getDefinitionStatistics(@Param('id') id: string) {
    return this.bpmnService.getDefinitionStatistics(id);
  }

  @Get('statistics/workspace/:workspaceId')
  async getWorkspaceStatistics(@Param('workspaceId') workspaceId: string) {
    return this.bpmnService.getWorkspaceStatistics(workspaceId);
  }

  // ==================== Messages ====================

  @Post('message/:messageName')
  async sendMessage(
    @Param('messageName') messageName: string,
    @Body()
    body: {
      correlationKey: string;
      variables?: Record<string, any>;
    },
  ): Promise<{ success: boolean }> {
    await this.bpmnService.sendMessage(
      messageName,
      body.correlationKey,
      body.variables,
    );
    return { success: true };
  }

  // ==================== Instance Management ====================

  @Post('instances/:processInstanceKey/cancel')
  async cancelInstance(
    @Param('processInstanceKey') processInstanceKey: string,
  ): Promise<{ success: boolean }> {
    await this.bpmnService.cancelInstance(processInstanceKey);
    return { success: true };
  }

  // ==================== Definitions Management ====================

  @Delete('definition/:id')
  async deleteDefinition(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.bpmnService.deleteDefinition(id);
    return { success: true };
  }

  // ==================== Templates ====================

  @Get('templates')
  async getTemplates(
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    if (search) {
      return this.templatesService.searchTemplates(search);
    }
    if (category) {
      return this.templatesService.getTemplatesByCategory(category);
    }
    return this.templatesService.getTemplatesList();
  }

  @Get('templates/categories')
  async getTemplateCategories() {
    return this.templatesService.getCategories();
  }

  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    const template = this.templatesService.getTemplate(id);
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }
    return template;
  }
}
