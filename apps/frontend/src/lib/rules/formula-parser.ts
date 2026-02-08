/**
 * Безопасный парсер формул для вычисляемых полей.
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

// ==================== Tokenizer ====================

type TokenType =
  | 'number'
  | 'string'
  | 'field_ref'   // {fieldId}
  | 'op'          // + - * /
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'func'        // round, ceil, floor, min, max, sum, abs
  | 'eof';

interface Token {
  type: TokenType;
  value: string | number;
}

const FUNCTIONS = ['round', 'ceil', 'floor', 'min', 'max', 'sum', 'abs'];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Пробелы
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Числа
    if (/\d/.test(ch) || (ch === '.' && i + 1 < input.length && /\d/.test(input[i + 1]))) {
      let num = '';
      while (i < input.length && (/\d/.test(input[i]) || input[i] === '.')) {
        num += input[i++];
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    // Строки
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      let str = '';
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
        }
        str += input[i++];
      }
      if (i < input.length) i++; // skip closing quote
      tokens.push({ type: 'string', value: str });
      continue;
    }

    // Ссылки на поля: {fieldId}
    if (ch === '{') {
      i++;
      let ref = '';
      while (i < input.length && input[i] !== '}') {
        ref += input[i++];
      }
      if (i < input.length) i++; // skip }
      tokens.push({ type: 'field_ref', value: ref.trim() });
      continue;
    }

    // Операторы
    if ('+-*/'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    // Скобки
    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue; }

    // Идентификаторы (функции)
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

// ==================== Parser (Recursive Descent) ====================

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

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

  // expression = term ((+|-) term)*
  private parseExpression(): AstNode {
    let node = this.parseTerm();

    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value as string;
      const right = this.parseTerm();
      node = { type: 'binary', op, left: node, right };
    }

    return node;
  }

  // term = unary ((*|/) unary)*
  private parseTerm(): AstNode {
    let node = this.parseUnary();

    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.consume().value as string;
      const right = this.parseUnary();
      node = { type: 'binary', op, left: node, right };
    }

    return node;
  }

  // unary = (-) unary | primary
  private parseUnary(): AstNode {
    if (this.peek().type === 'op' && this.peek().value === '-') {
      this.consume();
      const operand = this.parseUnary();
      return { type: 'unary', op: '-', operand };
    }
    return this.parsePrimary();
  }

  // primary = number | string | field_ref | func(args) | (expression)
  private parsePrimary(): AstNode {
    const token = this.peek();

    if (token.type === 'number') {
      this.consume();
      return { type: 'number', value: token.value as number };
    }

    if (token.type === 'string') {
      this.consume();
      return { type: 'string', value: token.value as string };
    }

    if (token.type === 'field_ref') {
      this.consume();
      return { type: 'field_ref', fieldId: token.value as string };
    }

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
    case 'number':
      return node.value;

    case 'string':
      return node.value;

    case 'field_ref': {
      const val = data[node.fieldId];
      if (val === undefined || val === null || val === '') return null;
      const num = Number(val);
      return isNaN(num) ? String(val) : num;
    }

    case 'unary': {
      const operand = evaluate(node.operand, data);
      if (operand === null) return null;
      if (typeof operand !== 'number') return null;
      return -operand;
    }

    case 'binary': {
      const left = evaluate(node.left, data);
      const right = evaluate(node.right, data);

      if (left === null || right === null) return null;

      // Конкатенация строк
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
        case 'ceil': {
          if (args[0] === null || typeof args[0] !== 'number') return null;
          return Math.ceil(args[0]);
        }
        case 'floor': {
          if (args[0] === null || typeof args[0] !== 'number') return null;
          return Math.floor(args[0]);
        }
        case 'abs': {
          if (args[0] === null || typeof args[0] !== 'number') return null;
          return Math.abs(args[0]);
        }
        case 'min': {
          const nums = args.filter((a): a is number => typeof a === 'number');
          return nums.length > 0 ? Math.min(...nums) : null;
        }
        case 'max': {
          const nums = args.filter((a): a is number => typeof a === 'number');
          return nums.length > 0 ? Math.max(...nums) : null;
        }
        case 'sum': {
          const nums = args.filter((a): a is number => typeof a === 'number');
          return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;
        }
        default:
          return null;
      }
    }
  }
}

// ==================== Public API ====================

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

/**
 * Вычисляет формулу с подстановкой значений полей.
 * Возвращает number | string | null.
 *
 * @param formula — строка формулы, напр. "{price} * {quantity}"
 * @param data — значения полей, напр. { price: 100, quantity: 5 }
 */
export function evaluateFormula(
  formula: string,
  data: Record<string, any>,
): number | string | null {
  if (!formula || !formula.trim()) return null;

  const tokens = tokenize(formula);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return evaluate(ast, data);
}

/**
 * Валидирует формулу (проверяет синтаксис без вычисления).
 * Возвращает null если формула корректна, или строку ошибки.
 */
export function validateFormula(formula: string): string | null {
  if (!formula || !formula.trim()) return 'Формула не может быть пустой';

  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens);
    parser.parse();
    return null;
  } catch (e) {
    return e instanceof FormulaError ? e.message : 'Некорректная формула';
  }
}

/**
 * Извлекает ID полей, на которые ссылается формула.
 */
export function extractFieldRefs(formula: string): string[] {
  const refs: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    refs.push(match[1].trim());
  }
  return refs;
}
