import { extractJson } from './extract-json';

describe('extractJson', () => {
  it('должен вернуть обычный JSON без изменений', () => {
    const json = '{"category":"technical_support","priority":"high"}';
    expect(extractJson(json)).toBe(json);
  });

  it('должен убрать обёртку ```json ... ```', () => {
    const input = '```json\n{"category":"technical_support","priority":"high"}\n```';
    expect(extractJson(input)).toBe('{"category":"technical_support","priority":"high"}');
  });

  it('должен убрать обёртку ``` ... ``` без указания языка', () => {
    const input = '```\n{"label":"neutral","score":0.5}\n```';
    expect(extractJson(input)).toBe('{"label":"neutral","score":0.5}');
  });

  it('должен обработать JSON с переносами строк внутри', () => {
    const json = '{\n  "category": "other",\n  "skills": ["mechanical"]\n}';
    const input = '```json\n' + json + '\n```';
    expect(extractJson(input)).toBe(json);
  });

  it('должен обрезать пробелы и переносы', () => {
    const input = '  \n ```json\n{"ok":true}\n```  \n ';
    expect(extractJson(input)).toBe('{"ok":true}');
  });

  it('должен вернуть пустую строку без изменений', () => {
    expect(extractJson('')).toBe('');
  });

  it('должен вернуть невалидный текст без изменений', () => {
    expect(extractJson('some text')).toBe('some text');
  });

  it('должен обработать JSON с ```json без пробела', () => {
    const input = '```json\n{"label":"urgent"}\n```';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ label: 'urgent' });
  });
});
