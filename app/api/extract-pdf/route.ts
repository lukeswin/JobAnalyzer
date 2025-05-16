import { NextRequest, NextResponse } from 'next/server'
import pdfParse from 'pdf-parse'
import { fromBuffer } from 'pdf2pic'
import tesseract from 'node-tesseract-ocr'
import { prisma } from '@/lib/prisma'            // adjust if your path differs
import { randomUUID } from 'crypto'

/** OCR options — tune if you add languages (e.g. 'eng+deu') */
const ocrConfig = { lang: 'eng', oem: 1, psm: 3 }

export async function POST(req: NextRequest) {
  try {
    /* ---------- 1.  read the uploaded file ---------- */
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file || file.type !== 'application/pdf')
      return NextResponse.json(
        { message: 'Please upload a PDF' },
        { status: 400 }
      )

    const pdfBytes = Buffer.from(await file.arrayBuffer())

    /* ---------- 2.  quick text extraction ---------- */
    let plainText = ''
    try {
      plainText = (await pdfParse(pdfBytes)).text.trim()
    } catch {
      /* silently fall back to OCR */
    }

    /* ---------- 3.  OCR fallback for scanned PDFs ---------- */
    if (!plainText) {
      const convert = fromBuffer(pdfBytes, { density: 300, format: 'png' })
      const pages = await convert.bulk(-1, { responseType: 'buffer' })

      for (const page of pages) {
        const buf = page as unknown as Buffer
        const pageText = await tesseract.recognize(buf, ocrConfig)
        plainText += '\n' + pageText
      }
      plainText = plainText.trim()
    }

    /* ---------- 4.  store in SQLite via Prisma ---------- */
    const record = await prisma.resume.create({
      data: {
        id: randomUUID(),
        fileName: file.name,
        content: plainText,
      },
    })

    /* ---------- 5.  respond ---------- */
    return NextResponse.json({ id: record.id, text: plainText }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { message: 'Failed to process PDF' },
      { status: 500 }
    )
  }
}

/* ---- optional: keep this GET if you like quick browser tests ---- */
export async function GET() {
  return NextResponse.json({ ok: true, via: 'GET' })
}
