import { useState, useEffect, useRef } from 'react';
import { getSignedUrl, invalidateSignedUrl } from '@/lib/signedUrl';

/** Интервал авто-обновления signed URL (45 минут — за 5 мин до истечения кэша) */
const REFRESH_INTERVAL = 45 * 60 * 1000;

/**
 * Hook to fetch a signed URL for an S3 key.
 * Returns the signed URL (or null while loading).
 * Automatically refreshes the URL before cache expiry.
 */
export function useSignedUrl(key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!key) {
      setUrl(null);
      return;
    }

    let cancelled = false;

    const fetchUrl = () => {
      // Инвалидируем кэш при обновлении, чтобы получить свежий URL
      invalidateSignedUrl(key);
      getSignedUrl(key).then((signedUrl) => {
        if (!cancelled && keyRef.current === key) setUrl(signedUrl);
      }).catch(() => {
        if (!cancelled && keyRef.current === key) setUrl(null);
      });
    };

    // Первоначальная загрузка (из кэша, если ещё валиден)
    getSignedUrl(key).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    }).catch(() => {
      if (!cancelled) setUrl(null);
    });

    // Автообновление за 5 мин до истечения
    const interval = setInterval(fetchUrl, REFRESH_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key]);

  return url;
}
