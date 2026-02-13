import { extractMentionedUserIds } from './parse-mentions';

describe('extractMentionedUserIds', () => {
  it('should return empty array for empty/null input', () => {
    expect(extractMentionedUserIds('')).toEqual([]);
    expect(extractMentionedUserIds(null as any)).toEqual([]);
    expect(extractMentionedUserIds(undefined as any)).toEqual([]);
  });

  it('should extract a single mention', () => {
    const html = '<p>Hello <span data-type="mention" data-id="550e8400-e29b-41d4-a716-446655440000" data-label="John">@John</span></p>';
    expect(extractMentionedUserIds(html)).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
  });

  it('should extract multiple mentions', () => {
    const html = '<p><span data-type="mention" data-id="550e8400-e29b-41d4-a716-446655440000">@John</span> and <span data-type="mention" data-id="660e8400-e29b-41d4-a716-446655440001">@Jane</span></p>';
    const result = extractMentionedUserIds(html);
    expect(result).toEqual([
      '550e8400-e29b-41d4-a716-446655440000',
      '660e8400-e29b-41d4-a716-446655440001',
    ]);
  });

  it('should deduplicate mentions', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const html = `<p><span data-type="mention" data-id="${id}">@John</span> said <span data-type="mention" data-id="${id}">@John</span></p>`;
    expect(extractMentionedUserIds(html)).toEqual([id]);
  });

  it('should ignore non-UUID IDs', () => {
    const html = '<p><span data-type="mention" data-id="not-a-uuid">@Invalid</span></p>';
    expect(extractMentionedUserIds(html)).toEqual([]);
  });

  it('should handle plain text without mentions', () => {
    expect(extractMentionedUserIds('<p>Just some text</p>')).toEqual([]);
  });

  it('should handle data-id before data-type (attribute order)', () => {
    const html = '<span data-id="550e8400-e29b-41d4-a716-446655440000" data-type="mention">@John</span>';
    // regex requires data-type first, so this should not match — intentional design
    expect(extractMentionedUserIds(html)).toEqual([]);
  });
});
