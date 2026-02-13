const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extracts mentioned user IDs from Tiptap HTML.
 * Tiptap Mention outputs: <span data-type="mention" data-id="UUID" ...>
 */
export function extractMentionIds(html: string): string[] {
  if (!html) return [];

  const regex = /data-type="mention"[^>]*data-id="([^"]+)"/g;
  const ids: string[] = [];
  let match;

  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    if (UUID_REGEX.test(id) && !ids.includes(id)) {
      ids.push(id);
    }
  }

  return ids;
}
