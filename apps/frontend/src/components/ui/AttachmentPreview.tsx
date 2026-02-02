'use client';

import { useState } from 'react';
import { FileText, Image, Download, Eye, File, Film } from 'lucide-react';
import type { Attachment } from '@/types';
import { MediaLightbox } from './MediaLightbox';
import { PdfViewer } from './PdfViewer';
import { VideoPlayer } from './VideoPlayer';

interface AttachmentPreviewProps {
  attachment: Attachment;
  allAttachments: Attachment[];
  showThumbnail?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPreview({
  attachment,
  allAttachments,
  showThumbnail = true,
}: AttachmentPreviewProps) {
  const [showLightbox, setShowLightbox] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');
  const isPdf = attachment.mimeType === 'application/pdf';

  const handleClick = () => {
    if (isImage) {
      setShowLightbox(true);
    } else if (isVideo) {
      setShowVideo(true);
    } else if (isPdf) {
      setShowPdf(true);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Use our backend proxy for download to hide S3 URL and force download
    const downloadUrl = attachment.key
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/files/download/${attachment.key}?name=${encodeURIComponent(attachment.name)}`
      : attachment.url;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = attachment.name;
    link.click();
  };

  // Индекс среди всех изображений для галереи
  const imageIndex = allAttachments
    .filter((a) => a.mimeType.startsWith('image/'))
    .findIndex((a) => a.id === attachment.id);

  return (
    <>
      <div
        onClick={handleClick}
        className={`
          flex items-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded px-2 py-1.5
          transition-colors group
          ${isImage || isVideo || isPdf ? 'cursor-pointer' : ''}
        `}
      >
        {/* Thumbnail или иконка */}
        {isImage && showThumbnail && (attachment.thumbnailUrl || attachment.url) ? (
          <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
            <img
              src={attachment.thumbnailUrl || attachment.url}
              alt={attachment.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : isImage ? (
          <Image className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
        ) : isVideo ? (
          <Film className="w-4 h-4 text-purple-500 flex-shrink-0" />
        ) : isPdf ? (
          <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
        ) : (
          <File className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
        )}

        {/* Название и размер */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{attachment.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{formatFileSize(attachment.size)}</p>
        </div>

        {/* Действия */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {(isImage || isVideo || isPdf) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              className="p-1 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
              title="Просмотр"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="p-1 text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
            title="Скачать"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modals */}
      {showLightbox && (
        <MediaLightbox
          attachments={allAttachments}
          initialIndex={imageIndex >= 0 ? imageIndex : 0}
          onClose={() => setShowLightbox(false)}
        />
      )}

      {showPdf && (
        <PdfViewer
          attachment={attachment}
          onClose={() => setShowPdf(false)}
        />
      )}

      {showVideo && (
        <VideoPlayer
          attachment={attachment}
          onClose={() => setShowVideo(false)}
        />
      )}
    </>
  );
}
