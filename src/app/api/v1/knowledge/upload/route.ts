/**
 * POST /api/v1/knowledge/upload
 *
 * Upload de PDF para a base de conhecimento (RAG). Multipart — por isso é um
 * route handler e não uma rota Igniter (que não trata multipart bem), mesmo
 * padrão do /api/transcribe.
 *
 * Fluxo: valida JWT → resolve projeto (org) → garante a coleção → cria a fonte
 * (type='pdf') → ingestSource(buffer) SÍNCRONO (extrai, chunk, embeda, insere).
 *
 * Auth: JWT direto (middleware exclui /api). Isolamento por currentOrgId.
 */

import { NextRequest, NextResponse } from 'next/server'

import { verifyAccessToken, extractTokenFromHeader } from '@/lib/auth/jwt'
import { getDatabase } from '@/server/services/database'
import { ingestSource } from '@/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service'
import {
  ensureCollectionIdOrThrow,
  loadProject,
} from '@/server/ai-module/builder/knowledge/knowledge-helpers'

export const runtime = 'nodejs'
// Ingestão é síncrona (v1): estende o limite p/ PDFs grandes não cortarem no
// timeout padrão. Migrar p/ job BullMQ remove a necessidade (ver backlog).
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieToken = request.cookies.get('accessToken')?.value
  const headerToken = extractTokenFromHeader(request.headers.get('authorization') ?? '')
  const token = cookieToken ?? headerToken
  const payload = token ? verifyAccessToken(token) : null
  if (!payload) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!payload.currentOrgId) {
    return NextResponse.json({ error: 'no_org_selected' }, { status: 400 })
  }
  const organizationId = payload.currentOrgId

  // ── Multipart ─────────────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
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
  const isPdf =
    fileField.type === 'application/pdf' ||
    fileField.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    return NextResponse.json({ error: 'only_pdf_supported' }, { status: 415 })
  }

  // ── Valida assinatura real do PDF (magic bytes %PDF) ANTES de tocar no DB ─────
  // Content-Type/extensão são client-controlled; sem isto, lixo binário spoofado
  // como .pdf vira buffer alocado + parse + linha de erro no DB (DoS barato).
  const buffer = Buffer.from(await fileField.arrayBuffer())
  if (buffer.length < 5 || buffer.toString('latin1', 0, 5) !== '%PDF-') {
    return NextResponse.json({ error: 'invalid_pdf_signature' }, { status: 415 })
  }

  // ── Projeto + coleção ───────────────────────────────────────────────────────
  const project = await loadProject(projectId, organizationId)
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 })
  }

  let collectionId: string
  try {
    collectionId = await ensureCollectionIdOrThrow(project, organizationId)
  } catch (err) {
    console.error('[knowledge/upload] ensureCollection falhou:', err)
    return NextResponse.json({ error: 'collection_unavailable' }, { status: 503 })
  }

  // ── Cria a fonte + ingestão síncrona ─────────────────────────────────────────
  const db = getDatabase()
  const source = await db.knowledgeSource.create({
    data: {
      collectionId,
      organizationId,
      type: 'pdf',
      source: fileField.name,
      status: 'pending',
    },
    select: { id: true },
  })

  const result = await ingestSource(source.id, {
    buffer,
    expectedOrganizationId: organizationId,
  })

  if (result.status === 'error') {
    return NextResponse.json(
      { sourceId: source.id, status: 'error', error: result.error },
      { status: 422 },
    )
  }

  return NextResponse.json({
    sourceId: source.id,
    status: result.status,
    chunkCount: result.chunkCount,
  })
}
