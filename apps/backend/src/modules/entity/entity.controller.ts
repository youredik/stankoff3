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
  updateAssignee(
    @Param('id') id: string,
    @Body() body: { assigneeId: string | null },
  ) {
    return this.entityService.updateAssignee(id, body.assigneeId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.entityService.remove(id);
  }
}
