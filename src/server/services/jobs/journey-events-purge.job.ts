/**
 * journey-events-purge.job — manutenção recorrente da Jornada Builder v2.
 *
 * Duas responsabilidades na MESMA rotina/schedule (plan §9: nenhum cron novo
 * além do aprovado em T88):
 *
 *   1. Purga de retenção (NFR-10): apaga, em batch, todo `builder_journey_events`
 *      com `createdAt` anterior ao corte de 180 dias. O funil de produto mede
 *      jornadas de CRIAÇÃO de projeto — 6 meses cobrem qualquer análise; manter
 *      além disso só aumenta a superfície de dados retidos (LGPD).
 *
 *   2. Arquivamento de drafts v1 inativos (FR-33, T106): arquiva os
 *      `BuilderProject` ainda em `draft` cuja jornada é a v1 (legado) e que estão
 *      sem atividade (`updatedAt`) há 90 dias. Reusa o mecanismo de arquivamento
 *      EXISTENTE (status → `archived` + `archivedAt`, igual ao `archiveProject`
 *      das crud.routes) — sem deleção, reversível por unarchive. É o que destrava
 *      o sunset da v1 (plan §10 Onda 7): o gate de convergência conta só drafts
 *      v1 ATIVOS, então tirar os inativos de cena faz o contador convergir.
 *
 * Idempotência:
 *   - Purga: filtro puramente temporal (`createdAt < now - 180d`). A 2ª passada
 *     não encontra mais nada (deletedCount = 0).
 *   - Arquivamento: o filtro exige `status = 'draft'`; um projeto já arquivado
 *     deixa o scope na passada seguinte. Re-execução não re-arquiva nem erra.
 *
 * Falha-segura (fail-open): TODO erro (DELETE de eventos OU update de arquivo) é
 * logado com o prefixo `[journey-v2]` e ENGOLIDO — NUNCA derruba o worker. Um
 * erro só adia a limpeza/arquivamento para o próximo run. O arquivamento roda
 * como passo da rotina mas isolado em try/catch próprio: falhar nele não impede
 * a purga (e vice-versa).
 *
 * Org-scoping (NFR-01): o arquivamento varre POR PROJETO e arquiva cada um pelo
 * seu próprio id — nenhum update cross-org é possível por construção (cada update
 * tem `where { id }` de uma linha já materializada).
 *
 * Quando rodar: cron no worker dedicado, no MESMO padrão de schedule do
 * `session-close.job.ts` (BullMQ repeat). Intervalo fixo, sem env nova.
 */

import type { Prisma, PrismaClient } from '@prisma/client'

// Tipo mínimo do shape do Prisma que usamos — facilita mock em testes sem
// arrastar o PrismaClient inteiro (mesmo idiom de SessionClosePrismaLike).
export type JourneyEventsPurgePrismaLike = {
  builderJourneyEvent: {
    deleteMany: PrismaClient['builderJourneyEvent']['deleteMany']
  }
  builderProject: {
    findMany: PrismaClient['builderProject']['findMany']
    update: PrismaClient['builderProject']['update']
  }
}

export interface JourneyEventsPurgeResult {
  /** Quantas linhas foram apagadas neste run (0 quando não há nada vencido). */
  deleted: number
}

export interface V1DraftArchiveResult {
  /** Quantos drafts v1 inativos foram arquivados neste run. */
  archived: number
}

/** Retenção fixa: 180 dias (NFR-10 / plan §6.2). Sem env de override. */
export const JOURNEY_EVENTS_RETENTION_DAYS = 180

/** Inatividade que dispara o arquivamento de draft v1 (FR-33 / T106). */
export const V1_DRAFT_INACTIVITY_DAYS = 90

/** Teto de drafts processados por passada — varredura barata, sem long-tx. */
const V1_DRAFT_ARCHIVE_BATCH_SIZE = 200

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Apaga eventos de jornada com `createdAt` anterior ao corte de 180 dias.
 *
 * Nunca lança: erro do DELETE vira log `[journey-v2]` + retorno { deleted: 0 }.
 * Idempotente: filtro temporal puro — re-execução não erra nem reprocessa.
 *
 * Roda TAMBÉM o arquivamento de drafts v1 inativos (T106) como passo da mesma
 * rotina (sem cron adicional). O arquivamento é isolado em try/catch próprio e
 * não altera o contrato de retorno desta função (segue `{ deleted }`): o
 * resultado do arquivamento só é logado.
 */
export async function runJourneyEventsPurge(
  database: JourneyEventsPurgePrismaLike,
): Promise<JourneyEventsPurgeResult> {
  const cutoff = new Date(Date.now() - JOURNEY_EVENTS_RETENTION_DAYS * MS_PER_DAY)

  // Passo 2 da rotina (T106): arquiva drafts v1 inativos > 90 dias. Roda ANTES
  // da purga e em try/catch próprio (já é fail-open) — um não derruba o outro.
  await runV1DraftArchive(database)

  try {
    const { count } = await database.builderJourneyEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    return { deleted: count }
  } catch (err) {
    // Fail-open: a limpeza é best-effort; nunca propagamos para o worker.
    console.error(
      '[journey-v2] journey-events purge failed (ignored):',
      (err as Error)?.message ?? err,
    )
    return { deleted: 0 }
  }
}

/**
 * `true` quando o builderState (JSONB da conversa do projeto) representa a
 * jornada v1. Legado conta como v1: builderState NULL/ausente OU sem
 * `journeyVersion` lazy-backfilla para 1 (mesma semântica de `parseBuilderState`).
 * Só `journeyVersion === 2` (explicitamente seedado por T10/T11) é v2 — e fica
 * de fora do arquivamento.
 */
function isV1Journey(builderState: unknown): boolean {
  if (builderState == null || typeof builderState !== 'object') return true
  const version = (builderState as Record<string, unknown>).journeyVersion
  return version !== 2
}

/**
 * Arquiva BuilderProject em `draft`, jornada v1, sem atividade há 90 dias (FR-33).
 *
 * Varre por projeto (status=draft + updatedAt < corte) trazendo o `journeyVersion`
 * da conversa 1:1; arquiva só os v1 reusando o mecanismo existente (status →
 * `archived` + `archivedAt`, igual a `builderProjectRepository.archive`). Drafts
 * v2, projetos publicados (production/paused) e drafts v1 com atividade recente
 * ficam INTOCADOS.
 *
 * Nunca lança: erro de query/update vira log `[journey-v2]` e é engolido. Erro de
 * um update individual não aborta o loop (os demais ainda arquivam). Idempotente:
 * arquivar muda o status para fora do filtro `draft`, então a próxima passada não
 * o reencontra.
 */
export async function runV1DraftArchive(
  database: JourneyEventsPurgePrismaLike,
): Promise<V1DraftArchiveResult> {
  const cutoff = new Date(Date.now() - V1_DRAFT_INACTIVITY_DAYS * MS_PER_DAY)

  let candidates: Array<{
    id: string
    conversation: { builderState: Prisma.JsonValue | null } | null
  }>

  try {
    candidates = await database.builderProject.findMany({
      where: { status: 'draft', updatedAt: { lt: cutoff } },
      select: { id: true, conversation: { select: { builderState: true } } },
      take: V1_DRAFT_ARCHIVE_BATCH_SIZE,
    })
  } catch (err) {
    console.error(
      '[journey-v2] v1-draft archive query failed (ignored):',
      (err as Error)?.message ?? err,
    )
    return { archived: 0 }
  }

  let archived = 0

  for (const project of candidates) {
    // Só v1 (legado). v2 é seedado explicitamente e nunca é tocado aqui.
    if (!isV1Journey(project.conversation?.builderState)) continue

    try {
      await database.builderProject.update({
        where: { id: project.id },
        data: { status: 'archived', archivedAt: new Date() },
      })
      archived += 1
    } catch (err) {
      // Fail-open por projeto: falhar em um não impede arquivar os demais.
      console.error(
        '[journey-v2] v1-draft archive failed for project (ignored):',
        project.id,
        (err as Error)?.message ?? err,
      )
    }
  }

  return { archived }
}
