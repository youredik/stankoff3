import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GeocodingService } from './geocoding.service';

@Controller('geocoding')
@UseGuards(JwtAuthGuard)
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  /**
   * GET /api/geocoding/search?q=адрес
   *
   * Прямое геокодирование: поиск координат по адресу
   */
  @Get('search')
  async search(@Query('q') query: string) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Параметр q обязателен');
    }

    return this.geocodingService.geocode(query.trim());
  }

  /**
   * GET /api/geocoding/reverse?lat=55.75&lng=37.61
   *
   * Обратное геокодирование: поиск адреса по координатам
   */
  @Get('reverse')
  async reverse(@Query('lat') latStr: string, @Query('lng') lngStr: string) {
    if (!latStr || !lngStr) {
      throw new BadRequestException('Параметры lat и lng обязательны');
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng)) {
      throw new BadRequestException('Параметры lat и lng должны быть числами');
    }

    if (lat < -90 || lat > 90) {
      throw new BadRequestException('lat должен быть в диапазоне от -90 до 90');
    }

    if (lng < -180 || lng > 180) {
      throw new BadRequestException(
        'lng должен быть в диапазоне от -180 до 180',
      );
    }

    return this.geocodingService.reverseGeocode(lat, lng);
  }
}
