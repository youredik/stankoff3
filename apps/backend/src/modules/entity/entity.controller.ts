import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { EntityService } from './entity.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../user/user.entity';

@Controller('entities')
export class EntityController {
  constructor(private readonly entityService: EntityService) {}

  @Get()
  findAll(@Query('workspaceId') workspaceId?: string) {
    return this.entityService.findAll(workspaceId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.entityService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEntityDto) {
    return this.entityService.create(dto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateEntityDto) {
    return this.entityService.update(id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.entityService.updateStatus(id, body.status);
  }

  @Patch(':id/assignee')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateAssignee(
    @Param('id') id: string,
    @Body() body: { assigneeId: string | null },
  ) {
    return this.entityService.updateAssignee(id, body.assigneeId);
  }

  @Delete('cleanup/test-data')
  @Roles(UserRole.ADMIN)
  removeTestData() {
    return this.entityService.removeTestData();
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  remove(@Param('id') id: string) {
    return this.entityService.remove(id);
  }
}
