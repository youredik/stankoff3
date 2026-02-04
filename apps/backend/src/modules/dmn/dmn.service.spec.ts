import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DmnService } from './dmn.service';
import { DmnEvaluatorService } from './dmn-evaluator.service';
import { DecisionTable } from './entities/decision-table.entity';
import { DecisionEvaluation } from './entities/decision-evaluation.entity';

describe('DmnService', () => {
  let service: DmnService;
  let tableRepository: jest.Mocked<Repository<DecisionTable>>;
  let evaluationRepository: jest.Mocked<Repository<DecisionEvaluation>>;
  let evaluator: jest.Mocked<DmnEvaluatorService>;

  const mockTable: DecisionTable = {
    id: 'table-1',
    workspaceId: 'ws-1',
    name: 'Test Table',
    description: 'Test description',
    hitPolicy: 'FIRST',
    inputColumns: [
      { id: 'input1', name: 'priority', label: 'Priority', type: 'string' },
    ],
    outputColumns: [
      { id: 'output1', name: 'discount', label: 'Discount', type: 'number', defaultValue: 0 },
    ],
    rules: [
      {
        id: 'rule1',
        inputs: { input1: { operator: 'eq', value: 'high' } },
        outputs: { output1: 10 },
      },
    ],
    isActive: true,
    version: 1,
    createdById: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null as any,
    workspace: null as any,
    evaluations: [],
  };

  const mockEvaluation: DecisionEvaluation = {
    id: 'eval-1',
    decisionTableId: 'table-1',
    decisionTable: mockTable,
    targetType: 'entity',
    targetId: 'entity-1',
    inputData: { priority: 'high' },
    outputData: { discount: 10 },
    matchedRules: [{ ruleId: 'rule1', outputs: { discount: 10 }, matched: true }],
    evaluationTimeMs: 5,
    triggeredBy: 'api',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockTableRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const mockEvaluationRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockEvaluator = {
      evaluate: jest.fn(),
      validateTable: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmnService,
        { provide: getRepositoryToken(DecisionTable), useValue: mockTableRepo },
        { provide: getRepositoryToken(DecisionEvaluation), useValue: mockEvaluationRepo },
        { provide: DmnEvaluatorService, useValue: mockEvaluator },
      ],
    }).compile();

    service = module.get<DmnService>(DmnService);
    tableRepository = module.get(getRepositoryToken(DecisionTable));
    evaluationRepository = module.get(getRepositoryToken(DecisionEvaluation));
    evaluator = module.get(DmnEvaluatorService);
  });

  describe('createTable', () => {
    it('should create and save a new decision table', async () => {
      const dto = {
        workspaceId: 'ws-1',
        name: 'New Table',
        inputColumns: mockTable.inputColumns,
        outputColumns: mockTable.outputColumns,
      };

      evaluator.validateTable.mockReturnValue([]);
      tableRepository.create.mockReturnValue({ ...mockTable, ...dto } as DecisionTable);
      tableRepository.save.mockResolvedValue({ ...mockTable, ...dto } as DecisionTable);

      const result = await service.createTable(dto, 'user-1');

      expect(evaluator.validateTable).toHaveBeenCalled();
      expect(tableRepository.create).toHaveBeenCalledWith({
        ...dto,
        createdById: 'user-1',
        version: 1,
      });
      expect(result.name).toBe('New Table');
    });

    it('should throw BadRequestException when validation fails', async () => {
      const dto = {
        workspaceId: 'ws-1',
        name: '',
        inputColumns: [],
        outputColumns: [],
      };

      evaluator.validateTable.mockReturnValue(['Table name is required']);

      await expect(service.createTable(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findTables', () => {
    it('should return tables for workspace', async () => {
      tableRepository.find.mockResolvedValue([mockTable]);

      const result = await service.findTables('ws-1');

      expect(tableRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        order: { name: 'ASC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('findTable', () => {
    it('should return table by id', async () => {
      tableRepository.findOne.mockResolvedValue(mockTable);

      const result = await service.findTable('table-1');

      expect(result).toEqual(mockTable);
    });

    it('should throw NotFoundException when table not found', async () => {
      tableRepository.findOne.mockResolvedValue(null);

      await expect(service.findTable('table-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTable', () => {
    it('should update and save table', async () => {
      const tableCopy = { ...mockTable, rules: [...mockTable.rules] };
      tableRepository.findOne.mockResolvedValue(tableCopy);
      evaluator.validateTable.mockReturnValue([]);
      tableRepository.save.mockResolvedValue({ ...tableCopy, name: 'Updated Table' });

      const result = await service.updateTable('table-1', { name: 'Updated Table' });

      expect(result.name).toBe('Updated Table');
    });

    it('should increment version when rules are updated', async () => {
      const tableCopy = { ...mockTable, rules: [...mockTable.rules] };
      tableRepository.findOne.mockResolvedValue(tableCopy);
      evaluator.validateTable.mockReturnValue([]);
      tableRepository.save.mockImplementation((t) => Promise.resolve(t as DecisionTable));

      await service.updateTable('table-1', {
        rules: [{ id: 'rule2', inputs: {}, outputs: {} }],
      });

      expect(tableRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ version: 2 }),
      );
    });
  });

  describe('deleteTable', () => {
    it('should remove table', async () => {
      tableRepository.findOne.mockResolvedValue(mockTable);

      await service.deleteTable('table-1');

      expect(tableRepository.remove).toHaveBeenCalledWith(mockTable);
    });
  });

  describe('evaluate', () => {
    it('should evaluate table and log result', async () => {
      const evaluationOutput = {
        results: [{ ruleId: 'rule1', outputs: { discount: 10 }, matched: true }],
        finalOutput: { discount: 10 },
        matchedCount: 1,
        evaluationTimeMs: 5,
      };

      tableRepository.findOne.mockResolvedValue(mockTable);
      evaluator.evaluate.mockReturnValue(evaluationOutput);
      evaluationRepository.create.mockReturnValue(mockEvaluation);
      evaluationRepository.save.mockResolvedValue(mockEvaluation);

      const result = await service.evaluate({
        decisionTableId: 'table-1',
        inputData: { priority: 'high' },
      });

      expect(evaluator.evaluate).toHaveBeenCalledWith(mockTable, { priority: 'high' });
      expect(evaluationRepository.save).toHaveBeenCalled();
      expect(result.output.matchedCount).toBe(1);
    });

    it('should throw BadRequestException when table is not active', async () => {
      tableRepository.findOne.mockResolvedValue({ ...mockTable, isActive: false });

      await expect(
        service.evaluate({
          decisionTableId: 'table-1',
          inputData: {},
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('evaluateQuick', () => {
    it('should evaluate without logging', async () => {
      const evaluationOutput = {
        results: [],
        finalOutput: { discount: 10 },
        matchedCount: 1,
        evaluationTimeMs: 2,
      };

      tableRepository.findOne.mockResolvedValue(mockTable);
      evaluator.evaluate.mockReturnValue(evaluationOutput);

      const result = await service.evaluateQuick('table-1', { priority: 'high' });

      expect(result).toEqual({ discount: 10 });
      expect(evaluationRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('evaluateByName', () => {
    it('should find table by name and evaluate', async () => {
      const evaluationOutput = {
        results: [],
        finalOutput: { discount: 5 },
        matchedCount: 1,
        evaluationTimeMs: 3,
      };

      tableRepository.findOne.mockResolvedValue(mockTable);
      evaluator.evaluate.mockReturnValue(evaluationOutput);

      const result = await service.evaluateByName('ws-1', 'Test Table', { priority: 'low' });

      expect(tableRepository.findOne).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', name: 'Test Table', isActive: true },
      });
      expect(result).toEqual({ discount: 5 });
    });

    it('should throw NotFoundException when table not found by name', async () => {
      tableRepository.findOne.mockResolvedValue(null);

      await expect(
        service.evaluateByName('ws-1', 'Unknown', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEvaluations', () => {
    it('should return paginated evaluations', async () => {
      evaluationRepository.findAndCount.mockResolvedValue([[mockEvaluation], 1]);

      const result = await service.getEvaluations('table-1', { limit: 10, offset: 0 });

      expect(result.evaluations).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getTargetEvaluations', () => {
    it('should return evaluations for target', async () => {
      evaluationRepository.find.mockResolvedValue([mockEvaluation]);

      const result = await service.getTargetEvaluations('entity', 'entity-1');

      expect(evaluationRepository.find).toHaveBeenCalledWith({
        where: { targetType: 'entity', targetId: 'entity-1' },
        relations: ['decisionTable'],
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics for table', async () => {
      tableRepository.findOne.mockResolvedValue(mockTable);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '100', avgTime: '5.5' }),
      };
      evaluationRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);
      evaluationRepository.find.mockResolvedValue([mockEvaluation]);

      const result = await service.getStatistics('table-1');

      expect(result.totalEvaluations).toBe(100);
      expect(result.avgEvaluationTime).toBeCloseTo(5.5);
      expect(result.ruleHitCounts).toHaveProperty('rule1');
    });
  });

  describe('cloneTable', () => {
    it('should create a copy of existing table', async () => {
      tableRepository.findOne.mockResolvedValue(mockTable);
      tableRepository.create.mockImplementation((data) => data as DecisionTable);
      tableRepository.save.mockImplementation((t) => Promise.resolve({ ...t, id: 'table-2' } as DecisionTable));

      const result = await service.cloneTable('table-1', 'Cloned Table', 'user-2');

      expect(result.name).toBe('Cloned Table');
      expect(result.createdById).toBe('user-2');
      expect(result.version).toBe(1);
      expect(result.workspaceId).toBe('ws-1');
    });
  });
});
