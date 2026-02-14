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

/**
 * Детерминированные цвета для инициалов — каждый пользователь получает
 * свой уникальный цвет на основе хеша userId/email/имени.
 * 12 гармоничных оттенков, хорошо различимых друг от друга.
 */
const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-violet-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
  'bg-orange-600',
  'bg-indigo-600',
  'bg-teal-600',
  'bg-pink-600',
  'bg-lime-700',
  'bg-fuchsia-600',
] as const;

/** Быстрый хеш строки → индекс цвета */
function hashToColorIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

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
 *
 * Возвращает { url, isLoading } — isLoading true пока signed URL загружается.
 */
function useAvatarUrl(avatar: string | null | undefined): { url: string | null; isLoading: boolean } {
  const s3Key = avatar && isS3Key(avatar) ? avatar : null;
  const signedUrl = useSignedUrl(s3Key);

  if (!avatar) return { url: null, isLoading: false };
  if (s3Key) return { url: signedUrl, isLoading: !signedUrl };
  return { url: avatar, isLoading: false };
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
  const { url: resolvedAvatar, isLoading: avatarLoading } = useAvatarUrl(avatar);

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

  // Детерминированный цвет инициалов по userId / email / имени
  const colorSeed = userId || email || `${firstName}${lastName}` || '';
  const bgColor = AVATAR_COLORS[hashToColorIndex(colorSeed)];

  // Клик для увеличенного просмотра — по умолчанию для md+ с аватаром
  const isClickable = clickable ?? (showImage && size !== 'xs' && size !== 'sm');

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!isClickable || !showImage) return;
    e.stopPropagation();
    setShowPreview(true);
  }, [isClickable, showImage]);

  // Escape закрывает превью + блокировка скролла body
  useEffect(() => {
    if (!showPreview) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPreview(false); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [showPreview]);

  return (
    <>
      <div
        className={`relative inline-flex flex-shrink-0 ${isClickable ? 'cursor-pointer' : ''} ${className || ''}`}
        onClick={handleClick}
      >
        <div
          className={`${config.container} ${bgColor} rounded-full flex items-center justify-center overflow-hidden ${isClickable ? 'transition-transform hover:scale-105' : ''}`}
        >
          {avatarLoading ? (
            /* Skeleton placeholder — пульсация пока загружается signed URL */
            <div className="w-full h-full bg-gray-300 dark:bg-gray-600 animate-pulse rounded-full" />
          ) : showImage ? (
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
          role="dialog"
          aria-modal="true"
          aria-label={`Аватар ${fullName}`}
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
