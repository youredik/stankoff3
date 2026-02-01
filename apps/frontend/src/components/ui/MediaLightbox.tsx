'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Attachment } from '@/types';

interface MediaLightboxProps {
  attachments: Attachment[];
  initialIndex: number;
  onClose: () => void;
}

export function MediaLightbox({
  attachments,
  initialIndex,
  onClose,
}: MediaLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [mounted, setMounted] = useState(false);

  // Фильтруем только изображения
  const mediaAttachments = attachments.filter((a) =>
    a.mimeType.startsWith('image/')
  );

  const current = mediaAttachments[currentIndex];

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const goToPrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : mediaAttachments.length - 1));
    setZoom(1);
  }, [mediaAttachments.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((i) => (i < mediaAttachments.length - 1 ? i + 1 : 0));
    setZoom(1);
  }, [mediaAttachments.length]);

  // Навигация клавиатурой
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToPrev, goToNext]);

  const handleDownload = () => {
    // Use our backend proxy for download to hide S3 URL and force download
    const downloadUrl = current.key
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/files/download/${current.key}?name=${encodeURIComponent(current.name)}`
      : current.url;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = current.name;
    link.click();
  };

  if (!mounted || !current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-black/50 to-transparent flex items-center justify-between px-4 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white text-sm truncate max-w-md">
          {current.name} ({currentIndex + 1} / {mediaAttachments.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-2 text-white/80 hover:text-white transition-colors"
            title="Уменьшить"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <span className="text-white text-sm w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            className="p-2 text-white/80 hover:text-white transition-colors"
            title="Увеличить"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-white/80 hover:text-white transition-colors"
            title="Скачать"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white transition-colors"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image */}
      <div
        className="max-w-[90vw] max-h-[85vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.url}
          alt={current.name}
          className="transition-transform duration-200 max-h-[85vh] object-contain"
          style={{ transform: `scale(${zoom})` }}
          draggable={false}
        />
      </div>

      {/* Navigation arrows */}
      {mediaAttachments.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Thumbnails strip */}
      {mediaAttachments.length > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-black/50 rounded-lg max-w-[90vw] overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {mediaAttachments.map((att, idx) => (
            <button
              key={att.id}
              onClick={() => {
                setCurrentIndex(idx);
                setZoom(1);
              }}
              className={`w-12 h-12 rounded overflow-hidden border-2 transition-colors flex-shrink-0 ${
                idx === currentIndex ? 'border-white' : 'border-transparent'
              }`}
            >
              <img
                src={att.thumbnailUrl || att.url}
                alt={att.name}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
