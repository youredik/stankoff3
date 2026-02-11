import { Test, TestingModule } from '@nestjs/testing';
import { DocumentParserService } from './document-parser.service';

// Мокаем pdf-parse (новая версия экспортирует класс PDFParse)
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation((data) => ({
    getText: () => {
      const text = Buffer.from(data).toString();
      if (text.includes('INVALID')) {
        return Promise.reject(new Error('Invalid PDF'));
      }
      return Promise.resolve({
        pages: [{ text: 'Текст из PDF документа' }],
      });
    },
  })),
}));

// Мокаем mammoth
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockImplementation(({ buffer }: { buffer: Buffer }) => {
    if (buffer.toString().includes('INVALID')) {
      return Promise.reject(new Error('Invalid DOCX'));
    }
    return Promise.resolve({ value: 'Текст из DOCX документа' });
  }),
}));

describe('DocumentParserService', () => {
  let service: DocumentParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentParserService],
    }).compile();

    service = module.get<DocumentParserService>(DocumentParserService);
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  describe('parseTxt', () => {
    it('должен распарсить простой текст', () => {
      const buffer = Buffer.from('Тестовый текст');
      expect(service.parseTxt(buffer)).toBe('Тестовый текст');
    });

    it('должен очистить множественные пробелы', () => {
      const buffer = Buffer.from('Текст   с    пробелами');
      expect(service.parseTxt(buffer)).toBe('Текст с пробелами');
    });

    it('должен очистить множественные переносы строк', () => {
      const buffer = Buffer.from('Строка 1\n\n\n\nСтрока 2');
      expect(service.parseTxt(buffer)).toBe('Строка 1\n\nСтрока 2');
    });

    it('должен убрать пробелы в начале и конце', () => {
      const buffer = Buffer.from('  текст  ');
      expect(service.parseTxt(buffer)).toBe('текст');
    });

    it('должен заменить \\r\\n на \\n', () => {
      const buffer = Buffer.from('строка1\r\nстрока2');
      expect(service.parseTxt(buffer)).toBe('строка1\nстрока2');
    });
  });

  describe('parsePdf', () => {
    it('должен распарсить PDF', async () => {
      const buffer = Buffer.from('valid pdf content');
      const result = await service.parsePdf(buffer);
      expect(result).toBe('Текст из PDF документа');
    });

    it('должен выбросить ошибку при невалидном PDF', async () => {
      const buffer = Buffer.from('INVALID');
      await expect(service.parsePdf(buffer)).rejects.toThrow(
        'Не удалось распознать PDF документ',
      );
    });
  });

  describe('parseDocx', () => {
    it('должен распарсить DOCX', async () => {
      const buffer = Buffer.from('valid docx content');
      const result = await service.parseDocx(buffer);
      expect(result).toBe('Текст из DOCX документа');
    });

    it('должен выбросить ошибку при невалидном DOCX', async () => {
      const buffer = Buffer.from('INVALID');
      await expect(service.parseDocx(buffer)).rejects.toThrow(
        'Не удалось распознать DOCX документ',
      );
    });
  });

  describe('parseDocument', () => {
    it('должен выбрать PDF парсер', async () => {
      const buffer = Buffer.from('content');
      const result = await service.parseDocument(buffer, 'application/pdf');
      expect(result).toBe('Текст из PDF документа');
    });

    it('должен выбрать DOCX парсер', async () => {
      const buffer = Buffer.from('content');
      const result = await service.parseDocument(
        buffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(result).toBe('Текст из DOCX документа');
    });

    it('должен выбрать TXT парсер', async () => {
      const buffer = Buffer.from('простой текст');
      const result = await service.parseDocument(buffer, 'text/plain');
      expect(result).toBe('простой текст');
    });

    it('должен выбрать TXT парсер для CSV', async () => {
      const buffer = Buffer.from('col1,col2\nval1,val2');
      const result = await service.parseDocument(buffer, 'text/csv');
      expect(result).toContain('col1,col2');
    });

    it('должен выбросить ошибку для неподдерживаемого типа', async () => {
      const buffer = Buffer.from('');
      await expect(
        service.parseDocument(buffer, 'application/unknown'),
      ).rejects.toThrow('Неподдерживаемый тип документа: application/unknown');
    });
  });
});
