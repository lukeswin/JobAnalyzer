"use client";

import { useState } from "react";

/* The Webpack-ready bundle — worker is bundled automatically */
import * as pdfjsLib from "pdfjs-dist/build/pdf";

/* One optional type for nicer IntelliSense */
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { createWorker } from 'tesseract.js';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export default function PdfTextExtractor() {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

  async function extractTextFromImage(page: any): Promise<string> {
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context!,
      viewport: viewport
    }).promise;

    // @ts-ignore - Tesseract types are not properly exported
    const worker = await createWorker('eng');
    
    const { data: { text } } = await worker.recognize(canvas);
    await worker.terminate();
    
    return text;
  }

  async function handleFile(file: File) {
    setBusy(true);
    setText("");

    const doc = await pdfjsLib
      .getDocument(await file.arrayBuffer())
      .promise;

    let out = "";

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tContent = await page.getTextContent();
      const pageText = tContent.items
        .map((i: TextItem) => i.str)
        .join("");

      if (pageText.trim()) {
        out += "\n" + pageText;
      } else {
        // If no text found, try OCR
        const ocrText = await extractTextFromImage(page);
        out += "\n" + ocrText;
      }
    }

    setText(out.trim());
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {busy && <p className="text-sm">Extracting…</p>}

      {text && (
        <pre className="whitespace-pre-wrap p-4 bg-gray-50 rounded">
          {text}
        </pre>
      )}
    </div>
  );
}
