import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as sharp from 'sharp';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    this.s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION || 'ru-central1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true, // Важно для Yandex Object Storage
    });
    this.bucketName = process.env.S3_BUCKET_NAME!;
  }

  async uploadFile(file: Express.Multer.File, path: string): Promise<string> {
    const key = `${path}/${Date.now()}-${file.originalname}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);
    
    return `${process.env.S3_ENDPOINT}/${this.bucketName}/${key}`;
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async uploadFileWithThumbnail(
    file: Express.Multer.File,
    path: string,
  ): Promise<{ key: string; thumbnailKey?: string }> {
    const timestamp = Date.now();
    // Sanitize filename: replace spaces and special chars
    const safeFilename = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const key = `${path}/${timestamp}-${safeFilename}`;
    const isImage = file.mimetype.startsWith('image/');

    // Загрузка оригинального файла
    const uploadCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });
    await this.s3Client.send(uploadCommand);

    let thumbnailKey: string | undefined;

    // Генерация thumbnail для изображений
    if (isImage) {
      try {
        const thumbnailBuffer = await sharp(file.buffer)
          .resize(200, 200, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        thumbnailKey = `${path}/thumbnails/${timestamp}-${safeFilename}.jpg`;
        const thumbnailCommand = new PutObjectCommand({
          Bucket: this.bucketName,
          Key: thumbnailKey,
          Body: thumbnailBuffer,
          ContentType: 'image/jpeg',
        });
        await this.s3Client.send(thumbnailCommand);
      } catch (error: any) {
        this.logger.error(`Failed to generate thumbnail for ${file.originalname}: ${error?.message}`);
        // Если не удалось создать thumbnail, используем оригинал как fallback
        thumbnailKey = key;
      }
    }
    return { key, thumbnailKey };
  }

  async getSignedUrlsBatch(keys: string[], expiresIn: number = 3600): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    await Promise.all(
      keys.map(async (key) => {
        try {
          const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          });
          const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
          result.set(key, signedUrl);
        } catch (error: any) {
          this.logger.error(`Failed to generate signed URL for ${key}: ${error?.message}`);
        }
      }),
    );
    return result;
  }

  async getFileStream(key: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentType: string;
    contentLength: number;
  }> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    return {
      stream: response.Body as NodeJS.ReadableStream,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || 0,
    };
  }
}
