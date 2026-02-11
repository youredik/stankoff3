import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { S3Service } from './s3.service';
import { v4 as uuidv4 } from 'uuid';

// Max file size: 300MB
const MAX_FILE_SIZE = 300 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Video
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  // Audio
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  // Generic binary (some browsers send this for Blob data)
  'application/octet-stream',
  // Documents
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

    // Check base MIME type without parameters (e.g. 'audio/webm;codecs=opus' → 'audio/webm')
    const baseMimeType = file.mimetype.split(';')[0].trim();
    if (!ALLOWED_MIME_TYPES.includes(baseMimeType)) {
      throw new BadRequestException(
        `Недопустимый тип файла: ${file.mimetype}. Разрешены: изображения, видео, аудио, PDF, Word, Excel, текстовые файлы.`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('Размер файла превышает 300MB');
    }

    // Fix UTF-8 encoding for filenames (multer encodes as Latin-1)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const { key, thumbnailKey } = await this.s3Service.uploadFileWithThumbnail(
      file,
      'attachments',
    );

    // Generate temporary signed URLs for preview (1 hour expiry)
    const keys = [key];
    if (thumbnailKey) keys.push(thumbnailKey);
    const signedUrls = await this.s3Service.getSignedUrlsBatch(keys);

    return {
      id: uuidv4(),
      name: originalName,
      size: file.size,
      mimeType: file.mimetype,
      key,
      thumbnailKey,
      // Temporary URLs for preview
      url: signedUrls.get(key) || '',
      thumbnailUrl: thumbnailKey ? signedUrls.get(thumbnailKey) : undefined,
    };
  }

  @Get('signed-url/:key')
  async getSignedUrl(@Param('key') key: string) {
    const url = await this.s3Service.getSignedUrl(key);
    return { url };
  }

  @Get('download/*path')
  async downloadFile(
    @Param('path') pathSegments: string | string[],
    @Query('name') fileName: string,
    @Res() res: Response,
  ) {
    // Wildcard param returns array of path segments, join them back with /
    const key = Array.isArray(pathSegments)
      ? pathSegments.join('/')
      : pathSegments;

    if (!key) {
      throw new BadRequestException('Не указан ключ файла');
    }

    try {
      const { stream, contentType, contentLength } =
        await this.s3Service.getFileStream(key);

      // Use provided filename or extract from key
      const name = fileName || key.split('/').pop() || 'file';

      // RFC 5987 encoding for UTF-8 filenames
      // filename for old browsers, filename* for modern browsers with UTF-8 support
      const asciiName = name.replace(/[^\x20-\x7E]/g, '_');
      const utf8Name = encodeURIComponent(name).replace(/['()]/g, escape);

      res.set({
        'Content-Type': contentType,
        'Content-Length': contentLength,
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      });

      (stream as any).pipe(res);
    } catch {
      throw new NotFoundException(`Файл не найден: ${key}`);
    }
  }
}
