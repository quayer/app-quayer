/**
 * Builder Cards/Sheet-parse — porta mecânica para oRPC (lote B2 do builder).
 *
 * Origem: ./sheet-parse.routes.ts (1 action).
 *   parseSheet POST /builder/projects/:id/sheet/parse
 *
 * NÃO MIGRA (SSE — fica no Igniter até a fase 4):
 *   submitCard POST /builder/projects/:id/cards/:cardKey/submit — o ACK em
 *   ackMode `conversational` (default) responde buildSseResponse; a URL não
 *   pode ser dividida entre routers, então a action inteira permanece.
 *
 * Parser SSRF-safe reusado 1:1 (parseGoogleSheet); mapa de erros PT-BR
 * copiado. Sem escrita em DB — o org-gate só autoriza a rota.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { loadProject } from '../knowledge/knowledge-helpers'
import {
  parseGoogleSheet,
  SheetParseError,
  type SheetParseErrorKind,
} from './sheet-parse'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// SheetParseError.kind → PT-BR copy — cópia 1:1 de sheet-parse.routes.ts.
// `Record` exaustivo: um novo kind upstream é erro de compilação aqui.
const SHEET_ERROR_COPY: Record<SheetParseErrorKind, string> = {
  invalid_url:
    'Link inválido. Use docs.google.com/spreadsheets/d/<id> (planilha pública).',
  private_or_no_public_link:
    'Planilha privada — compartilhe como "Qualquer pessoa com o link" (leitor).',
  not_found: 'Planilha não encontrada — confira o link.',
  empty: 'Planilha vazia ou sem linhas com nome/preço.',
  too_large:
    'Planilha muito grande. Reduza o número de linhas/colunas e tente de novo.',
  fetch_timeout: 'Tempo esgotado lendo a planilha — tente novamente.',
  fetch_failed: 'Falha ao baixar a planilha do Google.',
  unknown: 'Não consegui ler a planilha. Verifique o link e tente novamente.',
}

// ==========================================
// PARSE SHEET — POST /builder/projects/{id}/sheet/parse
// ==========================================
export const parseSheet = authed
  .route({
    method: 'POST',
    path: '/builder/projects/{id}/sheet/parse',
    summary: 'Parse Google Sheet (Pricing Import)',
  })
  .input(
    z.object({
      id: z.string().uuid('projectId inválido'),
      sheetUrl: z.string().min(1).max(2000),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    // AUTHORIZE: o projeto precisa pertencer à org do caller (loadProject
    // filtra por organizationId) — a rota não pode virar proxy de fetch aberto.
    const project = await loadProject(input.id, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    try {
      const parsed = await parseGoogleSheet(input.sheetUrl)

      return ok({
        headers: parsed.headers,
        // Cinto e suspensório: o FE só precisa de preview (≤50 linhas).
        rows: parsed.rows.slice(0, 50),
        rowCount: parsed.rowCount,
        hasHeader: parsed.hasHeader,
        columnSuggestions: parsed.columnSuggestions,
      })
    } catch (err) {
      if (err instanceof SheetParseError) {
        throw new ORPCError('BAD_REQUEST', { message: SHEET_ERROR_COPY[err.kind] })
      }
      console.warn('[sheetParse] unexpected parse failure:', err)
      throw new ORPCError('BAD_REQUEST', { message: SHEET_ERROR_COPY.unknown })
    }
  })

export const sheetParseActions = {
  parseSheet,
}
