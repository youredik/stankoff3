import { Controller, Get, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { OgPreviewService } from './og-preview.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('og-preview')
@UseGuards(JwtAuthGuard)
export class OgPreviewController {
  constructor(private readonly ogPreviewService: OgPreviewService) {}

  @Get()
  async getPreview(@Query('url') url: string) {
    if (!url) {
      throw new BadRequestException('URL is required');
    }

    // Валидация URL
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    return this.ogPreviewService.getPreview(url);
  }
}
