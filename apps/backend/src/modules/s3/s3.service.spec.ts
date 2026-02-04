/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import { S3Service } from './s3.service';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Body: { pipe: jest.fn() },
      ContentType: 'application/pdf',
      ContentLength: 1000,
    }),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed-url'),
}));

jest.mock('sharp', () => {
  return jest.fn().mockReturnValue({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumbnail')),
  });
});

describe('S3Service', () => {
  let service: S3Service;
  let mockSend: jest.Mock;

  const mockFile = {
    originalname: 'test file.pdf',
    buffer: Buffer.from('test content'),
    mimetype: 'application/pdf',
    size: 1000,
  } as Express.Multer.File;

  const mockImageFile = {
    originalname: 'image.png',
    buffer: Buffer.from('image content'),
    mimetype: 'image/png',
    size: 2000,
  } as Express.Multer.File;

  beforeEach(async () => {
    // Set environment variables
    process.env.S3_ENDPOINT = 'https://s3.example.com';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_ACCESS_KEY_ID = 'test-key';
    process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
    process.env.S3_BUCKET_NAME = 'test-bucket';

    const module: TestingModule = await Test.createTestingModule({
      providers: [S3Service],
    }).compile();

    service = module.get<S3Service>(S3Service);

    // Get the mock send function
    const { S3Client } = require('@aws-sdk/client-s3');
    mockSend = S3Client.mock.results[S3Client.mock.results.length - 1].value.send;
    mockSend.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('должен загрузить файл и вернуть URL', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.uploadFile(mockFile, 'uploads');

      expect(result).toContain('test-bucket');
      expect(result).toContain('test file.pdf'); // uploadFile не санитизирует имя
      expect(mockSend).toHaveBeenCalled();
    });
  });

  describe('getSignedUrl', () => {
    it('должен вернуть подписанный URL', async () => {
      const result = await service.getSignedUrl('test-key');

      expect(result).toBe('https://signed-url');
    });

    it('должен использовать custom expiresIn', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await service.getSignedUrl('test-key', 7200);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 },
      );
    });
  });

  describe('uploadFileWithThumbnail', () => {
    it('должен загрузить файл без thumbnail для не-изображений', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.uploadFileWithThumbnail(mockFile, 'uploads');

      expect(result.key).toContain('test_file.pdf');
      expect(result.thumbnailKey).toBeUndefined();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('должен загрузить файл с thumbnail для изображений', async () => {
      mockSend.mockResolvedValue({});

      const result = await service.uploadFileWithThumbnail(mockImageFile, 'uploads');

      expect(result.key).toContain('image.png');
      expect(result.thumbnailKey).toContain('thumbnails');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('должен санитизировать имя файла', async () => {
      mockSend.mockResolvedValue({});
      const fileWithSpaces = { ...mockFile, originalname: 'file with spaces & special!chars.pdf' };

      const result = await service.uploadFileWithThumbnail(fileWithSpaces as any, 'uploads');

      expect(result.key).toContain('file_with_spaces__specialchars.pdf');
    });

    it('должен обработать ошибку генерации thumbnail', async () => {
      mockSend.mockResolvedValue({});
      const sharp = require('sharp');
      sharp.mockReturnValueOnce({
        resize: jest.fn().mockReturnThis(),
        jpeg: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Sharp error')),
      });

      const result = await service.uploadFileWithThumbnail(mockImageFile, 'uploads');

      // При ошибке thumbnailKey должен быть равен key
      expect(result.thumbnailKey).toBe(result.key);
    });
  });

  describe('getSignedUrlsBatch', () => {
    it('должен вернуть Map с подписанными URL', async () => {
      const keys = ['key1', 'key2'];

      const result = await service.getSignedUrlsBatch(keys);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('key1')).toBe('https://signed-url');
    });

    it('должен использовать custom expiresIn', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

      await service.getSignedUrlsBatch(['key1'], 7200);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 },
      );
    });

    it('должен обработать ошибку для отдельного ключа', async () => {
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockRejectedValueOnce(new Error('URL error')).mockResolvedValue('https://signed-url');

      const result = await service.getSignedUrlsBatch(['bad-key', 'good-key']);

      expect(result.size).toBe(1);
      expect(result.has('bad-key')).toBe(false);
      expect(result.get('good-key')).toBe('https://signed-url');
    });
  });

  describe('getFileStream', () => {
    it('должен вернуть stream и метаданные', async () => {
      const mockStream = { pipe: jest.fn() };
      mockSend.mockResolvedValue({
        Body: mockStream,
        ContentType: 'application/pdf',
        ContentLength: 1000,
      });

      const result = await service.getFileStream('test-key');

      expect(result.stream).toBe(mockStream);
      expect(result.contentType).toBe('application/pdf');
      expect(result.contentLength).toBe(1000);
    });

    it('должен использовать default ContentType', async () => {
      mockSend.mockResolvedValue({
        Body: { pipe: jest.fn() },
        ContentType: undefined,
        ContentLength: 0,
      });

      const result = await service.getFileStream('test-key');

      expect(result.contentType).toBe('application/octet-stream');
    });
  });
});
