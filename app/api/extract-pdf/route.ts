// app/api/extract-pdf/route.ts
import { NextResponse } from 'next/server'
export const runtime = 'nodejs'

export async function POST() {
  return NextResponse.json({ ok: true })
}