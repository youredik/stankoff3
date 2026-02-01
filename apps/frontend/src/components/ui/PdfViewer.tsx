'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink } from 'lucide-react';
import type { Attachment } from '@/types';

interface PdfViewerProps {
  attachment: Attachment;
  onClose: () => void;
}

export function PdfViewer({ attachment, onClose }: PdfViewerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      setMounted(false);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleDownload = () => {
    // Use our backend proxy for download to hide S3 URL and force download
    const downloadUrl = attachment.key
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/files/download/${attachment.key}?name=${encodeURIComponent(attachment.name)}`
      : attachment.url;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = attachment.name;
    link.click();
  };

  const handleOpenInNewTab = () => {
    window.open(attachment.url, '_blank');
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/80 flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="h-14 bg-white border-b flex items-center justify-between px-4 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-gray-900 font-medium truncate max-w-md">
          {attachment.name}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenInNewTab}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
            title="Открыть в новой вкладке"
          >
            <ExternalLink className="w-5 h-5" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
            title="Скачать"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PDF embed */}
      <div
        className="flex-1 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          src={`${attachment.url}#toolbar=1&navpanes=0`}
          className="w-full h-full bg-white rounded-lg shadow-lg"
          title={attachment.name}
        />
      </div>
    </div>,
    document.body
  );
}
