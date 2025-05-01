import path from 'path';

const config = {
  workerPath: {
    development: path.join(process.cwd(), 'public', 'pdfjs', 'pdf.worker.js'),
    production: '/pdfjs/pdf.worker.js'
  },
  options: {
    normalizeWhitespace: true,
    disableCombineTextItems: false
  }
};

export const getWorkerPath = () => {
  return process.env.NODE_ENV === 'production' 
    ? config.workerPath.production 
    : config.workerPath.development;
};

export const getPdfOptions = () => {
  return config.options;
};

export default config; 