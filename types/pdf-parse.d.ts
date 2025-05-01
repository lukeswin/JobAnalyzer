declare module 'pdf-parse' {
  interface PDFPageData {
    pageNumber: number;
    Texts?: Array<{
      str: string;
      dir: string;
      width: number;
      height: number;
      transform: number[];
      fontName: string;
    }>;
    getTextContent(options?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }): Promise<{
      items: Array<{
        str: string;
        transform: number[];
      }>;
    }>;
  }

  interface PDFData {
    text: string;
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    version: string;
  }

  interface PDFParseOptions {
    pagerender?: (pageData: PDFPageData) => Promise<string>;
    max?: number;
    version?: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: PDFParseOptions): Promise<PDFData>;
  export default pdfParse;
} 