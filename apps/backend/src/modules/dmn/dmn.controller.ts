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
import { DmnService } from './dmn.service';
import { DecisionTable } from './entities/decision-table.entity';
import { DecisionEvaluation } from './entities/decision-evaluation.entity';
import { CreateDecisionTableDto, UpdateDecisionTableDto, EvaluateDecisionDto } from './dto/create-decision-table.dto';
import { EvaluationOutput } from './dmn-evaluator.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@Controller('dmn')
@UseGuards(JwtAuthGuard)
export class DmnController {
  constructor(private readonly dmnService: DmnService) {}

  // ===================== Table CRUD =====================

  @Get('tables')
  async getTables(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<DecisionTable[]> {
    return this.dmnService.findTables(workspaceId);
  }

  @Get('tables/:id')
  async getTable(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DecisionTable> {
    return this.dmnService.findTable(id);
  }

  @Post('tables')
  async createTable(
    @Body() dto: CreateDecisionTableDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<DecisionTable> {
    return this.dmnService.createTable(dto, req.user.id);
  }

  @Put('tables/:id')
  async updateTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDecisionTableDto,
  ): Promise<DecisionTable> {
    return this.dmnService.updateTable(id, dto);
  }

  @Delete('tables/:id')
  async deleteTable(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.dmnService.deleteTable(id);
  }

  @Post('tables/:id/clone')
  async cloneTable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('name') name: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<DecisionTable> {
    return this.dmnService.cloneTable(id, name, req.user.id);
  }

  // ===================== Evaluation =====================

  @Post('evaluate')
  async evaluate(
    @Body() dto: EvaluateDecisionDto,
  ): Promise<{ evaluation: DecisionEvaluation; output: EvaluationOutput }> {
    return this.dmnService.evaluate(dto);
  }

  @Post('evaluate/quick')
  async evaluateQuick(
    @Body('tableId', ParseUUIDPipe) tableId: string,
    @Body('inputData') inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.dmnService.evaluateQuick(tableId, inputData);
  }

  @Post('evaluate/by-name')
  async evaluateByName(
    @Body('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body('tableName') tableName: string,
    @Body('inputData') inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.dmnService.evaluateByName(workspaceId, tableName, inputData);
  }

  // ===================== History =====================

  @Get('tables/:id/evaluations')
  async getEvaluations(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ evaluations: DecisionEvaluation[]; total: number }> {
    return this.dmnService.getEvaluations(id, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('evaluations/target/:targetType/:targetId')
  async getTargetEvaluations(
    @Param('targetType') targetType: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
  ): Promise<DecisionEvaluation[]> {
    return this.dmnService.getTargetEvaluations(targetType, targetId);
  }

  // ===================== Statistics =====================

  @Get('tables/:id/statistics')
  async getStatistics(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{
    totalEvaluations: number;
    avgEvaluationTime: number;
    ruleHitCounts: Record<string, number>;
  }> {
    return this.dmnService.getStatistics(id);
  }
}
