import type { CardComponentProps } from "../types"
import type { DisclosureValue } from "./disclosure-section"
import type { BusinessHoursPayload } from "./hours-section"
import { SPEECH_MODES, type SpeechMode } from "../persona/speech-mode"
import {
  DEFAULT_TIMEZONE,
  build24x7,
  buildCommercial,
  coerceSchedule,
  normalizePreset,
  type HoursPreset,
  type WeeklySchedule,
} from "../business-hours/schedule-shape"

export const EMPTY_SCOPE = "Ainda sem escopo definido"

function scheduleForPreset(
  preset: HoursPreset,
  custom: WeeklySchedule,
): WeeklySchedule {
  if (preset === "24_7") return build24x7()
  if (preset === "commercial") return buildCommercial()
  return custom
}

export function buildInitialHoursPayload(
  value: CardComponentProps["value"],
): BusinessHoursPayload {
  const ownedPreset =
    typeof value.hours.preset === "string" && value.hours.preset.length > 0
      ? value.hours.preset
      : undefined
  const proposedPreset =
    typeof value.capturedProposals?.hours?.preset === "string" &&
    value.capturedProposals.hours.preset.length > 0
      ? value.capturedProposals.hours.preset
      : undefined
  const rawPreset =
    ownedPreset ??
    (value.confirmations.hours ? value.hours.preset : undefined) ??
    proposedPreset
  const preset = rawPreset ? normalizePreset(rawPreset) : "24_7"
  const persisted = coerceSchedule(value.hours.schedule)
  const custom = persisted ?? buildCommercial()

  return {
    preset,
    schedule: scheduleForPreset(preset, custom),
    timezone: value.hours.timezone?.trim() || DEFAULT_TIMEZONE,
    outOfHours: value.hours.outOfHours === "silent" ? "silent" : "reply_notice",
  }
}

export function compactList(items: readonly string[], empty: string): string {
  const clean = items.map((item) => item.trim()).filter(Boolean)
  if (clean.length === 0) return empty
  const head = clean.slice(0, 3).join(" · ")
  return clean.length > 3 ? `${head} · +${clean.length - 3}` : head
}

export function speechModeLabel(mode: SpeechMode | undefined) {
  return (
    SPEECH_MODES.find((option) => option.key === mode)?.label ??
    "Assistente virtual"
  )
}

export function hoursSummary(hours: BusinessHoursPayload): string[] {
  const preset =
    hours.preset === "24_7"
      ? "Equipe humana sempre disponível"
      : hours.preset === "commercial"
        ? "Equipe humana em horário comercial"
        : "Equipe humana com horário manual"
  const outOfHours =
    hours.outOfHours === "silent"
      ? "Fora do horário: IA responde sem prometer retorno humano imediato"
      : "Fora do horário: IA continua 24/7 e informa quando a equipe retorna"
  return ["IA atende 24/7", preset, outOfHours]
}

export function disclosureSummary(value: DisclosureValue | undefined): string {
  if (!value) return "Padrão: IA transparente no atendimento"
  if (value.mode === "human_passthrough") return "Apresentação humanizada"
  if (value.mode === "custom") {
    return value.customText?.trim() || "Texto próprio configurado"
  }
  return "IA transparente no atendimento"
}
