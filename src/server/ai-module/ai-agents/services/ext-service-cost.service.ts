/**
 * ext-service-cost.service.ts — custo de serviços EXTERNOS por turno.
 *
 * O `AgentRuntimeDecision` já rastreia o custo do LLM (`totalCost`), mas STT/TTS/
 * embedding (Deepgram, Whisper, ElevenLabs, OpenAI) eram invisíveis — o custo real
 * de um turno com áudio era subestimado. Este módulo computa esses custos a partir
 * do sinal de uso (segundos de áudio, chars, tokens).
 *
 * Funções PURAS: sem I/O. As tarifas vêm de env (defaults documentados em
 * `.env.example`) porque preço de provider muda e varia por plano — tunável sem
 * deploy, igual aos hyperparams de RAG. Tarifa inválida/ausente → default.
 *
 * NÃO persiste nada ainda: a coluna `extServiceCosts` (JSONB por turno) é uma
 * migration separada. Por ora os custos são computados + logados (observabilidade).
 */

export type SttProvider = 'deepgram' | 'whisper'

/** Lê uma tarifa de env como float >= 0; fallback ao default se ausente/inválida. */
function rate(envVar: string, fallback: number): number {
  const raw = process.env[envVar]
  if (raw === undefined) return fallback
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * Custo de STT em USD a partir da duração do áudio (Deepgram e Whisper cobram
 * por MINUTO). Defaults aproximados (2026): Deepgram nova ~$0.0043/min, Whisper
 * ~$0.006/min — override por env. Duração não-positiva/ inválida → 0.
 */
export function computeSttCostUsd(
  provider: SttProvider,
  durationSeconds: number | null | undefined,
): number {
  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return 0
  }
  const perMin =
    provider === 'deepgram'
      ? rate('STT_COST_PER_MIN_DEEPGRAM', 0.0043)
      : rate('STT_COST_PER_MIN_WHISPER', 0.006)
  return (durationSeconds / 60) * perMin
}
