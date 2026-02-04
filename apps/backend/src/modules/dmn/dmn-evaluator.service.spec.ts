import { DmnEvaluatorService } from './dmn-evaluator.service';
import { DecisionTable, InputColumn, OutputColumn, DecisionRule } from './entities/decision-table.entity';

describe('DmnEvaluatorService', () => {
  let service: DmnEvaluatorService;

  const createTable = (
    rules: DecisionRule[],
    hitPolicy: 'UNIQUE' | 'FIRST' | 'ANY' | 'COLLECT' | 'RULE_ORDER' = 'FIRST',
  ): DecisionTable => ({
    id: 'table-1',
    workspaceId: 'ws-1',
    name: 'Test Table',
    description: 'Test',
    hitPolicy,
    inputColumns: [
      { id: 'input1', name: 'priority', label: 'Priority', type: 'string' },
      { id: 'input2', name: 'amount', label: 'Amount', type: 'number' },
    ],
    outputColumns: [
      { id: 'output1', name: 'discount', label: 'Discount', type: 'number', defaultValue: 0 },
      { id: 'output2', name: 'message', label: 'Message', type: 'string', defaultValue: 'No discount' },
    ],
    rules,
    isActive: true,
    version: 1,
    createdById: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null as any,
    workspace: null as any,
    evaluations: [],
  });

  beforeEach(() => {
    service = new DmnEvaluatorService();
  });

  describe('evaluate', () => {
    it('should match rule with eq operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'eq', value: 'high' },
            input2: { operator: 'any', value: null },
          },
          outputs: { output1: 10, output2: 'High priority discount' },
        },
      ]);

      const result = service.evaluate(table, { priority: 'high', amount: 100 });

      expect(result.matchedCount).toBe(1);
      expect(result.finalOutput.discount).toBe(10);
      expect(result.finalOutput.message).toBe('High priority discount');
    });

    it('should match rule with case-insensitive string comparison', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'eq', value: 'HIGH' },
          },
          outputs: { output1: 10 },
        },
      ]);

      const result = service.evaluate(table, { priority: 'high' });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with neq operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'neq', value: 'low' },
          },
          outputs: { output1: 5 },
        },
      ]);

      const result = service.evaluate(table, { priority: 'high' });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with gt operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input2: { operator: 'gt', value: 50 },
          },
          outputs: { output1: 10 },
        },
      ]);

      const result = service.evaluate(table, { amount: 100 });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with gte operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input2: { operator: 'gte', value: 100 },
          },
          outputs: { output1: 10 },
        },
      ]);

      const result = service.evaluate(table, { amount: 100 });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with lt operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input2: { operator: 'lt', value: 150 },
          },
          outputs: { output1: 5 },
        },
      ]);

      const result = service.evaluate(table, { amount: 100 });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with lte operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input2: { operator: 'lte', value: 100 },
          },
          outputs: { output1: 5 },
        },
      ]);

      const result = service.evaluate(table, { amount: 100 });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with in operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'in', value: ['high', 'critical'] },
          },
          outputs: { output1: 15 },
        },
      ]);

      const result = service.evaluate(table, { priority: 'high' });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with not_in operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'not_in', value: ['low', 'medium'] },
          },
          outputs: { output1: 10 },
        },
      ]);

      const result = service.evaluate(table, { priority: 'high' });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with contains operator (string)', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'contains', value: 'pri' },
          },
          outputs: { output1: 5 },
        },
      ]);

      const result = service.evaluate(table, { priority: 'high priority' });

      expect(result.matchedCount).toBe(1);
    });

    it('should match rule with between operator', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input2: { operator: 'between', value: 50, value2: 150 },
          },
          outputs: { output1: 10 },
        },
      ]);

      const result = service.evaluate(table, { amount: 100 });

      expect(result.matchedCount).toBe(1);
    });

    it('should not match when between boundary not met', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input2: { operator: 'between', value: 150, value2: 200 },
          },
          outputs: { output1: 10 },
        },
      ]);

      const result = service.evaluate(table, { amount: 100 });

      expect(result.matchedCount).toBe(0);
    });

    it('should return default values when no rules match', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'eq', value: 'critical' },
          },
          outputs: { output1: 20 },
        },
      ]);

      const result = service.evaluate(table, { priority: 'low' });

      expect(result.matchedCount).toBe(0);
      expect(result.finalOutput.discount).toBe(0);
      expect(result.finalOutput.message).toBe('No discount');
    });

    it('should handle null input values', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'eq', value: null },
          },
          outputs: { output1: 0 },
        },
      ]);

      const result = service.evaluate(table, { priority: null });

      expect(result.matchedCount).toBe(1);
    });

    it('should handle missing input values', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: {
            input1: { operator: 'eq', value: 'high' },
          },
          outputs: { output1: 10 },
        },
      ]);

      const result = service.evaluate(table, {});

      expect(result.matchedCount).toBe(0);
    });
  });

  describe('hit policies', () => {
    it('FIRST should return only first matched rule', () => {
      const table = createTable(
        [
          {
            id: 'rule1',
            inputs: { input1: { operator: 'any', value: null } },
            outputs: { output1: 10 },
          },
          {
            id: 'rule2',
            inputs: { input1: { operator: 'any', value: null } },
            outputs: { output1: 20 },
          },
        ],
        'FIRST',
      );

      const result = service.evaluate(table, { priority: 'high' });

      expect(result.matchedCount).toBe(2);
      expect(result.finalOutput.discount).toBe(10);
    });

    it('UNIQUE should return first match but log warning if multiple', () => {
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

      const table = createTable(
        [
          {
            id: 'rule1',
            inputs: { input1: { operator: 'any', value: null } },
            outputs: { output1: 10 },
          },
          {
            id: 'rule2',
            inputs: { input1: { operator: 'any', value: null } },
            outputs: { output1: 20 },
          },
        ],
        'UNIQUE',
      );

      const result = service.evaluate(table, { priority: 'high' });

      expect(result.finalOutput.discount).toBe(10);
      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('UNIQUE hit policy violated'));
    });

    it('COLLECT should return array of all matched outputs', () => {
      const table = createTable(
        [
          {
            id: 'rule1',
            inputs: { input1: { operator: 'any', value: null } },
            outputs: { output1: 10 },
          },
          {
            id: 'rule2',
            inputs: { input1: { operator: 'any', value: null } },
            outputs: { output1: 20 },
          },
        ],
        'COLLECT',
      );

      const result = service.evaluate(table, { priority: 'high' });

      expect(result.finalOutput.discount).toEqual([10, 20]);
    });

    it('RULE_ORDER should return all outputs in order', () => {
      const table = createTable(
        [
          {
            id: 'rule1',
            inputs: { input1: { operator: 'any', value: null } },
            outputs: { output1: 5 },
          },
          {
            id: 'rule2',
            inputs: { input1: { operator: 'any', value: null } },
            outputs: { output1: 15 },
          },
        ],
        'RULE_ORDER',
      );

      const result = service.evaluate(table, { priority: 'high' });

      expect(result.finalOutput.discount).toEqual([5, 15]);
    });
  });

  describe('validateTable', () => {
    it('should return empty array for valid table', () => {
      const table = createTable([]);

      const errors = service.validateTable(table);

      expect(errors).toHaveLength(0);
    });

    it('should return error when name is missing', () => {
      const table = createTable([]);
      table.name = '';

      const errors = service.validateTable(table);

      expect(errors).toContain('Table name is required');
    });

    it('should return error when no input columns', () => {
      const table = createTable([]);
      table.inputColumns = [];

      const errors = service.validateTable(table);

      expect(errors).toContain('At least one input column is required');
    });

    it('should return error when no output columns', () => {
      const table = createTable([]);
      table.outputColumns = [];

      const errors = service.validateTable(table);

      expect(errors).toContain('At least one output column is required');
    });

    it('should return error for duplicate column ids', () => {
      const table = createTable([]);
      table.inputColumns = [
        { id: 'dup', name: 'a', label: 'A', type: 'string' },
        { id: 'dup', name: 'b', label: 'B', type: 'string' },
      ];

      const errors = service.validateTable(table);

      expect(errors).toContain('Duplicate input column id: dup');
    });

    it('should return error when rule references unknown column', () => {
      const table = createTable([
        {
          id: 'rule1',
          inputs: { unknown_input: { operator: 'eq', value: 'test' } },
          outputs: { output1: 10 },
        },
      ]);

      const errors = service.validateTable(table);

      expect(errors).toContain('Rule rule1 references unknown input: unknown_input');
    });
  });

  describe('performance', () => {
    it('should evaluate within reasonable time', () => {
      const rules: DecisionRule[] = [];
      for (let i = 0; i < 100; i++) {
        rules.push({
          id: `rule${i}`,
          inputs: {
            input1: { operator: 'eq', value: `value${i}` },
            input2: { operator: 'gt', value: i * 10 },
          },
          outputs: { output1: i, output2: `Result ${i}` },
        });
      }

      const table = createTable(rules);
      const result = service.evaluate(table, { priority: 'value50', amount: 1000 });

      expect(result.evaluationTimeMs).toBeLessThan(100);
    });
  });
});
