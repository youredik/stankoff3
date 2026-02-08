import { Injectable, Logger } from '@nestjs/common';

export interface OgPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

interface CacheEntry {
  data: OgPreview;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 час
const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_SIZE = 100_000; // 100KB — достаточно для <head>

@Injectable()
export class OgPreviewService {
  private readonly logger = new Logger(OgPreviewService.name);
  private readonly cache = new Map<string, CacheEntry>();

  async getPreview(url: string): Promise<OgPreview> {
    // Проверка кэша
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const preview = await this.fetchOgData(url);

    // Кэшируем
    this.cache.set(url, {
      data: preview,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    // Чистим устаревшие записи (ленивая очистка)
    if (this.cache.size > 500) {
      this.cleanupCache();
    }

    return preview;
  }

  private async fetchOgData(url: string): Promise<OgPreview> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'StankoffBot/1.0 (OG Preview)',
          Accept: 'text/html',
        },
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return { url };
      }

      // Читаем только начало HTML (head)
      const html = await this.readPartialBody(response);
      return this.parseOgTags(html, url);
    } catch (error) {
      this.logger.warn(`Failed to fetch OG data for ${url}: ${(error as Error).message}`);
      return { url };
    }
  }

  private async readPartialBody(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';

    const decoder = new TextDecoder();
    let html = '';

    try {
      while (html.length < MAX_BODY_SIZE) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        // Если нашли </head>, дальше не читаем
        if (html.includes('</head>')) break;
      }
    } finally {
      reader.cancel().catch(() => {});
    }

    return html;
  }

  parseOgTags(html: string, url: string): OgPreview {
    const getMeta = (property: string): string | undefined => {
      // og:title, og:description, og:image, og:site_name
      const regex = new RegExp(
        `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
        'i',
      );
      const match = html.match(regex);
      return match?.[1] || match?.[2] || undefined;
    };

    const title =
      getMeta('og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    return {
      title,
      description: getMeta('og:description') || getMeta('description'),
      image: getMeta('og:image'),
      siteName: getMeta('og:site_name'),
      url,
    };
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}
