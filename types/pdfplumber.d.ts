declare module 'pdfplumber' {
  interface PDFPage {
    text(): Promise<string>;
  }

  interface PDFDocument {
    pages: PDFPage[];
    close(): Promise<void>;
  }

  function open(input: any): Promise<PDFDocument>;

  export default {
    open
  };
} 