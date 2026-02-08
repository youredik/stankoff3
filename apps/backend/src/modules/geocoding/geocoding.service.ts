import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeocodingResult {
  address: string;
  lat: number;
  lng: number;
  displayAddress: string;
}

interface CacheEntry {
  data: GeocodingResult[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 минут
const CACHE_MAX_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 5000;
const YANDEX_GEOCODER_URL = 'https://geocode-maps.yandex.ru/v1/';

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly apiKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('YANDEX_GEOCODER_API_KEY');
    if (!this.apiKey) {
      this.logger.warn(
        'YANDEX_GEOCODER_API_KEY не задан — геокодирование будет возвращать пустые результаты',
      );
    }
  }

  /**
   * Прямое геокодирование: адрес → координаты
   */
  async geocode(address: string): Promise<GeocodingResult[]> {
    if (!this.apiKey) {
      return [];
    }

    const cacheKey = `geocode:${address}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const results = await this.callYandexApi(address);
    this.setToCache(cacheKey, results);
    return results;
  }

  /**
   * Обратное геокодирование: координаты → адрес
   * Yandex использует порядок lng,lat
   */
  async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<GeocodingResult | null> {
    if (!this.apiKey) {
      return null;
    }

    const cacheKey = `reverse:${lat},${lng}`;
    const cached = this.getFromCache(cacheKey);
    if (cached && cached.length > 0) {
      return cached[0];
    }

    const query = `${lng},${lat}`;
    const results = await this.callYandexApi(query);
    this.setToCache(cacheKey, results);

    return results.length > 0 ? results[0] : null;
  }

  private async callYandexApi(geocode: string): Promise<GeocodingResult[]> {
    const url = new URL(YANDEX_GEOCODER_URL);
    url.searchParams.set('apikey', this.apiKey!);
    url.searchParams.set('geocode', geocode);
    url.searchParams.set('format', 'json');
    url.searchParams.set('lang', 'ru_RU');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.error(
          `Yandex Geocoder вернул статус ${response.status}: ${response.statusText}`,
        );
        return [];
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error('Yandex Geocoder: таймаут запроса (5с)');
      } else {
        this.logger.error(
          `Yandex Geocoder ошибка: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return [];
    }
  }

  private parseResponse(data: unknown): GeocodingResult[] {
    try {
      const response = data as {
        response?: {
          GeoObjectCollection?: {
            featureMember?: Array<{
              GeoObject?: {
                metaDataProperty?: {
                  GeocoderMetaData?: {
                    text?: string;
                  };
                };
                Point?: {
                  pos?: string;
                };
              };
            }>;
          };
        };
      };

      const featureMembers =
        response?.response?.GeoObjectCollection?.featureMember;
      if (!Array.isArray(featureMembers)) {
        return [];
      }

      const results: GeocodingResult[] = [];

      for (const member of featureMembers) {
        const geoObject = member?.GeoObject;
        if (!geoObject) continue;

        const text =
          geoObject.metaDataProperty?.GeocoderMetaData?.text;
        const pos = geoObject.Point?.pos;

        if (!text || !pos) continue;

        const [lngStr, latStr] = pos.split(' ');
        const lng = parseFloat(lngStr);
        const lat = parseFloat(latStr);

        if (isNaN(lat) || isNaN(lng)) continue;

        results.push({
          address: text,
          lat,
          lng,
          displayAddress: text,
        });
      }

      return results;
    } catch {
      this.logger.error('Ошибка парсинга ответа Yandex Geocoder');
      return [];
    }
  }

  private getFromCache(key: string): GeocodingResult[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setToCache(key: string, data: GeocodingResult[]): void {
    // Если кеш переполнен, удаляем самую старую запись
    if (this.cache.size >= CACHE_MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }
}
