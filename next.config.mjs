/** @type {import('next').NextConfig} */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    // Handle PDF.js worker
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?(m?js)$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/chunks/[name].[hash][ext]',
      },
    });

    // Add alias for pdfjs-dist
    config.resolve.alias = {
      ...config.resolve.alias,
      'pdfjs-dist': 'pdfjs-dist/build/pdf',
    };

    // Add fallback for node modules
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      canvas: false,
      stream: false,
      util: false,
    };

    // Copy PDF worker to public directory
    const source = path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.js');
    const target = path.join(__dirname, 'public/pdf.worker.min.js');
    
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, target);
    }

    return config;
  },
};

export default nextConfig;
