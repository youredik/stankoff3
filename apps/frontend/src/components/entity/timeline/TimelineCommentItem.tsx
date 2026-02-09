import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';
import type { Comment, Attachment } from '@/types';

interface TimelineCommentItemProps {
  comment: Comment;
  allAttachments: Attachment[];
}

export function TimelineCommentItem({ comment, allAttachments }: TimelineCommentItemProps) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 bg-primary-500 rounded-full flex-shrink-0 flex items-center justify-center">
        <span className="text-white text-xs font-semibold">
          {comment.author.firstName[0]}
          {comment.author.lastName[0]}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
            {comment.author.firstName} {comment.author.lastName}
          </span>
          <span className="text-xs text-gray-500">
            {format(new Date(comment.createdAt), 'dd.MM HH:mm', { locale: ru })}
          </span>
        </div>
        <div
          className="text-sm text-gray-700 dark:text-gray-300 mt-1 [&_p]:mb-2 [&_strong]:font-semibold [&_em]:italic [&_a]:text-primary-400 [&_a]:underline [&_.mention]:text-primary-400 [&_.mention]:bg-primary-100 dark:[&_.mention]:bg-primary-900/30 [&_.mention]:rounded [&_.mention]:px-0.5"
          dangerouslySetInnerHTML={{ __html: comment.content }}
        />
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {comment.attachments.map((attachment) => (
              <AttachmentPreview
                key={attachment.id}
                attachment={attachment}
                allAttachments={allAttachments}
                showThumbnail={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
