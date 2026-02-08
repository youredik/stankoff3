import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OgPreviewController } from './og-preview.controller';
import { OgPreviewService } from './og-preview.service';

describe('OgPreviewController', () => {
  let controller: OgPreviewController;
  let service: jest.Mocked<OgPreviewService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [OgPreviewController],
      providers: [
        {
          provide: OgPreviewService,
          useValue: {
            getPreview: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(OgPreviewController);
    service = module.get(OgPreviewService);
  });

  it('должен вернуть OG preview для валидного URL', async () => {
    service.getPreview.mockResolvedValue({
      title: 'Example',
      description: 'Desc',
      url: 'https://example.com',
    });

    const result = await controller.getPreview('https://example.com');

    expect(result.title).toBe('Example');
    expect(service.getPreview).toHaveBeenCalledWith('https://example.com');
  });

  it('должен бросить BadRequestException без URL', async () => {
    await expect(controller.getPreview('')).rejects.toThrow(BadRequestException);
  });

  it('должен бросить BadRequestException для невалидного URL', async () => {
    await expect(controller.getPreview('not-a-url')).rejects.toThrow(BadRequestException);
  });

  it('должен бросить BadRequestException для ftp://', async () => {
    await expect(controller.getPreview('ftp://files.com/data')).rejects.toThrow(BadRequestException);
  });

  it('должен принять http:// URL', async () => {
    service.getPreview.mockResolvedValue({ url: 'http://example.com' });

    const result = await controller.getPreview('http://example.com');
    expect(result.url).toBe('http://example.com');
  });
});
