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
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../user/user.entity';
import { TriggersService } from './triggers.service';
import { CreateTriggerDto, UpdateTriggerDto } from './dto/trigger.dto';
import { TriggerType } from '../entities/process-trigger.entity';

@Controller('bpmn/triggers')
@UseGuards(JwtAuthGuard)
export class TriggersController {
  constructor(private readonly triggersService: TriggersService) {}

  /**
   * Get all triggers for a workspace
   */
  @Get()
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.triggersService.findByWorkspace(workspaceId);
  }

  /**
   * Get triggers for a specific process definition
   */
  @Get('definition/:definitionId')
  async findByDefinition(@Param('definitionId') definitionId: string) {
    return this.triggersService.findByDefinition(definitionId);
  }

  /**
   * Get a specific trigger
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.triggersService.findOne(id);
  }

  /**
   * Create a new trigger
   */
  @Post()
  async create(
    @Body() dto: CreateTriggerDto,
    @CurrentUser() user: User,
  ) {
    return this.triggersService.create(dto, user.id);
  }

  /**
   * Update a trigger
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTriggerDto,
  ) {
    return this.triggersService.update(id, dto);
  }

  /**
   * Delete a trigger
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.triggersService.delete(id);
  }

  /**
   * Toggle trigger active state
   */
  @Post(':id/toggle')
  async toggle(@Param('id') id: string) {
    return this.triggersService.toggle(id);
  }

  /**
   * Get execution history for a trigger
   */
  @Get(':id/executions')
  async getExecutions(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.triggersService.getExecutions(id, limit ? parseInt(limit, 10) : 50);
  }

  /**
   * Get recent executions for a workspace
   */
  @Get('executions/recent')
  async getRecentExecutions(
    @Query('workspaceId') workspaceId: string,
    @Query('limit') limit?: string,
  ) {
    return this.triggersService.getRecentExecutions(
      workspaceId,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}

/**
 * Controller for webhook triggers (no auth required)
 */
@Controller('bpmn/triggers/webhook')
export class WebhookTriggersController {
  constructor(private readonly triggersService: TriggersService) {}

  /**
   * Handle incoming webhook
   */
  @Post(':triggerId')
  async handleWebhook(
    @Param('triggerId') triggerId: string,
    @Body() body: any,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    const trigger = await this.triggersService.findOne(triggerId);

    // Validate trigger is a webhook trigger
    if (trigger.triggerType !== TriggerType.WEBHOOK) {
      throw new UnauthorizedException('Not a webhook trigger');
    }

    // Validate secret if configured
    if (trigger.conditions.secret) {
      if (secret !== trigger.conditions.secret) {
        throw new UnauthorizedException('Invalid webhook secret');
      }
    }

    // Fire the trigger with webhook payload as context
    await this.triggersService.evaluateTriggers(
      TriggerType.WEBHOOK,
      {
        triggerId,
        payload: body,
        workspaceId: trigger.workspaceId,
      },
      trigger.workspaceId,
    );

    return { success: true };
  }
}
