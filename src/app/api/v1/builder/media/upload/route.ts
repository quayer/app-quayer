/**
 * POST /api/v1/builder/media/upload
 *
 * Fase E (E1) — Upload generalizado do CATÁLOGO DE MÍDIA enviável pelo agente
 * (foto/vídeo/PDF — NÃO áudio). O dono sobe mídias (cardápio PDF, vídeo de tour,
 * foto) e o agente, no meio da conversa, RECUPERA via tool `buscar_media` e o
 * outbound existente envia no WhatsApp. Esta rota é só ingestão — não envia nada.
 *
 * Clone generalizado de /api/v1/builder/pricing-image/upload: multipart (por isso
 * route handler, não Igniter — o catch-all v1/[[...all]] não trata multipart bem;
 * o middleware já exclui /api). Diferenças vs. pricing-image:
 *   - mediaType é INFERIDO do sniff (server-authoritative; cliente NÃO escolhe).
 *   - caps por tipo: imagem 5MB, vídeo 16MB, documento(PDF) 100MB.
 *   - persiste um MediaAsset (source='upload', confirmedAt=now → já visível ao runtime).
 *
 * Fluxo: valida JWT → exige currentOrgId → storage disponível → multipart →
 * rejeição cedo por declared type → cap global pré-sniff → magic-bytes (sniffMedia)
 * → cap específico do tipo → resolve projeto+coleção → sobe em BUCKETS.MEDIA →
 * cria MediaAsset → devolve { assetId, mediaType, signedUrl }.
 *
 * Auth: JWT direto (cookie accessToken ou Bearer). Isolamento por currentOrgId.
 */

import { randomUUID } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import { verifyAccessToken, extractTokenFromHeader } from '@/lib/auth/jwt'
import { sniffMedia, type MediaKind } from '@/lib/media/sniff-media'
import {
  loadProject,
  ensureCollectionIdOrThrow,
} from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import { database } from '@/server/services/database'
import { BUCKETS, storage } from '@/server/services/storage'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Cap por tipo (limites do WhatsApp). */
const CAPS_BY_TYPE: Record<MediaKind['mediaType'], number> = {
  image: 5 * 1024 * 1024, // 5 MB
  video: 16 * 1024 * 1024, // 16 MB
  document: 100 * 1024 * 1024, // 100 MB
}

/** Cap máximo global (= maior cap por tipo): pré-checagem antes do sniff. */
const MAX_GLOBAL_BYTES = Math.max(...Object.values(CAPS_BY_TYPE))

/**
 * Tipos declarados aceitos por família. Content-Type é client-controlled — esta é
 * só a rejeição CEDO (a checagem dura é o sniff de magic-bytes abaixo).
 */
const ACCEPTED_DECLARED = new Set<string>([
  // image
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  // document
  'application/pdf',
])

/** CSV de tags → array trim/dedupe/lowercase (descarta vazias). */
function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const tag = part.trim().toLowerCase()
    if (tag) seen.add(tag)
  }
  return [...seen]
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieToken = req.cookies.get('accessToken')?.value
  const headerToken = extractTokenFromHeader(req.headers.get('authorization') ?? '')
  const token = cookieToken ?? headerToken
  const payload = token ? verifyAccessToken(token) : null
  if (!payload) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!payload.currentOrgId) {
    return NextResponse.json({ error: 'no_org_selected' }, { status: 400 })
  }
  const organizationId = payload.currentOrgId

  // ── Storage disponível? ──────────────────────────────────────────────────────
  if (!storage.isAvailable()) {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 })
  }

  // ── Multipart ─────────────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid_multipart_body' }, { status: 400 })
  }

  const projectId = formData.get('projectId')
  if (typeof projectId !== 'string' || !projectId) {
    return NextResponse.json({ error: 'missing_projectId' }, { status: 400 })
  }

  const fileField = formData.get('file')
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: 'missing_file' }, { status: 400 })
  }

  // Metadados opcionais (mediaType NÃO é aceito do cliente — é inferido do sniff).
  const captionRaw = formData.get('caption')
  const caption = typeof captionRaw === 'string' && captionRaw.trim() ? captionRaw.trim() : null

  const categoryRaw = formData.get('category')
  const category =
    typeof categoryRaw === 'string' && categoryRaw.trim() ? categoryRaw.trim() : null

  const tagsRaw = formData.get('tags')
  const tags = typeof tagsRaw === 'string' ? parseTags(tagsRaw) : []

  // ── Rejeição cedo por declared type (antes de alocar o buffer) ───────────────
  // Se o cliente já declara um tipo fora das famílias suportadas, devolve 415.
  if (fileField.type && !ACCEPTED_DECLARED.has(fileField.type.toLowerCase())) {
    return NextResponse.json({ error: 'unsupported_media' }, { status: 415 })
  }

  // ── Cap global na pré-checagem por size (o cap específico depende do tipo) ────
  if (fileField.size > MAX_GLOBAL_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }

  // ── Magic-bytes (server-authoritative): infere o mediaType real ──────────────
  const buffer = Buffer.from(await fileField.arrayBuffer())
  if (buffer.length > MAX_GLOBAL_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }
  const kind = sniffMedia(buffer)
  if (!kind) {
    return NextResponse.json({ error: 'invalid_media_signature' }, { status: 415 })
  }

  // ── Cap específico do mediaType inferido ─────────────────────────────────────
  if (buffer.length > CAPS_BY_TYPE[kind.mediaType]) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }

  // ── Projeto (org guard) ──────────────────────────────────────────────────────
  const project = await loadProject(projectId, organizationId)
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }

  // ── Coleção do projeto (cria a kb:projectId se ainda não existe — FK NOT NULL) ─
  let collectionId: string
  try {
    collectionId = await ensureCollectionIdOrThrow(project, organizationId)
  } catch (err) {
    console.error('[builder/media/upload] falha ao resolver coleção:', err)
    return NextResponse.json({ error: 'collection_unavailable' }, { status: 503 })
  }

  // ── Upload + persistência do MediaAsset ──────────────────────────────────────
  // Chave usa collectionId (FK real do catálogo), não projectId.
  const path = `media/${organizationId}/${collectionId}/${randomUUID()}.${kind.ext}`
  try {
    await storage.upload(BUCKETS.MEDIA, path, buffer, {
      contentType: kind.contentType,
      upsert: true,
    })
  } catch (err) {
    console.error('[builder/media/upload] falha no storage:', err)
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 })
  }

  const asset = await database.mediaAsset.create({
    data: {
      organizationId,
      collectionId,
      mediaType: kind.mediaType,
      storageKey: path, // upload sempre assina on-read (nunca externalUrl)
      mimeType: kind.contentType,
      caption,
      tags,
      category,
      source: 'upload',
      sourceRef: null, // uploads têm sourceRef NULL → @@unique(source,sourceRef) permite N
      sizeBytes: buffer.length,
      position: 0,
      confirmedAt: new Date(), // upload é intencional → já visível ao runtime
    },
    select: { id: true, mediaType: true },
  })

  // Signed URL só para o FE pré-visualizar — NUNCA persiste.
  const signedUrl = await storage.getSignedUrl(BUCKETS.MEDIA, path)

  return NextResponse.json({
    assetId: asset.id,
    mediaType: asset.mediaType,
    signedUrl,
  })
}
