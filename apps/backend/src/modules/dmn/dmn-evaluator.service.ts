import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionTable,
  DecisionRule,
  RuleCondition,
  HitPolicy,
} from './entities/decision-table.entity';
import { EvaluationResult } from './entities/decision-evaluation.entity';

export interface EvaluationOutput {
  results: EvaluationResult[];
  finalOutput: Record<string, unknown>;
  matchedCount: number;
  evaluationTimeMs: number;
}

@Injectable()
export class DmnEvaluatorService {
  private readonly logger = new Logger(DmnEvaluatorService.name);

  /**
   * Evaluate a decision table against input data
   */
  evaluate(
    table: DecisionTable,
    inputData: Record<string, unknown>,
  ): EvaluationOutput {
    const startTime = Date.now();
    const results: EvaluationResult[] = [];

    // Build mapping from column ID to column name
    const columnIdToName = new Map<string, string>();
    for (const col of table.inputColumns) {
      columnIdToName.set(col.id, col.name);
    }

    // Evaluate each rule
    for (const rule of table.rules) {
      const matched = this.evaluateRule(rule, inputData, columnIdToName);
      const outputs = matched ? this.extractOutputs(rule, table) : {};

      results.push({
        ruleId: rule.id,
        outputs,
        matched,
      });
    }

    // Apply hit policy to determine final output
    const finalOutput = this.applyHitPolicy(table.hitPolicy, results, table);
    const evaluationTimeMs = Date.now() - startTime;

    return {
      results,
      finalOutput,
      matchedCount: results.filter((r) => r.matched).length,
      evaluationTimeMs,
    };
  }

  /**
   * Evaluate a single rule against input data
   */
  private evaluateRule(
    rule: DecisionRule,
    inputData: Record<string, unknown>,
    columnIdToName: Map<string, string>,
  ): boolean {
    for (const [columnId, condition] of Object.entries(rule.inputs)) {
      // Get the column name from the ID, then look up the input value
      const columnName = columnIdToName.get(columnId) || columnId;
      const inputValue = inputData[columnName];

      if (!this.evaluateCondition(condition, inputValue)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a condition against an input value
   */
  private evaluateCondition(
    condition: RuleCondition,
    inputValue: unknown,
  ): boolean {
    const { operator, value, value2 } = condition;

    // 'any' operator matches everything
    if (operator === 'any') {
      return true;
    }

    // Handle null/undefined input
    if (inputValue === null || inputValue === undefined) {
      return operator === 'eq' && (value === null || value === undefined);
    }

    switch (operator) {
      case 'eq':
        return this.compareEqual(inputValue, value);

      case 'neq':
        return !this.compareEqual(inputValue, value);

      case 'gt':
        return this.compareNumeric(inputValue, value, (a, b) => a > b);

      case 'gte':
        return this.compareNumeric(inputValue, value, (a, b) => a >= b);

      case 'lt':
        return this.compareNumeric(inputValue, value, (a, b) => a < b);

      case 'lte':
        return this.compareNumeric(inputValue, value, (a, b) => a <= b);

      case 'in':
        return Array.isArray(value) && value.includes(inputValue);

      case 'not_in':
        return Array.isArray(value) && !value.includes(inputValue);

      case 'contains':
        return this.evaluateContains(inputValue, value);

      case 'between':
        return this.evaluateBetween(inputValue, value, value2);

      default:
        this.logger.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  /**
   * Compare two values for equality
   */
  private compareEqual(a: unknown, b: unknown): boolean {
    if (typeof a === 'string' && typeof b === 'string') {
      return a.toLowerCase() === b.toLowerCase();
    }
    return a === b;
  }

  /**
   * Compare two numeric values
   */
  private compareNumeric(
    a: unknown,
    b: unknown,
    comparator: (a: number, b: number) => boolean,
  ): boolean {
    const numA = this.toNumber(a);
    const numB = this.toNumber(b);

    if (numA === null || numB === null) {
      return false;
    }

    return comparator(numA, numB);
  }

  /**
   * Evaluate 'contains' operator
   */
  private evaluateContains(inputValue: unknown, searchValue: unknown): boolean {
    if (typeof inputValue === 'string' && typeof searchValue === 'string') {
      return inputValue.toLowerCase().includes(searchValue.toLowerCase());
    }
    if (Array.isArray(inputValue)) {
      return inputValue.includes(searchValue);
    }
    return false;
  }

  /**
   * Evaluate 'between' operator
   */
  private evaluateBetween(
    inputValue: unknown,
    min: unknown,
    max: unknown,
  ): boolean {
    const num = this.toNumber(inputValue);
    const minNum = this.toNumber(min);
    const maxNum = this.toNumber(max);

    if (num === null || minNum === null || maxNum === null) {
      return false;
    }

    return num >= minNum && num <= maxNum;
  }

  /**
   * Convert value to number
   */
  private toNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  /**
   * Extract outputs from a matched rule
   */
  private extractOutputs(
    rule: DecisionRule,
    table: DecisionTable,
  ): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};

    for (const outputColumn of table.outputColumns) {
      const value = rule.outputs[outputColumn.id];
      outputs[outputColumn.name] = value ?? outputColumn.defaultValue;
    }

    return outputs;
  }

  /**
   * Apply hit policy to determine final output
   */
  private applyHitPolicy(
    hitPolicy: HitPolicy,
    results: EvaluationResult[],
    table: DecisionTable,
  ): Record<string, unknown> {
    const matchedResults = results.filter((r) => r.matched);

    if (matchedResults.length === 0) {
      // Return default values
      const defaults: Record<string, unknown> = {};
      for (const col of table.outputColumns) {
        defaults[col.name] = col.defaultValue;
      }
      return defaults;
    }

    switch (hitPolicy) {
      case 'FIRST':
        // Return first matched rule
        return matchedResults[0].outputs;

      case 'UNIQUE':
        // Should have only one match
        if (matchedResults.length > 1) {
          this.logger.warn(
            `UNIQUE hit policy violated: ${matchedResults.length} rules matched`,
          );
        }
        return matchedResults[0].outputs;

      case 'ANY':
        // All matched rules should produce the same output
        return matchedResults[0].outputs;

      case 'COLLECT':
        // Collect all outputs into arrays
        return this.collectOutputs(matchedResults, table);

      case 'RULE_ORDER':
        // Return all outputs in rule order
        return this.collectOutputs(matchedResults, table);

      default:
        return matchedResults[0].outputs;
    }
  }

  /**
   * Collect outputs from multiple matched rules
   */
  private collectOutputs(
    matchedResults: EvaluationResult[],
    table: DecisionTable,
  ): Record<string, unknown[]> {
    const collected: Record<string, unknown[]> = {};

    for (const col of table.outputColumns) {
      collected[col.name] = [];
    }

    for (const result of matchedResults) {
      for (const col of table.outputColumns) {
        collected[col.name].push(result.outputs[col.name]);
      }
    }

    return collected;
  }

  /**
   * Validate decision table structure
   */
  validateTable(table: Partial<DecisionTable>): string[] {
    const errors: string[] = [];

    if (!table.name?.trim()) {
      errors.push('Table name is required');
    }

    if (!table.inputColumns?.length) {
      errors.push('At least one input column is required');
    }

    if (!table.outputColumns?.length) {
      errors.push('At least one output column is required');
    }

    // Validate input columns
    const inputIds = new Set<string>();
    for (const col of table.inputColumns || []) {
      if (!col.id || !col.name) {
        errors.push('Input column must have id and name');
      }
      if (inputIds.has(col.id)) {
        errors.push(`Duplicate input column id: ${col.id}`);
      }
      inputIds.add(col.id);
    }

    // Validate output columns
    const outputIds = new Set<string>();
    for (const col of table.outputColumns || []) {
      if (!col.id || !col.name) {
        errors.push('Output column must have id and name');
      }
      if (outputIds.has(col.id)) {
        errors.push(`Duplicate output column id: ${col.id}`);
      }
      outputIds.add(col.id);
    }

    // Validate rules
    for (const rule of table.rules || []) {
      if (!rule.id) {
        errors.push('Rule must have an id');
      }

      // Check that rule references valid columns
      for (const inputId of Object.keys(rule.inputs || {})) {
        if (!inputIds.has(inputId)) {
          errors.push(`Rule ${rule.id} references unknown input: ${inputId}`);
        }
      }

      for (const outputId of Object.keys(rule.outputs || {})) {
        if (!outputIds.has(outputId)) {
          errors.push(`Rule ${rule.id} references unknown output: ${outputId}`);
        }
      }
    }

    return errors;
  }
}
