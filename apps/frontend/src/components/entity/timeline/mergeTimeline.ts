import type { Comment, AuditLog } from '@/types';
import type { TimelineItem } from './types';

const DEDUPLICATED_ACTIONS = new Set([
  'comment:created',
  'comment:updated',
]);

export function mergeTimeline(
  comments: Comment[],
  auditLogs: AuditLog[],
): TimelineItem[] {
  const commentIds = new Set(comments.map((c) => c.id));

  const commentItems: TimelineItem[] = comments.map((c) => ({
    id: `comment-${c.id}`,
    type: 'comment' as const,
    timestamp: new Date(c.createdAt),
    comment: c,
  }));

  const auditItems: TimelineItem[] = auditLogs
    .filter((log) => {
      if (
        DEDUPLICATED_ACTIONS.has(log.action) &&
        log.details.commentId &&
        commentIds.has(log.details.commentId)
      ) {
        return false;
      }
      return true;
    })
    .map((log) => ({
      id: `audit-${log.id}`,
      type: 'audit' as const,
      timestamp: new Date(log.createdAt),
      auditLog: log,
    }));

  return [...commentItems, ...auditItems].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
}
