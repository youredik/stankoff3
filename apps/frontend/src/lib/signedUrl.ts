import { apiClient } from './api/client';

/**
 * Signed URL cache — fetches temporary S3 URLs for authenticated file access.
 * Used by chat attachments (images, files, voice).
 * Signed URLs are valid for 1 hour; cache expires after 50 minutes.
 */
const cache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL = 50 * 60 * 1000; // 50 minutes

const pendingRequests = new Map<string, Promise<string>>();

export async function getSignedUrl(key: string): Promise<string> {
  // Return cached URL if still valid
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Deduplicate concurrent requests for the same key
  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const promise = fetchWithRetry(key);
  pendingRequests.set(key, promise);
  return promise;
}

/** Fetch signed URL с retry (exponential backoff, max 3 попытки) */
async function fetchWithRetry(key: string, attempt = 0): Promise<string> {
  const MAX_RETRIES = 2;
  try {
    const r = await apiClient.get<{ url: string }>(`/files/signed-url/${key}`);
    cache.set(key, { url: r.data.url, expiresAt: Date.now() + CACHE_TTL });
    return r.data.url;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return fetchWithRetry(key, attempt + 1);
    }
    throw err;
  } finally {
    if (attempt === 0) pendingRequests.delete(key);
  }
}

/** Инвалидирует кэш для конкретного ключа (для принудительного обновления) */
export function invalidateSignedUrl(key: string): void {
  cache.delete(key);
}

/** Prefetch signed URLs for multiple keys (e.g. all attachments in a message) */
export function prefetchSignedUrls(keys: string[]): void {
  for (const key of keys) {
    if (!cache.has(key) || cache.get(key)!.expiresAt <= Date.now()) {
      getSignedUrl(key).catch(() => {});
    }
  }
}
