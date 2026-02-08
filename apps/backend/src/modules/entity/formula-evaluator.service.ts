import { Injectable, Logger } from '@nestjs/common';

/**
 * Безопасный парсер формул для вычисляемых полей (серверная версия).
 * Tokenizer → AST → Evaluator (без eval).
 *
 * Поддержка:
 * - Арифметика: +, -, *, /, ()
 * - Ссылки на поля: {fieldId}
 * - Строковая конкатенация: "строка" + {field}
 * - Функции: round(), ceil(), floor(), min(), max(), sum(), abs()
 * - Числовые литералы: 42, 3.14
 * - Строковые литералы: "hello", 'world'
 */

// ==================== Types ====================

interface FieldRule {
  id: string;
  type: string;
  condition?: { fieldId?: string; operator?: string; value?: any };
  action?: Record<string, any>;
}

interface FieldDefinition {
  id: string;
  name: string;
  type: string;
  rules?: FieldRule[];
}

interface WorkspaceSection {
  fields: FieldDefinition[];
}

// ==================== Tokenizer ====================

type TokenType =
  | 'number'
  | 'string'
  | 'field_ref'
  | 'op'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'func'
  | 'eof';

interface Token {
  type: TokenType;
  value: string | number;
}

const FUNCTIONS = ['round', 'ceil', 'floor', 'min', 'max', 'sum', 'abs'];

class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) { i++; continue; }

    if (/\d/.test(ch) || (ch === '.' && i + 1 < input.length && /\d/.test(input[i + 1]))) {
      let num = '';
      while (i < input.length && (/\d/.test(input[i]) || input[i] === '.')) {
        num += input[i++];
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) i++;
        str += input[i++];
      }
      if (i < input.length) i++;
      tokens.push({ type: 'string', value: str });
      continue;
    }

    if (ch === '{') {
      i++;
      let ref = '';
      while (i < input.length && input[i] !== '}') {
        ref += input[i++];
      }
      if (i < input.length) i++;
      tokens.push({ type: 'field_ref', value: ref.trim() });
      continue;
    }

    if ('+-*/'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue; }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z_0-9]/.test(input[i])) {
        ident += input[i++];
      }
      if (FUNCTIONS.includes(ident.toLowerCase())) {
        tokens.push({ type: 'func', value: ident.toLowerCase() });
      } else {
        throw new FormulaError(`Неизвестная функция: ${ident}`);
      }
      continue;
    }

    throw new FormulaError(`Неожиданный символ: ${ch}`);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

// ==================== AST ====================

type AstNode =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'field_ref'; fieldId: string }
  | { type: 'binary'; op: string; left: AstNode; right: AstNode }
  | { type: 'unary'; op: string; operand: AstNode }
  | { type: 'func_call'; name: string; args: AstNode[] };

// ==================== Parser ====================

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token { return this.tokens[this.pos]; }

  private consume(expected?: TokenType): Token {
    const token = this.tokens[this.pos++];
    if (expected && token.type !== expected) {
      throw new FormulaError(`Ожидалось ${expected}, получено ${token.type}`);
    }
    return token;
  }

  parse(): AstNode {
    const node = this.parseExpression();
    if (this.peek().type !== 'eof') {
      throw new FormulaError('Неожиданные символы после выражения');
    }
    return node;
  }

  private parseExpression(): AstNode {
    let node = this.parseTerm();
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value as string;
      const right = this.parseTerm();
      node = { type: 'binary', op, left: node, right };
    }
    return node;
  }

  private parseTerm(): AstNode {
    let node = this.parseUnary();
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value as string;
      const right = this.parseUnary();
      node = { type: 'binary', op, left: node, right };
    }
    return node;
  }

  private parseUnary(): AstNode {
    if (this.peek().type === 'op' && this.peek().value === '-') {
      this.consume();
      const operand = this.parseUnary();
      return { type: 'unary', op: '-', operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (token.type === 'number') { this.consume(); return { type: 'number', value: token.value as number }; }
    if (token.type === 'string') { this.consume(); return { type: 'string', value: token.value as string }; }
    if (token.type === 'field_ref') { this.consume(); return { type: 'field_ref', fieldId: token.value as string }; }
    if (token.type === 'func') {
      const name = token.value as string;
      this.consume();
      this.consume('lparen');
      const args: AstNode[] = [];
      if (this.peek().type !== 'rparen') {
        args.push(this.parseExpression());
        while (this.peek().type === 'comma') {
          this.consume();
          args.push(this.parseExpression());
        }
      }
      this.consume('rparen');
      return { type: 'func_call', name, args };
    }
    if (token.type === 'lparen') {
      this.consume();
      const node = this.parseExpression();
      this.consume('rparen');
      return node;
    }
    throw new FormulaError(`Неожиданный токен: ${token.type} (${token.value})`);
  }
}

// ==================== Evaluator ====================

function evaluate(node: AstNode, data: Record<string, any>): number | string | null {
  switch (node.type) {
    case 'number': return node.value;
    case 'string': return node.value;

    case 'field_ref': {
      const val = data[node.fieldId];
      if (val === undefined || val === null || val === '') return null;
      const num = Number(val);
      return isNaN(num) ? String(val) : num;
    }

    case 'unary': {
      const operand = evaluate(node.operand, data);
      if (operand === null || typeof operand !== 'number') return null;
      return -operand;
    }

    case 'binary': {
      const left = evaluate(node.left, data);
      const right = evaluate(node.right, data);
      if (left === null || right === null) return null;

      if (node.op === '+' && (typeof left === 'string' || typeof right === 'string')) {
        return String(left) + String(right);
      }

      if (typeof left !== 'number' || typeof right !== 'number') return null;
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right === 0 ? null : left / right;
        default: return null;
      }
    }

    case 'func_call': {
      const args = node.args.map((a) => evaluate(a, data));
      switch (node.name) {
        case 'round': {
          if (args[0] === null || typeof args[0] !== 'number') return null;
          const decimals = (args[1] !== null && typeof args[1] === 'number') ? args[1] : 0;
          const factor = Math.pow(10, decimals);
          return Math.round(args[0] * factor) / factor;
        }
        case 'ceil': return (args[0] !== null && typeof args[0] === 'number') ? Math.ceil(args[0]) : null;
        case 'floor': return (args[0] !== null && typeof args[0] === 'number') ? Math.floor(args[0]) : null;
        case 'abs': return (args[0] !== null && typeof args[0] === 'number') ? Math.abs(args[0]) : null;
        case 'min': { const n = args.filter((a): a is number => typeof a === 'number'); return n.length > 0 ? Math.min(...n) : null; }
        case 'max': { const n = args.filter((a): a is number => typeof a === 'number'); return n.length > 0 ? Math.max(...n) : null; }
        case 'sum': { const n = args.filter((a): a is number => typeof a === 'number'); return n.length > 0 ? n.reduce((a, b) => a + b, 0) : null; }
        default: return null;
      }
    }
  }
}

// ==================== Service ====================

@Injectable()
export class FormulaEvaluatorService {
  private readonly logger = new Logger(FormulaEvaluatorService.name);

  /**
   * Вычисляет формулу с подстановкой значений.
   */
  evaluateFormula(formula: string, data: Record<string, any>): number | string | null {
    if (!formula || !formula.trim()) return null;
    const tokens = tokenize(formula);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    return evaluate(ast, data);
  }

  /**
   * Пересчитывает все computed поля в data на основании правил из workspace sections.
   * Возвращает новый объект data с вычисленными значениями.
   */
  computeFields(
    data: Record<string, any>,
    sections: WorkspaceSection[],
  ): Record<string, any> {
    const fields = sections.flatMap((s) => s.fields);
    const computedFields = fields.filter((f) =>
      (f.rules || []).some((r) => r.type === 'computed'),
    );

    if (computedFields.length === 0) return data;

    const result = { ...data };

    for (const field of computedFields) {
      const computedRules = (field.rules || []).filter((r) => r.type === 'computed');

      for (const rule of computedRules) {
        // Проверяем условие если оно задано
        if (rule.condition?.fieldId) {
          const match = this.evaluateCondition(rule.condition, result);
          if (!match) continue;
        }

        const formula = rule.action?.formula;
        if (!formula) continue;

        try {
          const value = this.evaluateFormula(formula, result);
          result[field.id] = value;
        } catch (err) {
          this.logger.warn(`Formula error for field ${field.id}: ${(err as Error).message}`);
          // Не перезаписываем значение при ошибке
        }
        break; // Первое подошедшее правило
      }
    }

    return result;
  }

  private evaluateCondition(
    condition: { fieldId?: string; operator?: string; value?: any },
    data: Record<string, any>,
  ): boolean {
    if (!condition.fieldId) return true;

    const fieldValue = data[condition.fieldId];
    const compareValue = condition.value;

    switch (condition.operator) {
      case 'eq': return fieldValue == compareValue;
      case 'neq': return fieldValue != compareValue;
      case 'gt': return Number(fieldValue) > Number(compareValue);
      case 'lt': return Number(fieldValue) < Number(compareValue);
      case 'gte': return Number(fieldValue) >= Number(compareValue);
      case 'lte': return Number(fieldValue) <= Number(compareValue);
      case 'is_empty':
        return fieldValue === null || fieldValue === undefined || fieldValue === '' ||
          (Array.isArray(fieldValue) && fieldValue.length === 0);
      case 'is_not_empty':
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== '' &&
          !(Array.isArray(fieldValue) && fieldValue.length === 0);
      case 'in':
        return Array.isArray(compareValue) ? compareValue.includes(fieldValue) : false;
      case 'not_in':
        return Array.isArray(compareValue) ? !compareValue.includes(fieldValue) : true;
      case 'contains':
        if (typeof fieldValue === 'string' && typeof compareValue === 'string') {
          return fieldValue.toLowerCase().includes(compareValue.toLowerCase());
        }
        if (Array.isArray(fieldValue)) return fieldValue.includes(compareValue);
        return false;
      default: return false;
    }
  }
}
