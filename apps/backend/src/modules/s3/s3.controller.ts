import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Service } from './s3.service';
import { v4 as uuidv4 } from 'uuid';

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

@Controller('files')
export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Недопустимый тип файла. Разрешены: изображения, PDF, Word, Excel, текстовые файлы.',
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Размер файла превышает 10MB');
    }

    const url = await this.s3Service.uploadFile(file, 'attachments');

    return {
      id: uuidv4(),
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      url,
    };
  }

  @Get('signed-url/:key')
  async getSignedUrl(@Param('key') key: string) {
    const url = await this.s3Service.getSignedUrl(key);
    return { url };
  }
}
