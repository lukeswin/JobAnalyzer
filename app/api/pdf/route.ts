import { NextRequest, NextResponse } from 'next/server'
import pdf from 'pdf-parse'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided or invalid file type' },
        { status: 400 }
      )
    }

    // Convert the file to a Buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Parse the PDF
    const data = await pdf(buffer)
    
    return NextResponse.json({ 
      text: data.text,
      pages: data.numpages,
      info: {
        Title: data.info?.Title || '',
        Author: data.info?.Author || '',
        Subject: data.info?.Subject || '',
        Keywords: data.info?.Keywords || '',
        CreationDate: data.info?.CreationDate || '',
        ModDate: data.info?.ModDate || '',
        Producer: data.info?.Producer || '',
        Creator: data.info?.Creator || ''
      }
    })
  } catch (error) {
    console.error('Error processing PDF:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process PDF' },
      { status: 500 }
    )
  }
} 