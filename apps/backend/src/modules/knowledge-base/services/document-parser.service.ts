import { Injectable, Logger } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  async parsePdf(buffer: Buffer): Promise<string> {
    try {
      const pdf = new PDFParse(new Uint8Array(buffer));
      const result = await pdf.getText();
      const text = result.pages.map((p) => p.text).join('\n');
      return this.cleanText(text);
    } catch (error) {
      this.logger.error(`Ошибка парсинга PDF: ${error.message}`);
      throw new Error('Не удалось распознать PDF документ');
    }
  }

  async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return this.cleanText(result.value);
    } catch (error) {
      this.logger.error(`Ошибка парсинга DOCX: ${error.message}`);
      throw new Error('Не удалось распознать DOCX документ');
    }
  }

  parseTxt(buffer: Buffer): string {
    return this.cleanText(buffer.toString('utf-8'));
  }

  async parseDocument(buffer: Buffer, mimeType: string): Promise<string> {
    switch (mimeType) {
      case 'application/pdf':
        return this.parsePdf(buffer);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.parseDocx(buffer);
      case 'text/plain':
      case 'text/csv':
        return this.parseTxt(buffer);
      default:
        throw new Error(`Неподдерживаемый тип документа: ${mimeType}`);
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n /g, '\n')
      .trim();
  }
}
