import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Headers,
  UnauthorizedException,
  RawBodyRequest,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
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
   * Handle incoming webhook with HMAC-SHA256 or plain secret validation
   */
  @Post(':triggerId')
  async handleWebhook(
    @Param('triggerId') triggerId: string,
    @Body() body: any,
    @Req() req: Request,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    const trigger = await this.triggersService.findOne(triggerId);

    // Validate trigger is a webhook trigger
    if (trigger.triggerType !== TriggerType.WEBHOOK) {
      throw new UnauthorizedException('Not a webhook trigger');
    }

    // Validate authentication if secret is configured
    if (trigger.conditions.secret) {
      if (signature) {
        // HMAC-SHA256 validation (preferred): X-Webhook-Signature: sha256=<hex>
        this.validateHmacSignature(trigger.conditions.secret, signature, req.body);
      } else if (secret) {
        // Fallback: plain secret comparison (X-Webhook-Secret header)
        this.validatePlainSecret(trigger.conditions.secret, secret);
      } else {
        throw new UnauthorizedException('Missing webhook authentication');
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

  /**
   * Validate HMAC-SHA256 signature.
   * Expected header format: sha256=<hex_digest>
   */
  private validateHmacSignature(
    secret: string,
    signatureHeader: string,
    body: any,
  ): void {
    const prefix = 'sha256=';
    if (!signatureHeader.startsWith(prefix)) {
      throw new UnauthorizedException('Invalid signature format. Expected: sha256=<hex>');
    }

    const receivedSig = signatureHeader.slice(prefix.length);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const expectedSig = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    const receivedBuf = Buffer.from(receivedSig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');

    if (
      receivedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(receivedBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  /**
   * Validate plain secret (legacy, kept for backwards compatibility)
   */
  private validatePlainSecret(expected: string, received: string): void {
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(received);

    if (
      expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)
    ) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }
}
