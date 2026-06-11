/**
 * Builder Module — Journey v2 card handlers (jornada-builder-v2).
 *
 * The `apply-card-submit.ts` entrypoint has outgrown the 800-line service ceiling
 * (FILE_SIZE_GUIDELINES), so Journey v2 card handlers live HERE — the entrypoint
 * only keeps a <30-line dispatch per card in its switch. Each handler owns its own
 * persistence so the entrypoint stays a thin router (mirrors how `quick_reply_chips`
 * returns early without the generic write).
 *
 * Tenant boundary: EVERY write is filtered by organizationId. No `any`.
 */

import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { trackJourneyEvent } from '@/server/services/journey-events'
import {
  parseBuilderState,
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
} from '../../builder-state'
import type { BusinessIdentityPayload } from '../../card-submit.schemas'
import type { ApplyCardSubmitResult } from '../apply-card-submit'

/** Clamp a free-text field server-side (trim + max length). `undefined`/empty → undefined. */
function sanitizeText(raw: string | undefined, max: number): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim().slice(0, max)
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * T19 (FR-03) — business_identity: o usuário descreveu o negócio SEM colar uma
 * fonte (nome obrigatório + endereço/descrição opcionais). É o caminho equivalente
 * ao accept do `source_progress` (que satisfaz a identidade pelo site/IG): ambos
 * destravam o step `business_identity` da fase Conhecer.
 *
 * Escreve, de forma ATÔMICA e org-scoped (mesmo padrão de
 * `set-project-basics.tool.ts:149-202`):
 *   - `identity.address` / `identity.description` (lar canônico, igual ao accept).
 *   - `project.name` no builderState + espelho em `builder_projects.name` (para a
 *     lista de projetos refletir o nome do negócio).
 * Flipa o sentinel `confirmations.businessIdentity` via `applyConfirmation` e emite
 * o evento de funil `identity_done`. Re-sanitiza tudo server-side (nunca confia no
 * body). Self-contained: o entrypoint só despacha e retorna este resultado.
 */
export async function applyBusinessIdentity(args: {
  conversationId: string
  projectId: string
  organizationId: string
  current: BuilderState
  payload: Pick<BusinessIdentityPayload, 'name' | 'address' | 'description'>
}): Promise<ApplyCardSubmitResult> {
  const { conversationId, projectId, organizationId, current, payload } = args

  const name = sanitizeText(payload.name, 80)
  if (!name) {
    return { ok: false, reason: 'invalid', message: 'Nome do negócio é obrigatório' }
  }
  const address = sanitizeText(payload.address, 300)
  const description = sanitizeText(payload.description, 500)

  // Atomic read-modify-write (re-read the FRESHEST state inside the transaction so
  // a concurrent card submit isn't clobbered) + mirror the name onto the project row.
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: { builderState: true },
    })
    // Fall back to the already-loaded state when the in-transaction read misses
    // (e.g. test doubles) so the handler never silently drops the write.
    const fresh =
      row?.builderState != null ? parseBuilderState(row.builderState) : current

    const patch: DeepPartial<BuilderState> = {
      project: { name },
      // TODO (T06/onda3): quando o namespace `capturedProposals` existir, limpar o
      // domínio de identidade aqui via `clearCapturedProposals(state, ...)` — o
      // deepMerge nunca deleta chaves, então o clear precisa ser explícito.
      ...(address || description
        ? {
            identity: {
              ...(address ? { address } : {}),
              ...(description ? { description } : {}),
            },
          }
        : {}),
    }
    const next = applyConfirmation(patchBuilderState(fresh, patch), 'businessIdentity')

    await tx.builderProjectConversation.updateMany({
      where: { id: conversationId, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })

    // Espelha o nome do negócio em builder_projects.name (org-scoped) para a lista
    // de projetos refletir a identidade.
    await tx.builderProject.updateMany({
      where: { id: projectId, organizationId },
      data: { name },
    })
  })

  // FR-03 — a identidade está satisfeita (sem fonte). Fire-and-forget, nunca lança.
  await trackJourneyEvent({
    organizationId,
    projectId,
    journeyVersion: current.journeyVersion,
    event: 'identity_done',
  })

  const bits: string[] = [`nome "${name}"`]
  if (address) bits.push(`endereço "${address}"`)
  if (description) bits.push('descrição do negócio')

  return {
    ok: true,
    conversationId,
    cardInstruction:
      `O usuário DESCREVEU o negócio via card (${bits.join(', ')}). ` +
      'Esses dados agora fazem parte do contexto do agente. ' +
      'Use-os ao montar o agente e siga para o próximo passo da jornada. ' +
      'Não reabra o card "Sobre o negócio".',
  }
}
