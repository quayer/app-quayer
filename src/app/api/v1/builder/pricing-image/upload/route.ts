/**
 * POST /api/v1/builder/pricing-image/upload
 *
 * Upload de imagem por serviço do card de preço (catálogo visual — G5b da Onda B).
 * Multipart — por isso é um route handler e não uma rota Igniter (que não trata
 * multipart bem), mesmo padrão de /api/v1/knowledge/upload e /api/transcribe.
 *
 * Fluxo: valida JWT → resolve projeto (org) → valida assinatura real da imagem
 * (magic bytes) → sobe para BUCKETS.MEDIA → devolve URL assinada.
 *
 * Auth: JWT direto (middleware exclui /api). Isolamento por currentOrgId.
 *
 * Se o storage não estiver configurado (storage.isAvailable() === false), retorna
 * 503 'storage_unavailable' — o FE cai no fallback de colar a URL pronta.
 */

import { randomUUID } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import { verifyAccessToken, extractTokenFromHeader } from '@/lib/auth/jwt'
import { loadProject } from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import { BUCKETS, storage } from '@/server/services/storage'
import { sniffImage } from '@/lib/images/sniff-image'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

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

  // ── Storage disponível? (senão FE cai no fallback de colar URL) ──────────────
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
  if (fileField.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }

  // ── Rejeita cedo o que claramente não é imagem (declared type) ───────────────
  // Content-Type é client-controlled (a checagem dura é o sniff abaixo), mas se o
  // cliente já declara um tipo não-imagem, devolvemos 'unsupported_image' antes de
  // alocar/ler o buffer.
  const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  if (fileField.type && !ACCEPTED.has(fileField.type.toLowerCase())) {
    return NextResponse.json({ error: 'unsupported_image' }, { status: 415 })
  }

  // ── Valida assinatura real da imagem (magic bytes) ANTES de subir ────────────
  const buffer = Buffer.from(await fileField.arrayBuffer())
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }
  const kind = sniffImage(buffer)
  if (!kind) {
    return NextResponse.json({ error: 'invalid_image_signature' }, { status: 415 })
  }

  // ── Projeto (org guard) ──────────────────────────────────────────────────────
  const project = await loadProject(projectId, organizationId)
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }

  // ── Upload + URL assinada ────────────────────────────────────────────────────
  const path = `pricing/${organizationId}/${projectId}/${randomUUID()}.${kind.ext}`
  try {
    await storage.upload(BUCKETS.MEDIA, path, buffer, {
      contentType: kind.contentType,
      upsert: true,
    })
    const imageUrl = await storage.getSignedUrl(BUCKETS.MEDIA, path)
    return NextResponse.json({ imageUrl })
  } catch (err) {
    console.error('[builder/pricing-image/upload] falha no storage:', err)
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 })
  }
}
