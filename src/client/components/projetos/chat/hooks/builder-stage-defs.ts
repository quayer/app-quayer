export const BUILDER_STAGE_KEYS = [
  "name",
  "goal",
  "prompt",
  "tools",
  "tests",
  "channel",
  "deploy",
] as const

export type BuilderStageKey = (typeof BUILDER_STAGE_KEYS)[number]

export const BUILDER_STAGE_DEFS = [
  { key: "name",    label: "Nome",        hint: "Definindo o nicho do agente" },
  { key: "goal",    label: "Objetivo",    hint: "Criando o agente" },
  { key: "prompt",  label: "Prompt",      hint: "Escrevendo o prompt" },
  { key: "tools",   label: "Ferramentas", hint: "Selecionando as ferramentas" },
  { key: "tests",   label: "Testes",      hint: "Testando o agente" },
  { key: "channel", label: "Canal",       hint: "Conectando o WhatsApp" },
  { key: "deploy",  label: "Publicar",    hint: "Publicando o agente" },
] as const satisfies ReadonlyArray<{ key: BuilderStageKey; label: string; hint: string }>
