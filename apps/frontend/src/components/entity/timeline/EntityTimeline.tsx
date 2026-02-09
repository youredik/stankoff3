'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { ChevronUp, Clock } from 'lucide-react';
import { getEntityHistory } from '@/lib/api/audit-logs';
import { mergeTimeline } from './mergeTimeline';
import { TimelineCommentItem } from './TimelineCommentItem';
import { TimelineAuditItem } from './TimelineAuditItem';
import type { Comment, AuditLog, FieldOption, Attachment } from '@/types';

interface EntityTimelineProps {
  entityId: string;
  comments: Comment[];
  statusOptions?: FieldOption[];
  allAttachments: Attachment[];
}

const LIMIT = 100;

export function EntityTimeline({
  entityId,
  comments,
  statusOptions,
  allAttachments,
}: EntityTimelineProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCommentsLengthRef = useRef(comments.length);

  // Load audit logs
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const result = await getEntityHistory(entityId, {
          limit: LIMIT,
          offset: 0,
          sort: 'oldest',
        });
        if (!cancelled) {
          setAuditLogs(result.logs);
          setHasMore(result.hasMore);
        }
      } catch (error) {
        console.error('Failed to load timeline history:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [entityId]);

  // Load more older entries
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await getEntityHistory(entityId, {
        limit: LIMIT,
        offset: auditLogs.length,
        sort: 'oldest',
      });
      setAuditLogs((prev) => [...prev, ...result.logs]);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more timeline:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Merge and sort
  const timelineItems = useMemo(
    () => mergeTimeline(comments, auditLogs),
    [comments, auditLogs],
  );

  // Auto-scroll on new comment
  useEffect(() => {
    if (comments.length > prevCommentsLengthRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    prevCommentsLengthRef.current = comments.length;
  }, [comments.length]);

  if (loading && auditLogs.length === 0 && comments.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Нет активности</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="relative">
      {/* Load more button (older entries) */}
      {hasMore && (
        <div className="flex justify-center mb-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600" />
            ) : (
              <ChevronUp className="w-3 h-3" />
            )}
            Загрузить ещё
          </button>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical stem */}
        <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700" />

        <div className="space-y-4">
          {timelineItems.map((item) => (
            <div key={item.id} className="relative">
              {item.type === 'comment' && item.comment && (
                <TimelineCommentItem
                  comment={item.comment}
                  allAttachments={allAttachments}
                />
              )}
              {item.type === 'audit' && item.auditLog && (
                <TimelineAuditItem
                  log={item.auditLog}
                  statusOptions={statusOptions}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
