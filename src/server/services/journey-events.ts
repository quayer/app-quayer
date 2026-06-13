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
 * LGPD (NFR-02): `metadata` é um contrato FECHADO por evento — sem `Record`
 * livre e sem chaves arbitrárias. É PROIBIDO carregar telefone, nome de contato
 * ou qualquer PII: números nunca saem do `builderState`. Retenção: linhas > 180
 * dias são purgadas por cron no worker (NFR-10, `jobs/journey-events-purge.job.ts`).
 */

import { database } from '@/server/services/database'

/**
 * Vocabulário fechado de eventos do funil (plan §6.2). Funil =
 * `MIN(createdAt)` por (projectId, event) — eventos podem repetir.
 */
export type JourneyEventName =
  | 'journey_started'
  | 'identity_done'
  | 'mission_selected'
  | 'review_done'
  | 'agent_created'
  | 'test_done'
  | 'test_skipped'
  | 'channel_connected'
  | 'published'
  | 'next_steps_ack'

/**
 * Metadata do evento — contrato FECHADO (NFR-02/LGPD).
 *
 * O shape é deliberadamente pequeno e sem índice livre: cada evento declara
 * explicitamente quais chaves pode carregar. Eventos que ainda não precisam de
 * metadata usam `undefined`, então o tipo impede payload arbitrário.
 */
export type JourneyEventMetadataByName = {
  journey_started: undefined
  identity_done: undefined
  // mission-first v3 (FR-48) — metadata FECHADO/sem PII (NFR-02): só enums
  // resolvidos da missão. O handler (`apply/journey-v2.ts:applyMission`) mapeia
  // mission.role/objective (strings) para estes enums quando válidos, senão omite.
  mission_selected: {
    role?:
      | 'sdr'
      | 'closer'
      | 'secretaria'
      | 'suporte'
      | 'vendas'
      | 'cobranca'
      | 'onboarding'
    objectiveKind?: 'qualificar' | 'agendar' | 'vender' | 'suportar' | 'transferir'
    framework?: 'bant_lite' | 'spin' | 'meddic' | 'triage' | 'appointment'
  }
  review_done: undefined
  agent_created: undefined
  test_done: { origin?: 'card' | 'playground' }
  test_skipped: undefined
  channel_connected: {
    platform?: 'whatsapp' | 'instagram'
    provider?: 'uazapi' | 'manual'
  }
  published: { versionNumber?: number }
  next_steps_ack: undefined
}

export type JourneyEventMetadata = NonNullable<
  JourneyEventMetadataByName[JourneyEventName]
>

type TrackJourneyEventInputFor<E extends JourneyEventName> = {
  organizationId: string
  projectId: string
  /** Versão da jornada congelada no evento (1 | 2 — plan §2.2). */
  journeyVersion: 1 | 2
  event: E
} & (JourneyEventMetadataByName[E] extends undefined
  ? { metadata?: never }
  : { metadata?: JourneyEventMetadataByName[E] })

export type TrackJourneyEventInput = {
  [E in JourneyEventName]: TrackJourneyEventInputFor<E>
}[JourneyEventName]

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
