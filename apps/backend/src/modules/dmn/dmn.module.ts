import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DecisionTable } from './entities/decision-table.entity';
import { DecisionEvaluation } from './entities/decision-evaluation.entity';
import { DmnService } from './dmn.service';
import { DmnEvaluatorService } from './dmn-evaluator.service';
import { DmnController } from './dmn.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DecisionTable, DecisionEvaluation]),
  ],
  controllers: [DmnController],
  providers: [DmnService, DmnEvaluatorService],
  exports: [DmnService, DmnEvaluatorService],
})
export class DmnModule {}
