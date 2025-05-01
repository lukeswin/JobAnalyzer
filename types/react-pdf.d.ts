declare module 'react-pdf' {
  interface PDFDocumentProxy {
    numPages: number;
    _pdfInfo: {
      version: string;
    };
    getData(): Promise<Uint8Array>;
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
    workerSrc: string | null;
  }

  interface GetDocumentOptions {
    data: Uint8Array;
  }

  export const pdfjs: {
    version: string;
    GlobalWorkerOptions: GlobalWorkerOptions;
    getDocument(options: GetDocumentOptions): {
      promise: Promise<PDFDocumentProxy>;
    };
  };
}

declare module 'pdfjs-dist/build/pdf.worker.entry' {
  const Worker: any;
  export default Worker;
} 