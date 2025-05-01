declare module 'pdf.js-extract' {
  interface PDFExtractOptions {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }

  interface PDFPageInfo {
    num: number;
  }

  interface PDFContentItem {
    str: string;
    dir: string;
    width: number;
    height: number;
    transform: number[];
    fontName: string;
  }

  interface PDFPage {
    pageInfo: PDFPageInfo;
    content: PDFContentItem[];
  }

  interface PDFExtractResult {
    pages: PDFPage[];
  }

  class PDFExtract {
    constructor();
    extractBuffer(buffer: Buffer, options?: PDFExtractOptions): Promise<PDFExtractResult>;
  }

  export { PDFExtract };
} 