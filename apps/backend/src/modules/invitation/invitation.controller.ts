import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InvitationService } from './invitation.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { BulkInviteDto } from './dto/bulk-invite.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationStatus } from './invitation.entity';
import { RequirePermission } from '../rbac/rbac.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { User } from '../user/user.entity';

@Controller('invitations')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  // ─── Защищённые endpoints (admin) ───────────────

  @Get()
  @RequirePermission('global:user:manage')
  findAll(
    @Query('status') status?: InvitationStatus,
    @Query('search') search?: string,
  ) {
    return this.invitationService.findAll({ status, search });
  }

  @Post()
  @RequirePermission('global:user:manage')
  create(@Body() dto: CreateInvitationDto, @CurrentUser() user: User) {
    return this.invitationService.create(dto, user);
  }

  @Post('bulk')
  @RequirePermission('global:user:manage')
  bulkCreate(@Body() dto: BulkInviteDto, @CurrentUser() user: User) {
    return this.invitationService.bulkCreate(dto, user);
  }

  @Post(':id/revoke')
  @RequirePermission('global:user:manage')
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.invitationService.revoke(id);
  }

  @Post(':id/resend')
  @RequirePermission('global:user:manage')
  resend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.invitationService.resend(id, user);
  }

  // ─── Публичные endpoints ────────────────────────

  @Public()
  @Get('verify/:token')
  verifyToken(@Param('token') token: string) {
    return this.invitationService.verifyToken(token);
  }

  @Public()
  @Post('accept')
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitationService.accept(dto);
  }
}
