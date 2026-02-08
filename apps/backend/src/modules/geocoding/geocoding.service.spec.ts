import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';

const MOCK_YANDEX_RESPONSE = {
  response: {
    GeoObjectCollection: {
      featureMember: [
        {
          GeoObject: {
            metaDataProperty: {
              GeocoderMetaData: {
                text: 'Россия, Москва, Тверская улица, 1',
              },
            },
            Point: {
              pos: '37.611347 55.757718',
            },
          },
        },
        {
          GeoObject: {
            metaDataProperty: {
              GeocoderMetaData: {
                text: 'Россия, Москва, Тверская улица',
              },
            },
            Point: {
              pos: '37.604956 55.764587',
            },
          },
        },
      ],
    },
  },
};

const MOCK_REVERSE_RESPONSE = {
  response: {
    GeoObjectCollection: {
      featureMember: [
        {
          GeoObject: {
            metaDataProperty: {
              GeocoderMetaData: {
                text: 'Россия, Москва, Красная площадь, 1',
              },
            },
            Point: {
              pos: '37.617 55.755',
            },
          },
        },
      ],
    },
  },
};

describe('GeocodingService', () => {
  let service: GeocodingService;
  let configService: jest.Mocked<ConfigService>;
  let fetchSpy: jest.SpyInstance;

  const mockFetchResponse = (data: unknown, ok = true, status = 200) => {
    fetchSpy.mockResolvedValue({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: jest.fn().mockResolvedValue(data),
    } as unknown as Response);
  };

  beforeEach(async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');

    const mockConfigService = {
      get: jest.fn().mockReturnValue('test-api-key'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeocodingService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<GeocodingService>(GeocodingService);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('geocode', () => {
    it('должен вернуть результаты геокодирования', async () => {
      mockFetchResponse(MOCK_YANDEX_RESPONSE);

      const results = await service.geocode('Тверская 1');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        address: 'Россия, Москва, Тверская улица, 1',
        lat: 55.757718,
        lng: 37.611347,
        displayAddress: 'Россия, Москва, Тверская улица, 1',
      });
      expect(results[1]).toEqual({
        address: 'Россия, Москва, Тверская улица',
        lat: 55.764587,
        lng: 37.604956,
        displayAddress: 'Россия, Москва, Тверская улица',
      });
    });

    it('должен передать правильные параметры в URL', async () => {
      mockFetchResponse(MOCK_YANDEX_RESPONSE);

      await service.geocode('Москва, Тверская');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(calledUrl.origin + calledUrl.pathname).toBe(
        'https://geocode-maps.yandex.ru/v1/',
      );
      expect(calledUrl.searchParams.get('apikey')).toBe('test-api-key');
      expect(calledUrl.searchParams.get('geocode')).toBe('Москва, Тверская');
      expect(calledUrl.searchParams.get('format')).toBe('json');
      expect(calledUrl.searchParams.get('lang')).toBe('ru_RU');
    });

    it('должен вернуть пустой массив если нет API ключа', async () => {
      configService.get.mockReturnValue(undefined);
      const moduleNoKey = await Test.createTestingModule({
        providers: [
          GeocodingService,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();
      const serviceNoKey =
        moduleNoKey.get<GeocodingService>(GeocodingService);

      const results = await serviceNoKey.geocode('test');

      expect(results).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('должен вернуть пустой массив при ошибке HTTP', async () => {
      mockFetchResponse({}, false, 403);

      const results = await service.geocode('test');

      expect(results).toEqual([]);
    });

    it('должен вернуть пустой массив при сетевой ошибке', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const results = await service.geocode('test');

      expect(results).toEqual([]);
    });

    it('должен вернуть пустой массив при таймауте', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchSpy.mockRejectedValue(abortError);

      const results = await service.geocode('test');

      expect(results).toEqual([]);
    });

    it('должен вернуть пустой массив при пустом ответе', async () => {
      mockFetchResponse({
        response: {
          GeoObjectCollection: {
            featureMember: [],
          },
        },
      });

      const results = await service.geocode('несуществующий адрес');

      expect(results).toEqual([]);
    });

    it('должен пропустить объекты без координат', async () => {
      mockFetchResponse({
        response: {
          GeoObjectCollection: {
            featureMember: [
              {
                GeoObject: {
                  metaDataProperty: {
                    GeocoderMetaData: { text: 'Адрес без координат' },
                  },
                  Point: {},
                },
              },
              {
                GeoObject: {
                  metaDataProperty: {
                    GeocoderMetaData: {
                      text: 'Россия, Москва',
                    },
                  },
                  Point: { pos: '37.617 55.755' },
                },
              },
            ],
          },
        },
      });

      const results = await service.geocode('Москва');

      expect(results).toHaveLength(1);
      expect(results[0].address).toBe('Россия, Москва');
    });

    it('должен пропустить объекты с невалидными координатами', async () => {
      mockFetchResponse({
        response: {
          GeoObjectCollection: {
            featureMember: [
              {
                GeoObject: {
                  metaDataProperty: {
                    GeocoderMetaData: { text: 'Bad coords' },
                  },
                  Point: { pos: 'not_a_number another_bad' },
                },
              },
            ],
          },
        },
      });

      const results = await service.geocode('test');

      expect(results).toEqual([]);
    });

    it('должен обработать некорректную структуру ответа', async () => {
      mockFetchResponse({ unexpected: 'structure' });

      const results = await service.geocode('test');

      expect(results).toEqual([]);
    });
  });

  describe('reverseGeocode', () => {
    it('должен вернуть адрес по координатам', async () => {
      mockFetchResponse(MOCK_REVERSE_RESPONSE);

      const result = await service.reverseGeocode(55.755, 37.617);

      expect(result).toEqual({
        address: 'Россия, Москва, Красная площадь, 1',
        lat: 55.755,
        lng: 37.617,
        displayAddress: 'Россия, Москва, Красная площадь, 1',
      });
    });

    it('должен передать координаты в порядке lng,lat (Yandex формат)', async () => {
      mockFetchResponse(MOCK_REVERSE_RESPONSE);

      await service.reverseGeocode(55.755, 37.617);

      const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
      expect(calledUrl.searchParams.get('geocode')).toBe('37.617,55.755');
    });

    it('должен вернуть null если нет API ключа', async () => {
      configService.get.mockReturnValue(undefined);
      const moduleNoKey = await Test.createTestingModule({
        providers: [
          GeocodingService,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();
      const serviceNoKey =
        moduleNoKey.get<GeocodingService>(GeocodingService);

      const result = await serviceNoKey.reverseGeocode(55.755, 37.617);

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('должен вернуть null при пустом результате', async () => {
      mockFetchResponse({
        response: {
          GeoObjectCollection: {
            featureMember: [],
          },
        },
      });

      const result = await service.reverseGeocode(0, 0);

      expect(result).toBeNull();
    });

    it('должен вернуть null при ошибке запроса', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await service.reverseGeocode(55.755, 37.617);

      expect(result).toBeNull();
    });
  });

  describe('кеширование', () => {
    it('должен кешировать результаты geocode', async () => {
      mockFetchResponse(MOCK_YANDEX_RESPONSE);

      const results1 = await service.geocode('Тверская 1');
      const results2 = await service.geocode('Тверская 1');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(results1).toEqual(results2);
    });

    it('должен кешировать результаты reverseGeocode', async () => {
      mockFetchResponse(MOCK_REVERSE_RESPONSE);

      const result1 = await service.reverseGeocode(55.755, 37.617);
      const result2 = await service.reverseGeocode(55.755, 37.617);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(result2);
    });

    it('не должен использовать кеш для разных запросов', async () => {
      mockFetchResponse(MOCK_YANDEX_RESPONSE);

      await service.geocode('Тверская 1');
      await service.geocode('Тверская 2');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('должен инвалидировать кеш по TTL', async () => {
      mockFetchResponse(MOCK_YANDEX_RESPONSE);

      await service.geocode('Тверская 1');

      // Имитируем просроченный кеш через доступ к приватному свойству
      const cacheMap = (service as unknown as { cache: Map<string, { data: unknown; expiresAt: number }> }).cache;
      const entry = cacheMap.get('geocode:Тверская 1');
      if (entry) {
        entry.expiresAt = Date.now() - 1;
      }

      await service.geocode('Тверская 1');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('должен удалять старые записи при переполнении кеша', async () => {
      mockFetchResponse(MOCK_YANDEX_RESPONSE);

      // Заполняем кеш до максимума
      for (let i = 0; i < 1001; i++) {
        mockFetchResponse(MOCK_YANDEX_RESPONSE);
        await service.geocode(`address-${i}`);
      }

      const cacheMap = (service as unknown as { cache: Map<string, unknown> }).cache;
      expect(cacheMap.size).toBeLessThanOrEqual(1000);
    });
  });
});
