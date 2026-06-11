/**
 * Builder Module — Integration card handlers (Integration Builder W2, T24)
 *
 * Owns the two integration cards' submit logic, kept OUT of the
 * `apply-card-submit.ts` switch (same idiom as the T31 knowledge/media acks and
 * the journey-v2 own-write handlers): the entrypoint only adds a thin dispatch
 * branch that routes here, so its `CardSubmitBody` exhaustiveness guard stays
 * intact. Each handler does its OWN org-scoped persistence and returns the shared
 * `ApplyCardSubmitResult` the route streams as an SSE ACK turn.
 *
 * 🚨 SECURITY (load-bearing — NFR-03 + credential safety, asserted by T51's
 * SECRET_CANARY): a submitted credential VALUE must NEVER reach `builderState`,
 * the returned `cardInstruction`, any persisted `BuilderProjectMessage`, or any
 * log. Trace of every value-bearing path:
 *   - `integration_proposal` carries NO values (confirm-only) — nothing to leak.
 *   - `integration_credentials`:
 *       • values are read from the body ONLY to validate (format) + `encrypt()` +
 *         hand to `updateCredentials` (which writes them to `CustomIntegration
 *         .credentials`, NEVER builderState — see integration-state-db.ts header).
 *       • the format-mismatch error names the field LABEL, never the value.
 *       • the returned `cardInstruction` carries ONLY the test runner's value-free
 *         `diagnosis`/`outcome` (see test-call.runner.ts §8) — no value is ever
 *         interpolated. The credential map goes out of scope after the encrypt
 *         loop and is never referenced again.
 *
 * "Never trust the body" idiom: the proposal is read from SERVER-SIDE state
 * (`builderState.integration.proposed`), not from the confirm body; the draft id
 * is preferred from state (`integration.draftIntegrationId`) over any body hint.
 *
 * Zero `any`. Every read/write is filtered by organizationId.
 */

import { encrypt } from '@/lib/crypto'
import { parseBuilderState } from '../builder-state'
import {
  credentialFieldsSchema,
  type CredentialField,
} from '../../integrations/integration.schemas'
import {
  createDraftIntegration,
  getIntegration,
  updateCredentials,
  IntegrationNameConflictError,
} from '../../integrations/integration.repository'
import { patchIntegrationStateAtomic } from '../../integrations/integration-state-db'
import { runIntegrationTest } from '../../integrations/test-call.runner'
import { getIntegrationTemplate } from '../../integrations/templates'
import { readBuilderStateByProject } from '../../sources/builder-state-db'
import type {
  IntegrationProposalPayload,
  IntegrationCredentialsPayload,
} from '../card-submit.schemas'
import type { ApplyCardSubmitResult } from './apply-card-submit'

// ---------------------------------------------------------------------------
// Shared args
// ---------------------------------------------------------------------------

/**
 * Common context the integration handlers need beyond the card body: the project
 * (route `:id`), the tenant boundary, the conversation id (so the SSE ACK turn is
 * attributed correctly), and the acting user (stamped as `createdById` /
 * `requestedById`). Mirrors how the journey-v2 own-write handlers receive their
 * scope explicitly rather than re-deriving it.
 */
interface IntegrationCardContext {
  projectId: string
  organizationId: string
  conversationId: string
  userId: string
}

/** Coerces the persisted `credentialFields` Json into the typed array (safe). */
function parseCredentialFields(stored: unknown): CredentialField[] {
  const parsed = credentialFieldsSchema.safeParse(stored)
  return parsed.success ? parsed.data : []
}

// ---------------------------------------------------------------------------
// integration_proposal — confirm-only: create the draft from server-side state
// ---------------------------------------------------------------------------

/**
 * `integration_proposal` (action: 'confirm'). Reads the proposal FROM SERVER-SIDE
 * STATE (`builderState.integration.proposed`) — NEVER from the body (which carries
 * only `{ action: 'confirm' }`). Resolves the proposal's `templateSlug` to a
 * catalog template (the W2 declarative anchor for requestSpec/credentialFields/
 * toolName/triggerDescription), creates the draft `CustomIntegration` + inactive
 * `AgentTool` via the repository, then writes the resulting `draftIntegrationId`
 * back into `builderState.integration` (race-safe, org-scoped). The result asks
 * the chat to render the `integration_credentials` card next — it carries NO
 * secret (there are none yet).
 */
export async function applyIntegrationProposal(
  ctx: IntegrationCardContext,
  // The body is confirm-only; accepted for parity with the dispatch but never
  // read (the proposal is the server-side state — never trust the body).
  _body: IntegrationProposalPayload,
): Promise<ApplyCardSubmitResult> {
  const { projectId, organizationId, conversationId, userId } = ctx

  // Read the proposal from the FRESHEST server-side state (fail-open: never throws).
  const state = parseBuilderState(await readBuilderStateByProject(projectId))
  const proposed = state.integration?.proposed

  // Nada a confirmar: a proposta sumiu (ou nunca existiu). Resultado neutro.
  if (!proposed) {
    return {
      ok: true,
      conversationId,
      cardInstruction:
        'Não havia uma proposta de integração pendente para confirmar. ' +
        'Se o usuário ainda quiser conectar um sistema, proponha a integração novamente.',
    }
  }

  // W2: a proposta só vira integração quando há um template resolvível (a única
  // âncora declarativa de spec). Sem ele, não há requestSpec/credentialFields.
  const template = proposed.templateSlug
    ? getIntegrationTemplate(proposed.templateSlug)
    : null
  if (!template) {
    return {
      ok: true,
      conversationId,
      cardInstruction:
        'A proposta de integração ainda não está pronta para ser criada. ' +
        'Refaça a proposta da integração para continuar.',
    }
  }

  // Create the draft + inactive AgentTool (one transaction in the repository).
  // A tool-name conflict (org @@unique) surfaces as a leiga, value-free result.
  let draftId: string
  try {
    const created = await createDraftIntegration({
      organizationId,
      builderProjectId: projectId,
      createdById: userId,
      // The platform label is the user-facing displayName when the proposal set it.
      displayName: proposed.platform?.trim() || template.displayName,
      toolName: template.toolName,
      templateSlug: template.slug,
      triggerDescription: proposed.triggerDescription ?? template.triggerDescription,
      requestSpec: template.requestSpec,
      credentialFields: template.credentialFields,
    })
    draftId = created.id
  } catch (err) {
    if (err instanceof IntegrationNameConflictError) {
      return {
        ok: false,
        reason: 'invalid',
        message: 'Já existe uma ferramenta com esse nome nesta organização.',
      }
    }
    throw err
  }

  // Persist ONLY the draft reference into builderState (race-safe, org-scoped).
  // 🚨 No credential value passes through here — just the draft id.
  await patchIntegrationStateAtomic({
    projectId,
    organizationId,
    patch: { draftIntegrationId: draftId },
  })

  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário CONFIRMOU a proposta de integração com ${proposed.platform}. ` +
      'Agora peça as credenciais: exiba o card de credenciais (integration_credentials) para o usuário preencher os campos necessários. ' +
      'Não recrie a proposta nem peça nova confirmação — apenas siga para as credenciais.',
  }
}

// ---------------------------------------------------------------------------
// integration_credentials — encrypt + persist + test (DIVERTS from state patch)
// ---------------------------------------------------------------------------

/**
 * `integration_credentials` (values). DIVERTS from the standard builderState
 * patch: submitted values are NEVER written to `builderState`. Flow:
 *   1. Resolve the draft integration id from `builderState.integration
 *      .draftIntegrationId` (prefer state — never trust the body), load it
 *      org-scoped.
 *   2. Validate each submitted value against its field's `formatRegex` (from the
 *      integration's persisted `credentialFields`); on mismatch return a leiga
 *      error naming the field LABEL — NEVER the value.
 *   3. `encrypt()` each value and persist via `updateCredentials` (which writes to
 *      `CustomIntegration.credentials`, never builderState).
 *   4. Trigger the validation test (`runIntegrationTest`), which returns ONLY
 *      value-free signals.
 *   5. Return a `cardInstruction` carrying the leiga `diagnosis` — no submitted
 *      value is ever interpolated. This becomes the SSE ACK turn persisted in
 *      `BuilderProjectMessage`; it is secret-free by construction.
 */
export async function applyIntegrationCredentials(
  ctx: IntegrationCardContext,
  body: IntegrationCredentialsPayload,
): Promise<ApplyCardSubmitResult> {
  const { projectId, organizationId, conversationId, userId } = ctx

  // 1. Resolve the draft id from SERVER-SIDE state (prefer state — the card body
  //    carries only `values`, never an id). Fail-open read.
  const state = parseBuilderState(await readBuilderStateByProject(projectId))
  const integrationId = state.integration?.draftIntegrationId
  if (!integrationId) {
    return {
      ok: true,
      conversationId,
      cardInstruction:
        'Não há uma integração em rascunho aguardando credenciais. ' +
        'Proponha a integração e confirme antes de preencher as credenciais.',
    }
  }

  // Load org-scoped (missing / foreign / soft-deleted → neutral not_found).
  const integration = await getIntegration(organizationId, integrationId)
  if (!integration) {
    return { ok: false, reason: 'not_found', message: 'Integração não encontrada' }
  }

  // 2 + 3. Validate (format) + encrypt each value. The plaintext value is read
  //    ONLY here: it is never logged, never put in a result, never builderState.
  const fields = parseCredentialFields(integration.credentialFields)
  const fieldByKey = new Map(fields.map((f) => [f.key, f]))

  const encryptedCredentials: Record<string, string> = {}
  for (const [key, value] of Object.entries(body.values)) {
    const field = fieldByKey.get(key)
    if (!field) {
      // Unknown field key — the KEY is part of the card metadata, never a secret.
      return {
        ok: false,
        reason: 'invalid',
        message: `Campo de credencial desconhecido: ${key}`,
      }
    }
    if (field.formatRegex) {
      let re: RegExp
      try {
        re = new RegExp(field.formatRegex)
      } catch {
        // Invalid regex in the template → don't block the user; just skip the check.
        re = /.*/
      }
      if (!re.test(value)) {
        // 🚨 Error names the field LABEL, NEVER echoes the submitted value.
        return {
          ok: false,
          reason: 'invalid',
          message: `O valor de "${field.label}" está em formato inválido.`,
        }
      }
    }
    encryptedCredentials[key] = encrypt(value)
  }

  // Persist the encrypted blob (org-scoped; writes to CustomIntegration.credentials,
  // never builderState). `null` = not found / not owned / soft-deleted.
  const updated = await updateCredentials(
    organizationId,
    integrationId,
    encryptedCredentials,
  )
  if (!updated) {
    return { ok: false, reason: 'not_found', message: 'Integração não encontrada' }
  }

  // From here on the plaintext values + the encrypted map are NEVER read again —
  // only the test runner's value-free signals proceed.

  // 4. Trigger the validation test (decrypts in-memory, sends, discards — see
  //    test-call.runner.ts header). Returns ONLY outcome/diagnosis/httpStatus/ms.
  const test = await runIntegrationTest({
    organizationId,
    integrationId,
    requestedById: userId,
  })

  // 5. Build the ACK from the value-free diagnosis ONLY. No submitted value is
  //    interpolated; this turn is persisted in BuilderProjectMessage (T51 grep).
  const success = test.outcome === 'success'
  const cardInstruction = success
    ? `As credenciais da integração com ${integration.displayName} foram validadas com sucesso — a integração está pronta para ser ativada. ` +
      'Confirme ao usuário que a conexão foi validada e oriente o próximo passo (ativar a integração). ' +
      'Não peça as credenciais de novo.'
    : `O teste das credenciais da integração com ${integration.displayName} NÃO passou. Diagnóstico (em linguagem leiga, sem expor dados sensíveis): ${test.diagnosis} ` +
      'Explique o diagnóstico ao usuário e ofereça re-testar após corrigir. Não exponha nem repita os valores digitados.'

  return { ok: true, conversationId, cardInstruction }
}

// ---------------------------------------------------------------------------
// Dispatch — single entry the apply-card-submit branch routes to.
// ---------------------------------------------------------------------------

/**
 * Routes an integration card to its handler. Discriminated on `cardKey` so the
 * `apply-card-submit.ts` branch stays a one-liner (mirrors `applyKnowledgeAck` /
 * `applyMediaAck`). The body type is the union of the two integration payloads;
 * neither is part of the entrypoint's `CardSubmitBody` (so its exhaustiveness
 * guard is untouched).
 */
export async function applyIntegrationCard(
  ctx: IntegrationCardContext,
  body: IntegrationProposalPayload | IntegrationCredentialsPayload,
): Promise<ApplyCardSubmitResult> {
  return body.cardKey === 'integration_proposal'
    ? applyIntegrationProposal(ctx, body)
    : applyIntegrationCredentials(ctx, body)
}
