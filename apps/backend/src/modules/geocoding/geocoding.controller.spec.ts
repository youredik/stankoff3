import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService, GeocodingResult } from './geocoding.service';

describe('GeocodingController', () => {
  let controller: GeocodingController;
  let geocodingService: jest.Mocked<GeocodingService>;

  const mockGeocodeResults: GeocodingResult[] = [
    {
      address: 'Россия, Москва, Тверская улица, 1',
      lat: 55.757718,
      lng: 37.611347,
      displayAddress: 'Россия, Москва, Тверская улица, 1',
    },
  ];

  const mockReverseResult: GeocodingResult = {
    address: 'Россия, Москва, Красная площадь, 1',
    lat: 55.755,
    lng: 37.617,
    displayAddress: 'Россия, Москва, Красная площадь, 1',
  };

  beforeEach(async () => {
    const mockGeocodingService = {
      geocode: jest.fn(),
      reverseGeocode: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeocodingController],
      providers: [
        { provide: GeocodingService, useValue: mockGeocodingService },
      ],
    }).compile();

    controller = module.get<GeocodingController>(GeocodingController);
    geocodingService = module.get(GeocodingService);
  });

  describe('search', () => {
    it('должен вернуть результаты геокодирования', async () => {
      geocodingService.geocode.mockResolvedValue(mockGeocodeResults);

      const result = await controller.search('Тверская 1');

      expect(result).toEqual(mockGeocodeResults);
      expect(geocodingService.geocode).toHaveBeenCalledWith('Тверская 1');
    });

    it('должен обрезать пробелы в запросе', async () => {
      geocodingService.geocode.mockResolvedValue(mockGeocodeResults);

      await controller.search('  Тверская 1  ');

      expect(geocodingService.geocode).toHaveBeenCalledWith('Тверская 1');
    });

    it('должен выбросить BadRequestException при пустом запросе', async () => {
      await expect(controller.search('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('должен выбросить BadRequestException при запросе из пробелов', async () => {
      await expect(controller.search('   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('должен выбросить BadRequestException при undefined', async () => {
      await expect(
        controller.search(undefined as unknown as string),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reverse', () => {
    it('должен вернуть адрес по координатам', async () => {
      geocodingService.reverseGeocode.mockResolvedValue(mockReverseResult);

      const result = await controller.reverse('55.755', '37.617');

      expect(result).toEqual(mockReverseResult);
      expect(geocodingService.reverseGeocode).toHaveBeenCalledWith(
        55.755,
        37.617,
      );
    });

    it('должен выбросить BadRequestException если lat не задан', async () => {
      await expect(
        controller.reverse(undefined as unknown as string, '37.617'),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен выбросить BadRequestException если lng не задан', async () => {
      await expect(
        controller.reverse('55.755', undefined as unknown as string),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен выбросить BadRequestException если lat не число', async () => {
      await expect(controller.reverse('abc', '37.617')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('должен выбросить BadRequestException если lng не число', async () => {
      await expect(controller.reverse('55.755', 'xyz')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('должен выбросить BadRequestException если lat вне диапазона', async () => {
      await expect(controller.reverse('91', '37.617')).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.reverse('-91', '37.617')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('должен выбросить BadRequestException если lng вне диапазона', async () => {
      await expect(controller.reverse('55.755', '181')).rejects.toThrow(
        BadRequestException,
      );

      await expect(controller.reverse('55.755', '-181')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('должен принимать граничные значения координат', async () => {
      geocodingService.reverseGeocode.mockResolvedValue(mockReverseResult);

      await controller.reverse('90', '180');
      expect(geocodingService.reverseGeocode).toHaveBeenCalledWith(90, 180);

      await controller.reverse('-90', '-180');
      expect(geocodingService.reverseGeocode).toHaveBeenCalledWith(-90, -180);
    });

    it('должен вернуть null если адрес не найден', async () => {
      geocodingService.reverseGeocode.mockResolvedValue(null);

      const result = await controller.reverse('0', '0');

      expect(result).toBeNull();
    });
  });
});
