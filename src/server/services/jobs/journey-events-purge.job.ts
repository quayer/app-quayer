/**
 * journey-events-purge.job — purga linhas antigas de `builder_journey_events`.
 *
 * Propósito: NFR-10 (retenção) da Jornada Builder v2. O funil de produto mede
 * jornadas de CRIAÇÃO de projeto — 6 meses cobrem qualquer análise. Manter
 * eventos além disso só aumenta a superfície de dados retidos (LGPD). Este job
 * recorrente apaga, em batch, todo evento com `createdAt` anterior ao corte de
 * 180 dias.
 *
 * Idempotência: o filtro é puramente temporal (`createdAt < now - 180d`).
 * Rodar duas vezes seguidas é seguro — a segunda passada simplesmente não
 * encontra mais nada para apagar (deletedCount = 0). Sem unique/estado externo.
 *
 * Falha-segura (fail-open): qualquer erro do DELETE é logado com o prefixo
 * `[journey-v2]` e ENGOLIDO — NUNCA derruba o worker. Telemetria é secundária:
 * uma purga falha apenas adia a limpeza para o próximo run.
 *
 * Quando rodar: cron no worker dedicado, no MESMO padrão de schedule do
 * `session-close.job.ts` (BullMQ repeat). Intervalo fixo, sem env nova.
 */

import type { PrismaClient } from '@prisma/client'

// Tipo mínimo do shape do Prisma que usamos — facilita mock em testes sem
// arrastar o PrismaClient inteiro (mesmo idiom de SessionClosePrismaLike).
export type JourneyEventsPurgePrismaLike = {
  builderJourneyEvent: {
    deleteMany: PrismaClient['builderJourneyEvent']['deleteMany']
  }
}

export interface JourneyEventsPurgeResult {
  /** Quantas linhas foram apagadas neste run (0 quando não há nada vencido). */
  deleted: number
}

/** Retenção fixa: 180 dias (NFR-10 / plan §6.2). Sem env de override. */
export const JOURNEY_EVENTS_RETENTION_DAYS = 180

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Apaga eventos de jornada com `createdAt` anterior ao corte de 180 dias.
 *
 * Nunca lança: erro do DELETE vira log `[journey-v2]` + retorno { deleted: 0 }.
 * Idempotente: filtro temporal puro — re-execução não erra nem reprocessa.
 */
export async function runJourneyEventsPurge(
  database: JourneyEventsPurgePrismaLike,
): Promise<JourneyEventsPurgeResult> {
  const cutoff = new Date(Date.now() - JOURNEY_EVENTS_RETENTION_DAYS * MS_PER_DAY)

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
