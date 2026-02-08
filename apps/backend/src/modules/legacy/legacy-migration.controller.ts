import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LegacyMigrationService } from './services/legacy-migration.service';
import { StartMigrationDto, MigrationLogQueryDto } from './dto';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('legacy/migration')
export class LegacyMigrationController {
  constructor(
    private readonly migrationService: LegacyMigrationService,
  ) {}

  @Get('status')
  getStatus() {
    return this.migrationService.getProgress();
  }

  @Get('preview')
  async getPreview() {
    return this.migrationService.getPreview();
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async startMigration(@Body() dto: StartMigrationDto) {
    return this.migrationService.startMigration(dto);
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  stopMigration() {
    return this.migrationService.stopMigration();
  }

  @Get('progress')
  getProgress() {
    return this.migrationService.getProgress();
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validateMigration() {
    return this.migrationService.validateMigration();
  }

  @Get('log')
  async getMigrationLog(@Query() query: MigrationLogQueryDto) {
    return this.migrationService.getMigrationLog(query);
  }

  @Post('retry-failed')
  @HttpCode(HttpStatus.OK)
  async retryFailed() {
    return this.migrationService.retryFailed();
  }
}
