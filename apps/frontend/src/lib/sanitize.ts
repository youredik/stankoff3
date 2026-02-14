import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Uses DOMPurify to remove dangerous tags/attributes while preserving safe HTML.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del',
      'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'span', 'div', 'img', 'hr', 'table', 'thead', 'tbody',
      'tr', 'th', 'td', 'sup', 'sub',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'class', 'style', 'data-type',
      'data-id', 'data-label', 'src', 'alt', 'width', 'height',
      'colspan', 'rowspan',
    ],
    ALLOW_DATA_ATTR: true,
  });
}
