"use client";

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { createWorker, PSM } from "tesseract.js";
import 'dommatrix';

/*
 * This component now does three things:
 * 1. Extracts text from PDFs (with column‑aware heuristics + OCR fallback)
 * 2. Immediately POSTs that raw text to your FastAPI backend (/api/resumes)
 *    which stores + parses it via resume_parser.py
 * 3. Renders the structured response (experiences + skills)
 */

// Set up the worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

// Polyfill DOMMatrix if not available
if (typeof window !== 'undefined' && !window.DOMMatrix) {
  const { DOMMatrix } = require('dommatrix');
  window.DOMMatrix = DOMMatrix;
}

interface Experience {
  job_title: string;
  company: string;
  start_date?: string | null;
  end_date?: string | null;
  duration_years?: number | null;
}

interface ParsedResponse {
  id: number;
  experiences: Experience[];
  skills: string[];
  created_at: string;
}

interface TesseractLine {
  text: string;
  bbox: { x0: number };
}

interface TesseractData {
  text: string;
  lines: TesseractLine[];
}

export default function PDFComponent() {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Column‑aware ordering for text‑based PDFs
  // ---------------------------------------------------------------------
  const orderTextItems = (items: any[]): string => {
    const mapped = items.map((i: TextItem) => ({
      str: i.str,
      x: i.transform[4] as number,
      y: i.transform[5] as number,
    }));

    if (!mapped.length) return "";

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

    const COLUMN_GAP_THRESHOLD = 30;
    let columns: typeof mapped[] = [mapped];
    if (largestGap > COLUMN_GAP_THRESHOLD && splitIndex !== -1) {
      const threshold =
        (mapped[splitIndex - 1].x + mapped[splitIndex].x) / 2;
      const left = mapped.filter((m) => m.x < threshold);
      const right = mapped.filter((m) => m.x >= threshold);
      columns = [left, right];
    }

    const toColumnText = (col: typeof mapped) => {
      const sorted = [...col].sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: { y: number; text: string[] }[] = [];
      const LINE_TOL = 5;

      sorted.forEach((it) => {
        const line = lines.find((l) => Math.abs(l.y - it.y) < LINE_TOL);
        if (line) line.text.push(it.str);
        else lines.push({ y: it.y, text: [it.str] });
      });

      return lines
        .sort((a, b) => b.y - a.y)
        .map((l) => l.text.join(" "))
        .join("\n");
    };

    const cleanText = (txt: string) =>
      txt
        .replace(/^[*+=~|!•·]+/gm, "") // Remove leading special chars per line
        .replace(/[~*+=!|•·]+/g, "");   // Remove them anywhere else

    return cleanText(columns.map(toColumnText).join("\n\n"));
  };

  // ---------------------------------------------------------------------
  // OCR fallback (Tesseract.js AUTO layout)
  // ---------------------------------------------------------------------
  async function extractTextFromImage(page: any): Promise<string> {
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx!, viewport }).promise;

    // --- Preprocess: grayscale + threshold for better OCR on colored backgrounds ---
    const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const threshold = 160; // You can tweak this value for your PDFs
      const value = gray > threshold ? 255 : 0;
      imageData.data[i] = value;
      imageData.data[i + 1] = value;
      imageData.data[i + 2] = value;
      // Alpha remains unchanged
    }
    ctx!.putImageData(imageData, 0, 0);

    const worker = await createWorker("eng");
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });

    const result = await worker.recognize(canvas);
    const data = result.data as unknown as TesseractData;
    await worker.terminate();

    // Basic left/right column split using midpoint heuristic
    const lines = data.text.split("\n").filter((l) => l.trim());
    const mid = canvas.width / 2;
    const leftLines: string[] = [];
    const rightLines: string[] = [];

    lines.forEach((line) => {
      if (!data.lines) {
        // If no line data, assume everything goes to left column
        leftLines.push(line);
        return;
      }
      const approxX = data.lines.find((ln: any) => ln.text.trim() === line)?.bbox?.x0;
      if (approxX !== undefined && approxX < mid) leftLines.push(line);
      else rightLines.push(line);
    });

    const join = (arr: string[]) => arr.join("\n");
    const raw = rightLines.length ? join(leftLines) + "\n\n" + join(rightLines) : join(leftLines);
    // Clean special characters
    return raw
      .replace(/^[*+=~|!•·]+/gm, "")
      .replace(/[~*+=!|•·]+/g, "");
  }

  // ---------------------------------------------------------------------
  // Main handler
  // ---------------------------------------------------------------------
  async function handleFile(file: File) {
    setBusy(true);
    setParsed(null);
    setError(null);
    setText("");

    try {
      const doc = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
      let out = "";

      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tContent = await page.getTextContent();
        const pageText = orderTextItems(tContent.items);
        out += "\n" + (pageText.trim() ? pageText : await extractTextFromImage(page));
      }

      const rawText = out.trim();
      setText(rawText);

      // --- send to backend ------------------------------------------------
      const resp = await fetch("/api/resumes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });

      if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
      const parsedData: ParsedResponse = await resp.json();
      setParsed(parsedData);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="block"
      />

      {busy && <p className="text-sm text-gray-600">Extracting…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {text && (
        <details className="bg-gray-50 p-4 rounded">
          <summary className="cursor-pointer font-semibold">Raw Text</summary>
          <pre className="whitespace-pre-wrap mt-2 text-sm">{text}</pre>
        </details>
      )}

      {parsed && (
        <div className="space-y-4">
          <h3 className="font-semibold">Structured Résumé</h3>
          <div>
            <h4 className="font-medium">Experience</h4>
            <ul className="list-disc ml-6 text-sm space-y-1">
              {parsed.experiences.map((exp) => (
                <li key={`${exp.job_title}-${exp.company}`}>{
                  `${exp.job_title} at ${exp.company} ` +
                  (exp.start_date ? `(${exp.start_date} – ${exp.end_date ?? "Present"}, ${exp.duration_years ?? "?"}y)` : "")
                }</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Skills</h4>
            <p className="text-sm">{parsed.skills.join(", ")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
