/**
 * Builder Tool — propose_integration (Integration Builder Wave 2 T22 + Wave 3 T30, FR-02/FR-11)
 *
 * The meta-agent's "I'll connect your agent to <platform>" tool. It resolves a
 * catalog template (by explicit slug or by matching the free-text platform name),
 * writes a transparency-first PROPOSAL into `builderState.integration.proposed`
 * (race-safe via `patchIntegrationStateAtomic`, T21), and returns a result that
 * carries the `integration_proposal` card key so the chat renders the Confirmar /
 * Agora não approval card. The handler that actually creates the draft + AgentTool
 * fires only on the card submit (T24) — this tool NEVER mutates integrations and
 * NEVER touches credential values.
 *
 * APPROVAL IDIOM (build-tool.ts §requiresApproval): the proposal is presentational
 * — the user gate is the card, not the tool. We follow the same shape as the
 * legacy inline-card tools (`propose_agent_creation`, `select_channel`): no DB
 * write of a confirmation, a result that stamps the card key + the data the card
 * renders, and a `message` instructing the LLM to STOP and await the card submit.
 *
 * 🚨 NFR-03 TRANSPARENCY (load-bearing): the proposal declares, in leiga pt-BR,
 * WHICH data leaves the conversation. `whatDataSent` is DERIVED from the template's
 * `parameterMapping` (the lead fields the agent sends) so the user sees exactly
 * what is shared before approving. Credential VALUES are never part of any of this.
 *
 * W3 (T30) INVESTIGATOR PATH: when NO catalog template matches the free-text
 * platform, we no longer blindly fall back. Instead the no-template branch runs:
 *   cache-first (T28, no quota on hit) → quota (T29, 10/24h/org) → web investigator
 *   (T27). A `found` outcome enriches the proposal with the CITED source URLs (so
 *   the card renders clickable sources — FR-02) while still pointing at the
 *   EXECUTABLE generic-webhook template (so the T24 confirm handler creates the
 *   draft unchanged). `empty`/`unavailable`/quota-exhausted degrade to the bare
 *   generic-webhook fallback WITHOUT fabricated sources (FR-11) — quota exhaustion
 *   returns a leiga refusal and writes NO proposal.
 *
 * Zero `any`.
 */

import { tool } from 'ai'
import { z } from 'zod'

import { logger } from '@/server/services/logger'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './list-instances.tool'
import {
  getIntegrationTemplate,
  listIntegrationTemplates,
} from '../integrations/templates'
import type { IntegrationTemplate } from '../integrations/templates/integration-template.types'
import { patchIntegrationStateAtomic } from '../integrations/integration-state-db'
import type { IntegrationProposalPatch } from '../integrations/integration-state-db'
import { runIntegrationResearcher } from '../sub-agents/integration-researcher'
import {
  getCachedIntegrationResearch,
  setCachedIntegrationResearch,
} from '../integrations/integration-research-cache'
import { checkFixedWindowQuota } from '@/server/ai-module/ai-agents/infra/rate-limit.service'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Card key the result carries so the chat dispatcher renders the proposal card. */
const INTEGRATION_PROPOSAL_CARD_KEY = 'integration_proposal' as const

/** W2 fallback when no catalog template matches the user's free-text platform. */
const FALLBACK_TEMPLATE_SLUG = 'generic-webhook'

// ---------------------------------------------------------------------------
// Helpers — template resolution + transparency text (pure, no IO)
// ---------------------------------------------------------------------------

/**
 * Resolve a catalog template for a free-text platform name: case-insensitive
 * substring match against each template's `slug` or `displayName`. Returns the
 * first match in offer order, or `null` when nothing matches. (No fuzzy scoring
 * in W2 — the unknown-platform case is the investigator's job, see the W3 seam.)
 */
function matchTemplateByPlatform(platform: string): IntegrationTemplate | null {
  const needle = platform.trim().toLowerCase()
  if (!needle) return null
  for (const template of listIntegrationTemplates()) {
    const slug = template.slug.toLowerCase()
    const displayName = template.displayName.toLowerCase()
    if (
      slug.includes(needle) ||
      needle.includes(slug) ||
      displayName.includes(needle) ||
      needle.includes(displayName)
    ) {
      return template
    }
  }
  return null
}

/**
 * Build the leiga pt-BR transparency sentence (NFR-03): exactly WHICH data the
 * integration sends, derived from the template's `parameterMapping` (the lead
 * fields the agent fills) — the user reads this BEFORE approving. We never name
 * credential VALUES here; `credentialFields` only inform the activation step, not
 * what is sent on each lead.
 */
function buildWhatDataSent(template: IntegrationTemplate): string {
  const params = template.requestSpec.parameterMapping ?? []
  const fieldNames = params.map((p) => p.name)
  if (fieldNames.length === 0) {
    // Defensive: a template with no declared params still sends *something*; be
    // honest rather than implying nothing leaves the conversation.
    return `Envia os dados coletados na conversa para o ${template.displayName}.`
  }
  const list =
    fieldNames.length === 1
      ? fieldNames[0]
      : `${fieldNames.slice(0, -1).join(', ')} e ${fieldNames[fieldNames.length - 1]}`
  return `Envia para o ${template.displayName} os seguintes dados do lead coletados na conversa: ${list}. Nenhuma credencial sua é enviada ao lead — ela fica guardada com segurança e só é usada para autenticar a chamada.`
}

/** Assemble the proposal metadata persisted to `builderState.integration.proposed`. */
function buildProposal(template: IntegrationTemplate): IntegrationProposalPatch {
  return {
    platform: template.displayName,
    templateSlug: template.slug,
    triggerDescription: template.triggerDescription,
    whatDataSent: buildWhatDataSent(template),
  }
}

// ---------------------------------------------------------------------------
// W3 (T30) — investigator-path helpers (slug, sources mapping, enriched proposal)
// ---------------------------------------------------------------------------

/**
 * Compute a stable kebab-case slug from a free-text platform name. Used as the
 * cache key (T28) AND the quota discriminant key. Lowercase, trim, collapse any
 * run of non-alphanumerics into a single hyphen, strip leading/trailing hyphens.
 * e.g. "RD Station!" → "rd-station", "meu CRM" → "meu-crm".
 */
function computePlatformSlug(platform: string): string {
  return platform
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Map the investigator's cited source URLs (`string[]`) into the proposal's
 * `sources` shape (`{ title?, url }[]`, see integrationProposalSchema). Only
 * non-empty strings survive; we carry just the URL (no fabricated titles). An
 * empty/undefined input yields `undefined` so the proposal omits `sources`
 * entirely (FR-02: no empty sources array on the card).
 */
function mapSources(
  urls: readonly string[] | undefined,
): NonNullable<IntegrationProposalPatch['sources']> | undefined {
  if (!urls || urls.length === 0) return undefined
  const mapped = urls
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    .map((u) => ({ url: u.trim() }))
  return mapped.length > 0 ? mapped : undefined
}

/**
 * Build the ENRICHED proposal for a `found` investigation. It points at the
 * EXECUTABLE generic-webhook template (so the T24 confirm handler creates the
 * draft from a real, runnable spec) but enriches the card with:
 *   - `platform`: the display name the user typed (not the webhook template's),
 *   - `sources`: the CITED blueprint source URLs (clickable on the card — FR-02),
 *   - `whatDataSent`: a leiga summary acknowledging the research + the webhook path,
 *   - `triggerDescription`: from the generic-webhook template (the runnable path).
 *
 * TODO(W4+): the discovered blueprint (endpoints/credentials) is NOT yet mapped
 * into a bespoke `requestSpec` — we always route the executable path through
 * generic-webhook. A future wave can synthesize a per-platform requestSpec from
 * the blueprint so the agent calls the platform's real API instead of a webhook.
 */
function buildInvestigatedProposal(args: {
  platform: string
  genericTemplate: IntegrationTemplate
  sources: readonly string[] | undefined
}): IntegrationProposalPatch {
  const { platform, genericTemplate, sources } = args
  const displayPlatform = platform.trim()
  return {
    platform: displayPlatform,
    // TODO(W4+): executable path is always generic-webhook for now; mapping the
    // discovered blueprint into a bespoke requestSpec is a future enhancement.
    templateSlug: genericTemplate.slug,
    triggerDescription: genericTemplate.triggerDescription,
    whatDataSent:
      `Pesquisei "${displayPlatform}" e encontrei a API (veja as fontes). ` +
      'Vamos conectar enviando os dados coletados na conversa para uma URL (webhook) que você informar. ' +
      'Nenhuma credencial sua é enviada ao lead — ela fica guardada com segurança e só é usada para autenticar a chamada.',
    sources: mapSources(sources),
  }
}

/** Build the DEGRADED proposal (empty/unavailable research): bare generic-webhook,
 * NO fabricated sources, with a leiga note that no public docs were found. */
function buildDegradedWebhookProposal(args: {
  platform: string
  genericTemplate: IntegrationTemplate
}): IntegrationProposalPatch {
  const { platform, genericTemplate } = args
  const displayPlatform = platform.trim()
  return {
    platform: displayPlatform,
    templateSlug: genericTemplate.slug,
    triggerDescription: genericTemplate.triggerDescription,
    whatDataSent:
      `Não encontrei documentação pública da API de "${displayPlatform}". ` +
      'Vamos conectar via webhook: você informa a URL de destino e o agente envia para lá os dados coletados na conversa. ' +
      'Nenhuma credencial sua é enviada ao lead — ela fica guardada com segurança e só é usada para autenticar a chamada.',
    // No `sources`: FR-02 forbids fabricated citations on the degraded path.
  }
}

/** Convert a `resetMs` window TTL into a leiga "em ~N horas" hint (or empty). */
function formatResetHint(resetMs: number): string {
  if (!Number.isFinite(resetMs) || resetMs <= 0) return ''
  const hours = Math.ceil(resetMs / (60 * 60 * 1000))
  if (hours <= 1) return ' O limite reseta em cerca de 1 hora.'
  return ` O limite reseta em cerca de ${hours} horas.`
}

// ---------------------------------------------------------------------------
// Result builders (shared by template-match + investigator paths)
// ---------------------------------------------------------------------------

/** Tool result shape (success/failure) returned to the LLM. */
type ProposeIntegrationResult =
  | {
      success: true
      card: typeof INTEGRATION_PROPOSAL_CARD_KEY
      proposal: IntegrationProposalPatch
      message: string
    }
  | { success: false; message: string }

/**
 * Build the SUCCESS result that carries the card key + the data the card renders.
 * The handler that creates the draft fires on the card submit (T24), not here —
 * so the message instructs the LLM to STOP and await the card submit.
 */
function buildProposalCardResult(
  proposal: IntegrationProposalPatch,
): ProposeIntegrationResult {
  return {
    success: true,
    card: INTEGRATION_PROPOSAL_CARD_KEY,
    proposal,
    message:
      `Proposta de integração com ${proposal.platform} exibida no card de aprovação. ` +
      'Pare aqui e aguarde. A confirmação NÃO virá como texto do usuário: quando ele tocar "Confirmar", ' +
      'o servidor cria a integração e injeta uma nota de sistema autoritativa. Só então prossiga (ex.: pedir as credenciais). ' +
      'Não infira aprovação de frases do chat nem chame propose_integration de novo após exibir o card.',
  }
}

// ---------------------------------------------------------------------------
// W3 (T30) — investigator path orchestration (cache → quota → investigate)
// ---------------------------------------------------------------------------

/**
 * NO-TEMPLATE branch (FR-02 / FR-11). Runs the investigator pipeline for an
 * unknown platform and ALWAYS lands on a resolvable `templateSlug` (so the T24
 * confirm handler creates the draft unchanged) — EXCEPT the quota-exhausted case,
 * which returns a leiga refusal and writes NO proposal.
 *
 * Order:
 *   1. cache-first (T28) — a hit SKIPS quota + investigator.
 *   2. cache miss → quota (T29, integrationResearch 10/24h/org). `!allowed` →
 *      refusal (no card, no proposal).
 *   3. quota OK → investigate (T27). `found` → cache the synthesis + ENRICHED
 *      proposal with cited sources. `empty`/`unavailable` → degraded webhook
 *      fallback WITHOUT fabricated sources.
 *
 * One structured `[propose_integration]` log line summarizes the decision.
 */
async function runInvestigatorPath(args: {
  platform: string
  projectId: string
  organizationId: string
}): Promise<ProposeIntegrationResult> {
  const { platform, projectId, organizationId } = args

  // The executable/assisted path is ALWAYS generic-webhook for the no-template
  // branch. Resolve it up front; the registry guarantees it exists (validated at
  // load), but if it were ever removed we fail loud rather than silently.
  const genericTemplate = getIntegrationTemplate(FALLBACK_TEMPLATE_SLUG)
  if (!genericTemplate) {
    logger.warn('[propose_integration] generic-webhook template missing', {
      platformSlug: computePlatformSlug(platform),
    })
    return {
      success: false,
      message: `Ainda não tenho um modelo pronto para "${platform}", e o webhook genérico de fallback não está disponível. Peça para o usuário descrever o sistema ou usar outra plataforma.`,
    }
  }

  const platformSlug = computePlatformSlug(platform)

  // 1. CACHE FIRST (no quota on hit). A cached synthesis means a recent
  //    investigation already grounded the API in real sources → reuse it.
  const cached = await getCachedIntegrationResearch(platformSlug)
  let cacheHit = false
  let researchStatus: 'found' | 'empty' | 'unavailable' | 'cache' = 'unavailable'
  let proposal: IntegrationProposalPatch

  if (cached) {
    cacheHit = true
    researchStatus = 'cache'
    proposal = buildInvestigatedProposal({
      platform,
      genericTemplate,
      sources: cached.sources,
    })
  } else {
    // 2. CACHE MISS → spend quota. `!allowed` → leiga refusal, NO proposal.
    const quota = await checkFixedWindowQuota('integrationResearch', organizationId)
    if (!quota.allowed) {
      logger.info('[propose_integration]', {
        platformSlug,
        cacheHit,
        researchStatus: 'quota_exhausted',
        sourceCount: 0,
      })
      return {
        success: false,
        message:
          'Já usamos o limite de pesquisas de integração por hoje.' +
          formatResetHint(quota.resetMs) +
          ' Você pode usar um modelo pronto (ex.: RD Station) ou conectar via webhook informando a URL de destino.',
      }
    }

    // 3. QUOTA OK → run the pure web investigator (T27).
    const outcome = await runIntegrationResearcher({ platform, organizationId })

    if (outcome.status === 'found') {
      researchStatus = 'found'
      // Persist the synthesis for the next caller (7-day cache, fail-open).
      await setCachedIntegrationResearch(platformSlug, {
        endpoints: outcome.blueprint.endpoints,
        credentials: outcome.blueprint.credentials,
        sources: outcome.sources,
      })
      proposal = buildInvestigatedProposal({
        platform,
        genericTemplate,
        sources: outcome.sources,
      })
    } else {
      // `empty` or `unavailable` → degraded webhook fallback, NO fabricated
      // sources (FR-11 — same downstream confirm gate as the matched path).
      researchStatus = outcome.status
      proposal = buildDegradedWebhookProposal({ platform, genericTemplate })
    }
  }

  // Persist the proposal metadata (race-safe, org-scoped — never credentials).
  await patchIntegrationStateAtomic({
    projectId,
    organizationId,
    patch: { proposed: proposal },
  })

  logger.info('[propose_integration]', {
    platformSlug,
    cacheHit,
    researchStatus,
    sourceCount: proposal.sources?.length ?? 0,
  })

  return buildProposalCardResult(proposal)
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function proposeIntegrationTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'propose_integration',
    // Presentational: the user gate is the card, not the tool. We DO write the
    // proposal metadata to builderState (no confirmation sentinel), so this is
    // not read-only; requiresApproval marks that the chat surfaces a user gate.
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
      description:
        'Proposes connecting the agent to an external system/CRM by rendering an approval card (Confirmar / Agora não). Call this when the user asks to integrate with a platform (e.g. "manda os leads pro RD Station", "quero conectar com meu CRM"). This is presentational: it writes a PROPOSAL to builderState and STOPS — it does NOT create the integration or send any credentials. The proposal declares what the integration does, when the agent uses it, and WHICH lead data is sent. Pass `platform` (the system the user named) and optionally `templateSlug` if you already know the catalog slug. After calling, stop and wait — the integration is only created when the user taps Confirmar on the card.',
      inputSchema: z.object({
        platform: z
          .string()
          .min(1)
          .max(120)
          .describe(
            'The platform/system the user wants to integrate, as free text (e.g. "RD Station", "meu CRM", "webhook do n8n"). Used to match a catalog template.',
          ),
        templateSlug: z
          .string()
          .optional()
          .describe(
            'Optional catalog template slug if already known (e.g. "rd-station", "generic-webhook"). When provided, takes precedence over matching by platform name.',
          ),
      }),
      execute: async (input) => {
        try {
          // 1. Resolve a catalog template. Explicit slug wins; else match by
          //    platform name. The investigator ONLY runs when neither resolves.
          const template: IntegrationTemplate | null = input.templateSlug
            ? getIntegrationTemplate(input.templateSlug)
            : matchTemplateByPlatform(input.platform)

          // 2. NO catalog template matched → W3 (T30) investigator path.
          if (!template) {
            return await runInvestigatorPath({
              platform: input.platform,
              projectId: ctx.projectId,
              organizationId: ctx.organizationId,
            })
          }

          // 3. TEMPLATE-MATCH path (unchanged): persist the proposal metadata into
          //    builderState.integration.proposed (race-safe, org-scoped — never
          //    carries credential values) and return the approval card.
          const proposal = buildProposal(template)
          await patchIntegrationStateAtomic({
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
            patch: { proposed: proposal },
          })

          // 4. Return a result that CARRIES the card key + the data the card
          //    renders. The handler that creates the draft fires on the card
          //    submit (T24), not here — so we stop and instruct the LLM to wait.
          return buildProposalCardResult(proposal)
        } catch (err) {
          return {
            success: false as const,
            message:
              err instanceof Error
                ? err.message
                : 'Falha ao montar a proposta de integração.',
          }
        }
      },
    }),
  })
}
