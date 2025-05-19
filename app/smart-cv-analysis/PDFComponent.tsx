"use client";

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { createWorker, PSM } from "tesseract.js";

// Tell PDF.js where to fetch its worker bundle. You copied/bundled this in public/
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

export default function PdfTextExtractor() {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

  /**
   * Heuristic column‑aware ordering for text‑based PDFs.
   * 1.  Map each TextItem → {str, x, y}.
   * 2.  Detect the largest X‑gap to find a potential column split.
   * 3.  Sort items within each column top‑to‑bottom, left‑to‑right.
   * 4.  Concatenate columns (left first, then right).
   */
  const orderTextItems = (items: any[]): string => {
    const mapped = items.map((i: TextItem) => ({
      str: i.str,
      x: i.transform[4] as number,
      y: i.transform[5] as number,
    }));

    if (!mapped.length) return "";

    // --- detect potential column split ------------------------------------
    mapped.sort((a, b) => a.x - b.x);
    let largestGap = 0,
      splitIndex = -1;
    for (let i = 1; i < mapped.length; i++) {
      const gap = mapped[i].x - mapped[i - 1].x;
      if (gap > largestGap) {
        largestGap = gap;
        splitIndex = i;
      }
    }

    const COLUMN_GAP_THRESHOLD = 50; // tune for your page units
    let columns: typeof mapped[] = [mapped];
    if (largestGap > COLUMN_GAP_THRESHOLD && splitIndex !== -1) {
      const threshold =
        (mapped[splitIndex - 1].x + mapped[splitIndex].x) / 2;
      const left = mapped.filter((m) => m.x < threshold);
      const right = mapped.filter((m) => m.x >= threshold);
      columns = [left, right];
    }

    // --- convert items → lines → column text ------------------------------
    const toColumnText = (col: typeof mapped) => {
      const sorted = [...col].sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: { y: number; text: string[] }[] = [];
      const LINE_HEIGHT_TOLERANCE = 5; // tweak if lines merge/split incorrectly

      sorted.forEach((it) => {
        const line = lines.find((l) => Math.abs(l.y - it.y) < LINE_HEIGHT_TOLERANCE);
        if (line) {
          line.text.push(it.str);
        } else {
          lines.push({ y: it.y, text: [it.str] });
        }
      });

      return lines
        .sort((a, b) => b.y - a.y) // restore top‑to‑bottom order
        .map((l) => l.text.join(" "))
        .join("\n");
    };

    return columns.map(toColumnText).join("\n\n");
  };

  /**
   * OCR fallback for image‑only PDFs. Uses Tesseract.js AUTO layout mode
   * and re‑groups recognised lines by column (split at canvas midpoint).
   */
  async function extractTextFromImage(page: any): Promise<string> {
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context!, viewport }).promise;

    const worker = await createWorker('eng');
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });

    const result = await worker.recognize(canvas);
    const text = result.data.text;
    const lines = text.split('\n').filter(line => line.trim());

    await worker.terminate();

    const mid = canvas.width / 2;
    const leftLines = lines
      .filter((line: string) => {
        const words = line.split(' ');
        return words.some(word => {
          const wordWidth = word.length * 8; // Approximate character width
          return wordWidth < mid;
        });
      });
    const rightLines = lines
      .filter((line: string) => {
        const words = line.split(' ');
        return words.some(word => {
          const wordWidth = word.length * 8; // Approximate character width
          return wordWidth >= mid;
        });
      });

    const joinLines = (arr: string[]) => arr.join('\n');

    return rightLines.length
      ? joinLines(leftLines) + '\n\n' + joinLines(rightLines)
      : joinLines(leftLines);
  }

  async function handleFile(file: File) {
    setBusy(true);
    setText("");

    const doc = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
    let out = "";

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tContent = await page.getTextContent();
      const pageText = orderTextItems(tContent.items);

      if (pageText.trim()) {
        out += "\n" + pageText;
      } else {
        out += "\n" + (await extractTextFromImage(page));
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
