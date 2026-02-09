import type { Comment, AuditLog } from '@/types';

export type TimelineItemType = 'comment' | 'audit';

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  timestamp: Date;
  comment?: Comment;
  auditLog?: AuditLog;
}
