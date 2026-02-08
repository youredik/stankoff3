import { OgPreviewService } from './og-preview.service';

describe('OgPreviewService', () => {
  let service: OgPreviewService;

  beforeEach(() => {
    service = new OgPreviewService();
  });

  describe('parseOgTags', () => {
    it('должен парсить og:title и og:description', () => {
      const html = `
        <html><head>
          <meta property="og:title" content="Мой сайт" />
          <meta property="og:description" content="Описание сайта" />
          <meta property="og:image" content="https://example.com/img.jpg" />
          <meta property="og:site_name" content="Example" />
        </head></html>
      `;

      const result = service.parseOgTags(html, 'https://example.com');

      expect(result.title).toBe('Мой сайт');
      expect(result.description).toBe('Описание сайта');
      expect(result.image).toBe('https://example.com/img.jpg');
      expect(result.siteName).toBe('Example');
      expect(result.url).toBe('https://example.com');
    });

    it('должен падать на <title> если нет og:title', () => {
      const html = `<html><head><title>Fallback Title</title></head></html>`;

      const result = service.parseOgTags(html, 'https://example.com');

      expect(result.title).toBe('Fallback Title');
    });

    it('должен парсить meta с content перед property', () => {
      const html = `
        <html><head>
          <meta content="Reversed Order" property="og:title" />
        </head></html>
      `;

      const result = service.parseOgTags(html, 'https://example.com');

      expect(result.title).toBe('Reversed Order');
    });

    it('должен парсить meta name="description"', () => {
      const html = `
        <html><head>
          <meta name="description" content="Meta description" />
        </head></html>
      `;

      const result = service.parseOgTags(html, 'https://example.com');

      expect(result.description).toBe('Meta description');
    });

    it('должен вернуть только url если нет мета-тегов', () => {
      const html = `<html><head></head><body>no meta</body></html>`;

      const result = service.parseOgTags(html, 'https://example.com');

      expect(result.url).toBe('https://example.com');
      expect(result.title).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.image).toBeUndefined();
    });

    it('og:description приоритетнее name="description"', () => {
      const html = `
        <html><head>
          <meta name="description" content="name desc" />
          <meta property="og:description" content="og desc" />
        </head></html>
      `;

      const result = service.parseOgTags(html, 'https://example.com');

      expect(result.description).toBe('og desc');
    });
  });

  describe('getPreview (кэширование)', () => {
    it('должен кэшировать результат', async () => {
      const fetchSpy = jest
        .spyOn(service as any, 'fetchOgData')
        .mockResolvedValue({
          title: 'Cached',
          url: 'https://example.com',
        });

      // Первый вызов
      const result1 = await service.getPreview('https://example.com');
      expect(result1.title).toBe('Cached');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Второй вызов — из кэша
      const result2 = await service.getPreview('https://example.com');
      expect(result2.title).toBe('Cached');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('должен вызывать fetch для разных URL', async () => {
      const fetchSpy = jest
        .spyOn(service as any, 'fetchOgData')
        .mockImplementation(async (url: string) => ({
          title: url,
          url,
        }));

      await service.getPreview('https://a.com');
      await service.getPreview('https://b.com');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
