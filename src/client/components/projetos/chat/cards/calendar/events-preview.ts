/**
 * Builder Cards — Calendar / prova social da agenda (Onda C, G10)
 *
 * Lógica PURA (sem I/O, sem React, sem `any`) que decide a COPY PT-BR da linha de
 * "prova social" mostrada DENTRO do bloco conectado do card `calendar_connect`.
 *
 * Depois que a fase resolve para `connected`, o card faz UMA leitura (ref-guarded
 * por connectionId) de `GET /builder/calendar/events-preview/:projectId`. Essa
 * rota fina conta os INTERVALOS OCUPADOS (freeBusy) das próximas ~3 semanas — não
 * há títulos de evento, então a copy fala em "compromissos" (contagem), nunca em
 * nomes inventados. O fetch é SOFT-FAILING: se a leitura falhar, o status NUNCA
 * volta para erro — só mostramos um hint gentil.
 *
 * Este arquivo é a ÚNICA fonte das frases, mantendo o JSX do card enxuto (mesma
 * convenção do subfolder `pricing/`).
 *
 * Estados ({@link AgendaPreviewState}):
 *   - `idle`                       → ainda não disparou (copy vazia)
 *   - `loading`                    → "Lendo sua agenda…"
 *   - `{kind:'ready', busyCount}`  → N>0 "Identifiquei N compromisso(s)…" / N=0 "livre…"
 *   - `error`                      → soft "Conectado, mas não consegui ler a agenda agora."
 */

/**
 * Estado da leitura de prova social da agenda. `ready` carrega a contagem de
 * compromissos (intervalos ocupados) do freeBusy — sempre um inteiro >= 0.
 */
export type AgendaPreviewState =
  | "idle"
  | "loading"
  | { kind: "ready"; busyCount: number }
  | "error"

/**
 * Normaliza a contagem vinda da rota para um INT não-negativo. Defesa contra
 * float/negativo/NaN — a rota promete um inteiro, mas nunca confiamos cegamente.
 */
function normalizeBusyCount(busyCount: number): number {
  if (!Number.isFinite(busyCount)) return 0
  return Math.max(0, Math.round(busyCount))
}

/**
 * Frase PT-BR da prova social para um dado estado da leitura.
 *
 * Garantias:
 *  - `idle`    → "" (nada a dizer ainda; o card não renderiza a linha).
 *  - `loading` → "Lendo sua agenda…".
 *  - `ready` com busyCount > 0 → "Identifiquei N compromisso(s) nas próximas
 *    semanas." (contagem honesta; freeBusy não traz títulos).
 *  - `ready` com busyCount === 0 → "Sua agenda está livre — vou agendar a partir
 *    dos próximos horários.".
 *  - `error`   → hint SUAVE; o status da conexão NUNCA é rebaixado por isso.
 */
export function previewCopy(state: AgendaPreviewState): string {
  if (state === "idle") return ""
  if (state === "loading") return "Lendo sua agenda…"
  if (state === "error") {
    return "Conectado, mas não consegui ler a agenda agora."
  }

  const count = normalizeBusyCount(state.busyCount)
  if (count > 0) {
    return `Identifiquei ${count} compromisso(s) nas próximas semanas.`
  }
  return "Sua agenda está livre — vou agendar a partir dos próximos horários."
}
