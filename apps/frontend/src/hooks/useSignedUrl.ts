import { useState, useEffect } from 'react';
import { getSignedUrl } from '@/lib/signedUrl';

/**
 * Hook to fetch a signed URL for an S3 key.
 * Returns the signed URL (or null while loading).
 */
export function useSignedUrl(key: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!key) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    getSignedUrl(key).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    }).catch(() => {
      if (!cancelled) setUrl(null);
    });

    return () => { cancelled = true; };
  }, [key]);

  return url;
}
