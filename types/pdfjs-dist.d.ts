declare module 'pdfjs-dist/legacy/build/pdf' {
  interface PDFDocumentProxy {
    numPages: number;
    pdfInfo: {
      version: string;
    };
    metadata: any;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  interface PDFPageProxy {
    getTextContent(): Promise<{
      items: Array<{
        str: string;
      }>;
    }>;
  }

  interface GlobalWorkerOptions {
    workerSrc: string;
  }

  interface GetDocumentOptions {
    data: Buffer;
  }

  export const GlobalWorkerOptions: GlobalWorkerOptions;
  export function getDocument(options: GetDocumentOptions): {
    promise: Promise<PDFDocumentProxy>;
  };
} 