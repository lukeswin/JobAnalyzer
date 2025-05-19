"use client";

import { useState } from "react";

/* The Webpack-ready bundle — worker is bundled automatically */
import * as pdfjsLib from "pdfjs-dist/webpack";

/* One optional type for nicer IntelliSense */
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export default function PdfTextExtractor() {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

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
      out +=
        "\n" +
        tContent.items
          .map((i: TextItem) => i.str)
          .join("");
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
