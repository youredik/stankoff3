import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LegacySyncService } from './services/legacy-sync.service';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('legacy/sync')
export class LegacySyncController {
  constructor(
    private readonly syncService: LegacySyncService,
  ) {}

  @Get('status')
  getStatus() {
    return this.syncService.getStatus();
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  enable() {
    return this.syncService.enable();
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  disable() {
    return this.syncService.disable();
  }

  @Post('run-now')
  @HttpCode(HttpStatus.OK)
  async runNow() {
    return this.syncService.runSync();
  }
}
