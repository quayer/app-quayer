/**
 * Auto-flip do sentinel `confirmations.testDrive` (jornada-builder-v2, T33).
 *
 * O passo Testar da jornada v2 é satisfeito assim que o usuário roda o agente no
 * playground — não há card "marquei como testado" obrigatório no caminho feliz.
 * O CTA do card `test_drive` leva à tab Testar, que usa o stream STATELESS
 * (`POST /projects/:id/playground/stream`) — por isso o flip vive aqui, no único
 * ponto que os DOIS caminhos compartilham:
 *
 *   1. `processPlaygroundStream` (runtime stateless da tab Testar) — chama no
 *      PRIMEIRO turno bem-sucedido, resolvendo o projeto pelo `agentConfigId`.
 *   2. `run_playground_test.tool` (teste por cenários do meta-agente) — chama
 *      com o `projectId` que já tem no contexto da tool.
 *
 * Contrato FAIL-OPEN total (mesmo idiom de `trackJourneyEvent`): TODA a função
 * vive num try/catch e NUNCA lança. Um erro de DB no flip jamais pode quebrar o
 * stream do playground nem a tool de teste — o flip é progressão de funil, não
 * regra de negócio. Idempotente por leitura: se `testDrive` já é `true` (segundo
 * turno em diante), é no-op silencioso — não re-grava o estado nem re-emite o
 * evento de funil.
 *
 * O flip e o evento `test_done` usam o MESMO read-modify-write atômico org-scoped
 * dos handlers de card (`cards/handlers/apply/journey-v2.ts`): re-lê o estado mais
 * fresco DENTRO da transação, flipa via `applyConfirmation` (única fonte do flip —
 * nada vem do body) e grava num único `updateMany` filtrado por organizationId.
 */

import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { trackJourneyEvent } from '@/server/services/journey-events'
import {
  parseBuilderState,
  applyConfirmation,
} from '../cards/builder-state'

/**
 * Como o caminho chamador identifica o projeto do playground. Discriminado:
 *   - `agentConfigId`: o runtime stateless só conhece o agente — resolvemos o
 *     `BuilderProject` dono (1:1 via `aiAgentId @unique`).
 *   - `projectId`: a tool de teste já tem o projeto no contexto.
 */
export type AutoFlipTestDriveTarget =
  | { agentConfigId: string; projectId?: never }
  | { projectId: string; agentConfigId?: never }

export type AutoFlipTestDriveInput = AutoFlipTestDriveTarget & {
  organizationId: string
}

/**
 * Flipa `confirmations.testDrive` (se ainda false) e emite o evento de funil
 * `test_done` no primeiro turno bem-sucedido do playground. Fire-and-forget:
 * resolve sempre, NUNCA lança. Segundo turno (sentinel já true) é no-op.
 */
export async function autoFlipTestDrive(
  input: AutoFlipTestDriveInput,
): Promise<void> {
  const { organizationId } = input

  try {
    // 1. Resolve a conversa do projeto (1:1 com BuilderProject) org-scoped.
    //    Pelo agentConfigId vamos via BuilderProject.aiAgentId (@unique); pelo
    //    projectId vamos direto na conversa (projectId @unique).
    const conversation = input.projectId
      ? await database.builderProjectConversation.findFirst({
          where: { projectId: input.projectId, organizationId },
          select: { id: true, projectId: true },
        })
      : await database.builderProjectConversation.findFirst({
          where: { organizationId, project: { aiAgentId: input.agentConfigId } },
          select: { id: true, projectId: true },
        })

    if (!conversation) return

    // 2. Read-modify-write atômico org-scoped (mesmo padrão dos handlers de card).
    //    Curto-circuita ANTES de qualquer write quando o sentinel já está true,
    //    para o segundo turno não re-gravar o estado nem re-emitir o evento.
    //    Retorna a journeyVersion congelada no estado para o evento de funil
    //    (sem 3ª query: lemos a versão da MESMA leitura que decidiu o flip).
    const flippedJourneyVersion = await database.$transaction(async (tx) => {
      const row = await tx.builderProjectConversation.findFirst({
        where: { id: conversation.id, organizationId },
        select: { builderState: true },
      })
      const fresh = parseBuilderState(row?.builderState)
      if (fresh.confirmations.testDrive) return null

      const next = applyConfirmation(fresh, 'testDrive')
      await tx.builderProjectConversation.updateMany({
        where: { id: conversation.id, organizationId },
        data: { builderState: next as unknown as Prisma.InputJsonValue },
      })
      return next.journeyVersion
    })

    // 3. Funil: só emite quando ESTE turno fez o flip (evita re-emissão no 2º
    //    turno). `trackJourneyEvent` já é fire-and-forget — segue mesmo se falhar.
    if (flippedJourneyVersion !== null) {
      await trackJourneyEvent({
        organizationId,
        projectId: conversation.projectId,
        journeyVersion: flippedJourneyVersion,
        event: 'test_done',
      })
    }
  } catch (error) {
    console.warn(
      '[journey-v2] auto-flip testDrive falhou — ignorando (fail-open):',
      error instanceof Error ? error.message : String(error),
    )
  }
}
