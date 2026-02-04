import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DecisionTable } from './entities/decision-table.entity';
import { DecisionEvaluation } from './entities/decision-evaluation.entity';
import { DmnEvaluatorService, EvaluationOutput } from './dmn-evaluator.service';
import { CreateDecisionTableDto, UpdateDecisionTableDto, EvaluateDecisionDto } from './dto/create-decision-table.dto';

@Injectable()
export class DmnService {
  private readonly logger = new Logger(DmnService.name);

  constructor(
    @InjectRepository(DecisionTable)
    private tableRepository: Repository<DecisionTable>,
    @InjectRepository(DecisionEvaluation)
    private evaluationRepository: Repository<DecisionEvaluation>,
    private evaluator: DmnEvaluatorService,
  ) {}

  // ===================== Decision Table CRUD =====================

  async createTable(dto: CreateDecisionTableDto, userId: string): Promise<DecisionTable> {
    // Validate table structure
    const errors = this.evaluator.validateTable(dto);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join('; '));
    }

    const table = this.tableRepository.create({
      ...dto,
      createdById: userId,
      version: 1,
    });

    return this.tableRepository.save(table);
  }

  async findTables(workspaceId: string): Promise<DecisionTable[]> {
    return this.tableRepository.find({
      where: { workspaceId },
      order: { name: 'ASC' },
    });
  }

  async findTable(id: string): Promise<DecisionTable> {
    const table = await this.tableRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!table) {
      throw new NotFoundException(`Decision table ${id} not found`);
    }
    return table;
  }

  async updateTable(id: string, dto: UpdateDecisionTableDto): Promise<DecisionTable> {
    const table = await this.findTable(id);

    // Validate if structure is being updated
    if (dto.inputColumns || dto.outputColumns || dto.rules) {
      const updatedTable = { ...table, ...dto };
      const errors = this.evaluator.validateTable(updatedTable);
      if (errors.length > 0) {
        throw new BadRequestException(errors.join('; '));
      }
    }

    // Increment version if rules are changed
    if (dto.rules) {
      dto = { ...dto } as UpdateDecisionTableDto & { version: number };
      (dto as UpdateDecisionTableDto & { version: number }).version = table.version + 1;
    }

    Object.assign(table, dto);
    return this.tableRepository.save(table);
  }

  async deleteTable(id: string): Promise<void> {
    const table = await this.findTable(id);
    await this.tableRepository.remove(table);
  }

  // ===================== Evaluation =====================

  async evaluate(dto: EvaluateDecisionDto): Promise<{
    evaluation: DecisionEvaluation;
    output: EvaluationOutput;
  }> {
    const table = await this.findTable(dto.decisionTableId);

    if (!table.isActive) {
      throw new BadRequestException('Decision table is not active');
    }

    // Run evaluation
    const output = this.evaluator.evaluate(table, dto.inputData);

    // Log evaluation
    const evaluation = this.evaluationRepository.create({
      decisionTableId: table.id,
      targetType: dto.targetType,
      targetId: dto.targetId,
      inputData: dto.inputData,
      outputData: output.finalOutput,
      matchedRules: output.results,
      evaluationTimeMs: output.evaluationTimeMs,
      triggeredBy: dto.triggeredBy || 'api',
    });

    const saved = await this.evaluationRepository.save(evaluation);

    this.logger.log(
      `Evaluated table ${table.name}: ${output.matchedCount} rules matched in ${output.evaluationTimeMs}ms`,
    );

    return { evaluation: saved, output };
  }

  /**
   * Quick evaluation without logging (for internal use)
   */
  async evaluateQuick(
    tableId: string,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const table = await this.findTable(tableId);

    if (!table.isActive) {
      throw new BadRequestException('Decision table is not active');
    }

    const output = this.evaluator.evaluate(table, inputData);
    return output.finalOutput;
  }

  /**
   * Evaluate by table name within workspace
   */
  async evaluateByName(
    workspaceId: string,
    tableName: string,
    inputData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const table = await this.tableRepository.findOne({
      where: { workspaceId, name: tableName, isActive: true },
    });

    if (!table) {
      throw new NotFoundException(`Decision table "${tableName}" not found in workspace`);
    }

    const output = this.evaluator.evaluate(table, inputData);
    return output.finalOutput;
  }

  // ===================== Evaluation History =====================

  async getEvaluations(
    tableId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ evaluations: DecisionEvaluation[]; total: number }> {
    const { limit = 50, offset = 0 } = options;

    const [evaluations, total] = await this.evaluationRepository.findAndCount({
      where: { decisionTableId: tableId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { evaluations, total };
  }

  async getTargetEvaluations(
    targetType: string,
    targetId: string,
  ): Promise<DecisionEvaluation[]> {
    return this.evaluationRepository.find({
      where: { targetType, targetId },
      relations: ['decisionTable'],
      order: { createdAt: 'DESC' },
    });
  }

  // ===================== Statistics =====================

  async getStatistics(tableId: string): Promise<{
    totalEvaluations: number;
    avgEvaluationTime: number;
    ruleHitCounts: Record<string, number>;
  }> {
    const table = await this.findTable(tableId);

    // Get total evaluations and avg time
    const statsResult = await this.evaluationRepository
      .createQueryBuilder('e')
      .select('COUNT(*)', 'total')
      .addSelect('AVG(e.evaluationTimeMs)', 'avgTime')
      .where('e.decisionTableId = :tableId', { tableId })
      .getRawOne();

    // Calculate rule hit counts from recent evaluations
    const recentEvaluations = await this.evaluationRepository.find({
      where: { decisionTableId: tableId },
      order: { createdAt: 'DESC' },
      take: 1000,
    });

    const ruleHitCounts: Record<string, number> = {};
    for (const rule of table.rules) {
      ruleHitCounts[rule.id] = 0;
    }

    for (const evaluation of recentEvaluations) {
      for (const result of evaluation.matchedRules) {
        if (result.matched && ruleHitCounts[result.ruleId] !== undefined) {
          ruleHitCounts[result.ruleId]++;
        }
      }
    }

    return {
      totalEvaluations: parseInt(statsResult.total, 10) || 0,
      avgEvaluationTime: parseFloat(statsResult.avgTime) || 0,
      ruleHitCounts,
    };
  }

  // ===================== Copy/Clone =====================

  async cloneTable(id: string, newName: string, userId: string): Promise<DecisionTable> {
    const source = await this.findTable(id);

    const clone = this.tableRepository.create({
      workspaceId: source.workspaceId,
      name: newName,
      description: source.description,
      hitPolicy: source.hitPolicy,
      inputColumns: [...source.inputColumns],
      outputColumns: [...source.outputColumns],
      rules: source.rules.map((r) => ({ ...r, id: this.generateRuleId() })),
      createdById: userId,
      version: 1,
    });

    return this.tableRepository.save(clone);
  }

  private generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
