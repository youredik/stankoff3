declare module 'pdf-parse' {
  interface TextPage {
    text: string;
    pageNumber?: number;
  }

  interface TextResult {
    pages: TextPage[];
    total: number;
  }

  export class PDFParse {
    constructor(data: Uint8Array | ArrayBuffer | object);
    getText(options?: object): Promise<TextResult>;
    load(): Promise<any>;
    destroy(): void;
  }
}
