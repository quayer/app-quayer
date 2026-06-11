/**
 * readErrorMessage — extrai uma mensagem legível de um Response HTTP de erro.
 *
 * Tolerante aos envelopes do Igniter ({ error }, { message }, { data: { ... } })
 * e a corpos texto/HTML (trunca em 240 chars). Util compartilhado da tab
 * Publicar — substitui as cópias que viviam em channel-picker-section,
 * channel-credential-form e channel-selector-card.
 */

export async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const text = await response.text().catch(() => "")
  if (!text) return fallback

  try {
    const json = JSON.parse(text) as {
      error?: unknown
      message?: unknown
      data?: { error?: unknown; message?: unknown }
    }
    const candidate =
      json.message ?? json.error ?? json.data?.message ?? json.data?.error
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate
    }
  } catch {
    // Corpo texto/HTML — usa o texto truncado abaixo.
  }

  return text.trim().slice(0, 240) || fallback
}
