'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { usePresenceStore } from '@/store/usePresenceStore';
import { useSignedUrl } from '@/hooks/useSignedUrl';

export interface UserAvatarProps {
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showOnline?: boolean;
  userId?: string;
  className?: string;
  /** Разрешить клик для увеличенного просмотра (по умолчанию true для md/lg/xl) */
  clickable?: boolean;
}

const SIZE_CONFIG = {
  xs: { container: 'w-5 h-5', text: 'text-[9px]', dot: 'w-2 h-2 border-[1.5px]' },
  sm: { container: 'w-6 h-6', text: 'text-[10px]', dot: 'w-2.5 h-2.5 border-2' },
  md: { container: 'w-8 h-8', text: 'text-xs', dot: 'w-3 h-3 border-2' },
  lg: { container: 'w-9 h-9', text: 'text-sm', dot: 'w-3.5 h-3.5 border-2' },
  xl: { container: 'w-20 h-20', text: 'text-2xl', dot: 'w-4 h-4 border-2' },
} as const;

function getInitials(firstName?: string, lastName?: string, email?: string): string {
  const first = firstName?.[0] || '';
  const last = lastName?.[0] || '';
  const initials = (first + last).toUpperCase();
  if (initials) return initials;
  return (email?.[0] || 'U').toUpperCase();
}

/** Определяет, является ли строка S3-ключом (не URL) */
function isS3Key(value: string): boolean {
  return !value.startsWith('http') && !value.startsWith('blob:') && !value.startsWith('data:');
}

/**
 * Разрешает avatar в готовый URL:
 * - S3 key → signed URL через API (с кэшированием 50 мин)
 * - http/blob/data URL → используется напрямую
 */
function useAvatarUrl(avatar: string | null | undefined): string | null {
  const s3Key = avatar && isS3Key(avatar) ? avatar : null;
  const signedUrl = useSignedUrl(s3Key);

  if (!avatar) return null;
  if (s3Key) return signedUrl;
  return avatar;
}

export function UserAvatar({
  firstName,
  lastName,
  email,
  avatar,
  size = 'sm',
  showOnline,
  userId,
  className,
  clickable,
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const resolvedAvatar = useAvatarUrl(avatar);

  // Сброс ошибки загрузки при смене аватара
  useEffect(() => {
    setImgError(false);
  }, [resolvedAvatar]);

  const isOnline = usePresenceStore((s) => {
    if (showOnline === true) return true;
    if (showOnline === false) return false;
    if (userId) return s.onlineUserIds.has(userId);
    return false;
  });

  const config = SIZE_CONFIG[size];
  const initials = getInitials(firstName, lastName, email);
  const showImage = resolvedAvatar && !imgError;
  const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'Avatar';

  // Клик для увеличенного просмотра — по умолчанию для md+ с аватаром
  const isClickable = clickable ?? (showImage && size !== 'xs' && size !== 'sm');

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isClickable || !showImage) return;
    e.stopPropagation();
    setShowPreview(true);
  }, [isClickable, showImage]);

  // Escape закрывает превью
  useEffect(() => {
    if (!showPreview) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPreview(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showPreview]);

  return (
    <>
      <div
        className={`relative inline-flex flex-shrink-0 ${isClickable ? 'cursor-pointer' : ''} ${className || ''}`}
        onClick={handleClick}
      >
        <div
          className={`${config.container} bg-primary-600 rounded-full flex items-center justify-center overflow-hidden ${isClickable ? 'transition-transform hover:scale-105' : ''}`}
        >
          {showImage ? (
            <img
              src={resolvedAvatar}
              alt={fullName}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className={`text-white font-medium ${config.text}`}>{initials}</span>
          )}
        </div>
        {isOnline && (
          <span
            className={`absolute bottom-0 right-0 ${config.dot} bg-green-500 border-white dark:border-gray-900 rounded-full`}
          />
        )}
      </div>

      {/* Fullscreen preview */}
      {showPreview && showImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowPreview(false); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={resolvedAvatar}
              alt={fullName}
              className="max-w-[80vw] max-h-[70vh] w-auto h-auto rounded-2xl shadow-2xl object-contain"
            />
            <p className="text-white text-lg font-medium">{fullName}</p>
          </div>
        </div>
      )}
    </>
  );
}
