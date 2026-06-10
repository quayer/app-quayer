/**
 * GET /api/v1/files/{bucket}/{...key} — serve arquivos do storage local (VPS).
 *
 * Contraparte de leitura do driver `local` em src/server/services/storage.ts:
 * o driver grava em `STORAGE_LOCAL_ROOT` e gera links públicos apontando para
 * esta rota via PUBLIC_STORAGE_BASE_URL. Público-por-link by design (keys
 * não-adivinháveis sha256/uuid) — equivalente prático da signed URL Supabase.
 *
 * Guards: só buckets conhecidos (BUCKETS) e path resolvido DENTRO do root
 * (resolveLocalStoragePath lança em traversal).
 */
import { createReadStream } from 'fs'
import { promises as fs } from 'fs'
import { Readable } from 'stream'
import { NextRequest, NextResponse } from 'next/server'
import { BUCKETS, resolveLocalStoragePath } from '@/server/services/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
}

const KNOWN_BUCKETS = new Set<string>(Object.values(BUCKETS))

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params
  if (!segments || segments.length < 2) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [bucket, ...keyParts] = segments.map((s) => decodeURIComponent(s))
  const key = keyParts.join('/')
  if (!KNOWN_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let filePath: string
  try {
    filePath = resolveLocalStoragePath(bucket, key)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let stat
  try {
    stat = await fs.stat(filePath)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!stat.isFile()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': String(stat.size),
      // Keys são content-addressed (sha256) ou imutáveis por upload — cache 1 dia.
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
