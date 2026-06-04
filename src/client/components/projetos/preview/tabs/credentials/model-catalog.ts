/**
 * Curated LiteLLM model catalog shown in the agent Config tab.
 *
 * Why a local catalog?
 *   The full provider model lists live in the server (provider-factory,
 *   ai-agents schemas) which the client must not import. This is a small,
 *   hand-picked subset of LiteLLM-compatible model IDs that we expose to the
 *   user. Keep IDs in sync with the server's accepted model names.
 *
 * `provider` matches the ProviderKey used by the integrações catalog so the
 * model picker can highlight which models belong to the agent's provider.
 */

export type ModelProvider = "openai" | "anthropic" | "google"

export interface CuratedModel {
  /** LiteLLM / API model identifier persisted on the agent. */
  id: string
  /** Human label shown in the dropdown. */
  label: string
  provider: ModelProvider
  /** Short hint (speed / cost / capability) shown under the label. */
  hint: string
}

export const CURATED_MODELS: readonly CuratedModel[] = [
  // OpenAI
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", hint: "Equilíbrio entre custo e qualidade" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "openai", hint: "Rápido e econômico" },
  // Anthropic
  {
    id: "claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet",
    provider: "anthropic",
    hint: "Forte em raciocínio e escrita",
  },
  {
    id: "claude-3-5-haiku-20241022",
    label: "Claude 3.5 Haiku",
    provider: "anthropic",
    hint: "Baixa latência",
  },
  // Google
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    provider: "google",
    hint: "Multimodal e veloz",
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    provider: "google",
    hint: "Contexto longo",
  },
] as const

/** Find a curated model by its persisted id (case-insensitive). */
export function findModelById(id: string | null | undefined): CuratedModel | null {
  if (!id) return null
  const lower = id.toLowerCase()
  return CURATED_MODELS.find((m) => m.id.toLowerCase() === lower) ?? null
}
