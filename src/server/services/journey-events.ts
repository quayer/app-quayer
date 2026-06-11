/**
 * Funil da Jornada Builder v2 (NFR-04 — `specs/jornada-builder-v2/spec.md`).
 *
 * `trackJourneyEvent` é fire-and-forget: grava UMA linha em
 * `builder_journey_events` e NUNCA lança — try/catch interno degrada para
 * no-op em qualquer erro de DB (mesmo padrão fail-open de
 * `hasActiveCalendarConnection` em `deploy/enabled-tools-derivation.ts`). O
 * funil é observabilidade de produto; jamais pode quebrar o caminho de
 * negócio que o emite (criação de projeto, webhook, saga de deploy).
 *
 * Vocabulário FECHADO em union TS (plan §6.2) — o evento é validado no tipo,
 * não em runtime: `JourneyEventName` é a única superfície de escrita.
 *
 * LGPD (NFR-02): `metadata` é um tipo ESTREITO de chaves escalares
 * (string | number | boolean) — sem campos livres. É PROIBIDO carregar
 * telefone, nome de contato ou qualquer PII: números nunca saem do
 * `builderState`. Retenção: linhas > 180 dias são purgadas por cron no worker
 * (NFR-10, `jobs/journey-events-purge.job.ts`).
 */

import { database } from '@/server/services/database'

/**
 * Vocabulário fechado de eventos do funil (plan §6.2). Funil =
 * `MIN(createdAt)` por (projectId, event) — eventos podem repetir.
 */
export type JourneyEventName =
  | 'journey_started'
  | 'identity_done'
  | 'review_done'
  | 'agent_created'
  | 'test_done'
  | 'test_skipped'
  | 'channel_connected'
  | 'published'
  | 'next_steps_ack'

/**
 * Metadata do evento — tipo ESTREITO, escalares apenas (NFR-02/LGPD).
 *
 * Sem campos livres de PII: nada de telefone/nome de contato. As chaves são
 * livres de nome, mas os VALORES são restritos a escalares — impede aninhar
 * objetos arbitrários que poderiam vazar dados sensíveis.
 */
export type JourneyEventMetadata = Record<string, string | number | boolean>

export interface TrackJourneyEventInput {
  organizationId: string
  projectId: string
  /** Versão da jornada congelada no evento (1 | 2 — plan §2.2). */
  journeyVersion: 1 | 2
  event: JourneyEventName
  metadata?: JourneyEventMetadata
}

/**
 * Grava um evento do funil. Fire-and-forget: resolve sempre, nunca lança.
 *
 * Erro de DB é logado com prefixo `[journey-v2]` e engolido — o caller (criação
 * de projeto, webhook UAZ, saga de deploy) segue como se nada tivesse
 * acontecido.
 */
export async function trackJourneyEvent({
  organizationId,
  projectId,
  journeyVersion,
  event,
  metadata,
}: TrackJourneyEventInput): Promise<void> {
  try {
    await database.builderJourneyEvent.create({
      data: {
        organizationId,
        projectId,
        journeyVersion,
        event,
        ...(metadata ? { metadata } : {}),
      },
    })
  } catch (error) {
    console.warn(
      `[journey-v2] falha ao gravar evento de funil "${event}" — ignorando (fire-and-forget):`,
      error,
    )
  }
}
