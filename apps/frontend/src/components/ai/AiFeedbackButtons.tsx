'use client';

import { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { aiApi } from '@/lib/api/ai';

interface AiFeedbackButtonsProps {
  type: 'response' | 'classification' | 'search' | 'assistance';
  entityId?: string;
  metadata?: Record<string, unknown>;
  initialRating?: 'positive' | 'negative' | null;
}

export function AiFeedbackButtons({
  type,
  entityId,
  metadata,
  initialRating,
}: AiFeedbackButtonsProps) {
  const [rating, setRating] = useState<'positive' | 'negative' | null>(
    initialRating ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  const handleFeedback = useCallback(
    async (newRating: 'positive' | 'negative') => {
      if (submitting) return;
      setSubmitting(true);
      try {
        await aiApi.submitFeedback({ type, entityId, rating: newRating, metadata });
        setRating(newRating);
      } catch {
        // Игнорируем ошибки feedback — это не критичная операция
      }
      setSubmitting(false);
    },
    [type, entityId, metadata, submitting],
  );

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleFeedback('positive')}
        disabled={submitting}
        className={`p-1 rounded transition-colors ${
          rating === 'positive'
            ? 'text-green-500 bg-green-50 dark:bg-green-900/30'
            : 'text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
        }`}
        title="Полезно"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => handleFeedback('negative')}
        disabled={submitting}
        className={`p-1 rounded transition-colors ${
          rating === 'negative'
            ? 'text-red-500 bg-red-50 dark:bg-red-900/30'
            : 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
        }`}
        title="Не помогло"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
