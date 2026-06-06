/**
 * Builder Module — Google Sheets parse route (Onda B, G3 — sheet import)
 *
 * `POST /builder/projects/:id/sheet/parse`
 *
 * Thin, STATELESS orchestrator that exposes the SSRF-safe G3 parser
 * (`parseGoogleSheet`) inside the EXISTING `builder` controller. The flow:
 *   1. Authenticate + scope by tenant (mirrors card-submit/sources guards).
 *   2. UUID-guard the path `:id` and AUTHORIZE that the project belongs to the
 *      caller's org (loadProject filters by organizationId). The parse itself is
 *      org-agnostic — it reads a PUBLIC published sheet — but we still gate the
 *      route on a project the caller owns so it can't be used as an open proxy.
 *   3. Validate the body (`sheetUrl`).
 *   4. Delegate to `parseGoogleSheet` (allowlist docs.google.com/spreadsheets
 *      ONLY, CSV gviz export, fetch timeout, byte cap, row cap — all in the pure
 *      helper). On a typed `SheetParseError`, map `.kind` → PT-BR copy via
 *      `response.badRequest`. Any unexpected throw → generic badRequest.
 *   5. Return the parse result for the FE column mapper: { headers, rows
 *      (preview ≤ 50), rowCount, hasHeader, columnSuggestions }.
 *
 * NO DB WRITE. The mapped/populated pricing table is persisted later via the
 * existing card-submit flow (POST /cards/pricing/submit) — this route only
 * reads + parses.
 *
 * Composed into builder.controller.ts via `...sheetParseRoutes` (this file does
 * NOT touch the controller nor src/igniter.router.ts — the builder controller is
 * already registered there). Protected route — noted in docs/AUTH_MAP.md.
 */

import { z } from 'zod'

import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'

import { loadProject } from '../knowledge/knowledge-helpers'
import {
  parseGoogleSheet,
  SheetParseError,
  type SheetParseErrorKind,
} from './sheet-parse'

// ---------------------------------------------------------------------------
// Local utilities (mirror card-submit.routes.ts / sources.routes.ts guards)
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AuthedUser {
  id: string
  currentOrgId?: string | null
}

function getUser(context: unknown): AuthedUser | null {
  const ctx = context as {
    auth?: { session?: { user?: AuthedUser } }
  } | null
  return ctx?.auth?.session?.user ?? null
}

// ---------------------------------------------------------------------------
// Input schema — the public Google Sheets URL to parse
// ---------------------------------------------------------------------------

const sheetParseBodySchema = z.object({
  sheetUrl: z.string().min(1).max(2000),
})

// ---------------------------------------------------------------------------
// SheetParseError.kind → PT-BR copy (Orayon error taxonomy)
//
// Exhaustive `Record` so adding a new kind upstream is a compile error here.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// parseSheet — stateless parse of a public Google Sheets URL
// ---------------------------------------------------------------------------

const parseSheet = igniter.mutation({
  name: 'Parse Google Sheet (Pricing Import)',
  description:
    'Parse a PUBLIC Google Sheets URL (CSV gviz export, SSRF-safe allowlist docs.google.com/spreadsheets only) and return detected headers, a row preview (≤50), the full row count, a hasHeader flag, and per-column role suggestions (servico/preco/categoria) for the FE column mapper. STATELESS — no DB write; the org gate only authorizes the route.',
  path: '/projects/:id/sheet/parse' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: sheetParseBodySchema,
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }
    const organizationId = user.currentOrgId

    // UUID guard on the path param (same idiom as sources.routes.ts).
    const { id: projectId } = request.params as { id: string }
    if (!projectId || !UUID_REGEX.test(projectId)) {
      return response.badRequest('projectId inválido')
    }

    // Body validation (re-parse so the resolved type is the OUTPUT shape).
    const parsedBody = sheetParseBodySchema.safeParse(request.body)
    if (!parsedBody.success) {
      return response.badRequest('Corpo inválido (sheetUrl)')
    }
    const { sheetUrl } = parsedBody.data

    // AUTHORIZE: the project must belong to the caller's org. loadProject filters
    // by organizationId, so a foreign/unknown id resolves to null → not found.
    // The parse is org-agnostic (public sheet), but the route stays gated so it
    // can't be abused as an open fetch proxy.
    const project = await loadProject(projectId, organizationId)
    if (!project) return response.notFound('Projeto não encontrado')

    // Delegate to the SSRF-safe pure parser. All network hardening (single-host
    // allowlist, timeout, byte cap, row cap) lives in the helper.
    try {
      const parsed = await parseGoogleSheet(sheetUrl)

      return response.success({
        headers: parsed.headers,
        // Defensive belt-and-suspenders cap: the FE only ever needs a preview.
        // The helper already caps, but we never want to ship >50 rows over the
        // wire even if the helper contract drifts.
        rows: parsed.rows.slice(0, 50),
        rowCount: parsed.rowCount,
        hasHeader: parsed.hasHeader,
        columnSuggestions: parsed.columnSuggestions,
      })
    } catch (err) {
      // Typed parse failures → friendly PT-BR copy, by kind.
      if (err instanceof SheetParseError) {
        return response.badRequest(SHEET_ERROR_COPY[err.kind])
      }
      // Anything unexpected (never the request thread's fault to leak details).
      console.warn('[sheetParse] unexpected parse failure:', err)
      return response.badRequest(SHEET_ERROR_COPY.unknown)
    }
  },
})

// ---------------------------------------------------------------------------
// Export composition (spread into builder.controller via `...sheetParseRoutes`)
// ---------------------------------------------------------------------------

export const sheetParseRoutes = {
  parseSheet,
}
