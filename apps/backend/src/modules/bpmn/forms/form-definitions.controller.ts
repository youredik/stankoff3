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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FormDefinitionsService } from './form-definitions.service';
import { FormDefinition } from '../entities/form-definition.entity';
import { CreateFormDefinitionDto, UpdateFormDefinitionDto } from './dto/form-definition.dto';

interface AuthenticatedRequest {
  user: { id: string };
}

@Controller('bpmn/forms')
@UseGuards(JwtAuthGuard)
export class FormDefinitionsController {
  constructor(private readonly formService: FormDefinitionsService) {}

  @Get()
  async getFormDefinitions(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<FormDefinition[]> {
    return this.formService.findAll(workspaceId);
  }

  @Get(':id')
  async getFormDefinition(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FormDefinition> {
    return this.formService.findOne(id);
  }

  @Post()
  async createFormDefinition(
    @Body() dto: CreateFormDefinitionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<FormDefinition> {
    return this.formService.create(dto, req.user.id);
  }

  @Put(':id')
  async updateFormDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFormDefinitionDto,
  ): Promise<FormDefinition> {
    return this.formService.update(id, dto);
  }

  @Delete(':id')
  async deleteFormDefinition(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.formService.delete(id);
  }
}
