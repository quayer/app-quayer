/**
 * Builder Cards — Persona / metadados dos chips de "jeito de falar" (Onda C, G7)
 *
 * Lógica PURA (sem I/O, sem React, sem `any`): apenas o catálogo dos modos de
 * voz que o card `agent_persona` renderiza como chips role=radio no Passo A.
 * Mantido num arquivo próprio (espelhando a convenção da subpasta
 * `pricing/disclosure-format.ts`) para que o JSX do card fique enxuto.
 *
 * `SpeechMode` é o campo OPCIONAL `persona.speechMode?` — não bloqueia a etapa
 * de persona; só orienta a sugestão determinística de saudação (greeting) e,
 * quando presente, é persistido no builderState como dica de voz.
 *
 * Espelha os 3 chips do Orayon (PersonaStyleChips): assistant / first_person /
 * secretary. Copy em PT-BR.
 */

/** Os 3 modos de voz possíveis (perspectiva gramatical do agente). */
export type SpeechMode = "assistant" | "first_person" | "secretary"

/** Conjunto de modos válidos — usado para sanitizar valor vindo do estado. */
const SPEECH_MODE_SET: ReadonlySet<string> = new Set<SpeechMode>([
  "assistant",
  "first_person",
  "secretary",
])

/** `true` quando `value` é um {@link SpeechMode} conhecido. */
export function isSpeechMode(value: unknown): value is SpeechMode {
  return typeof value === "string" && SPEECH_MODE_SET.has(value)
}

/** Metadados de UM chip de voz: chave + rótulo + dica (exemplo do tom). */
export interface SpeechModeOption {
  key: SpeechMode
  label: string
  hint: string
}

/**
 * Catálogo dos chips de voz, em ordem de exibição. Renderizado como botões
 * role=radio token-styled no Passo A do card (idioma do PRESET_OPTIONS do
 * business-hours-card). O primeiro é o padrão sugerido.
 */
export const SPEECH_MODES: ReadonlyArray<SpeechModeOption> = [
  {
    key: "assistant",
    label: "Atendente oficial",
    hint: "Fala pelo negócio. Ex.: \"Sou o consultor virtual da equipe.\"",
  },
  {
    key: "first_person",
    label: "Em primeira pessoa",
    hint: "Fala como uma pessoa nomeada. Ex.: \"Oi, aqui é a Marina.\"",
  },
  {
    key: "secretary",
    label: "Recepção",
    hint: "Fala como triagem. Ex.: \"Vou entender seu interesse e encaminhar.\"",
  },
]

/** Modo padrão quando nada foi escolhido ainda. */
export const DEFAULT_SPEECH_MODE: SpeechMode = "assistant"
