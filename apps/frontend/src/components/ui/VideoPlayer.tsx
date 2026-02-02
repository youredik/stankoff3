'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Maximize, Minimize, Volume2, VolumeX } from 'lucide-react';
import type { Attachment } from '@/types';

interface VideoPlayerProps {
  attachment: Attachment;
  onClose: () => void;
}

export function VideoPlayer({ attachment, onClose }: VideoPlayerProps) {
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          onClose();
        }
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
          } else {
            videoRef.current.pause();
          }
        }
      }
      if (e.key === 'f') {
        toggleFullscreen();
      }
      if (e.key === 'm') {
        setIsMuted((m) => !m);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Track fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleDownload = () => {
    const downloadUrl = attachment.key
      ? `/api/files/download/${attachment.key}?name=${encodeURIComponent(attachment.name)}`
      : attachment.url;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = attachment.name;
    link.click();
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await containerRef.current.requestFullscreen();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="absolute top-0 left-0 right-0 h-14 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between px-4 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-white text-sm truncate max-w-md">
          {attachment.name}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted((m) => !m)}
            className="p-2 text-white/80 hover:text-white transition-colors"
            title={isMuted ? 'Включить звук (M)' : 'Выключить звук (M)'}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 text-white/80 hover:text-white transition-colors"
            title={isFullscreen ? 'Выйти из полноэкранного режима (F)' : 'Полноэкранный режим (F)'}
          >
            {isFullscreen ? (
              <Minimize className="w-5 h-5" />
            ) : (
              <Maximize className="w-5 h-5" />
            )}
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
            title="Закрыть (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Video */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          src={attachment.url}
          className="max-w-full max-h-[85vh] rounded-lg"
          controls
          autoPlay
          muted={isMuted}
          playsInline
        >
          Ваш браузер не поддерживает воспроизведение видео.
        </video>
      </div>

      {/* Hints */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 text-white/50 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <span>Пробел — пауза</span>
        <span>M — звук</span>
        <span>F — полноэкранный</span>
        <span>Esc — закрыть</span>
      </div>
    </div>,
    document.body
  );
}
