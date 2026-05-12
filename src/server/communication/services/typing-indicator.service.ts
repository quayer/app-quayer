/**
 * typing-indicator.service — Envia "composing" via UAZ /send/presence.
 *
 * Fire-and-forget: NUNCA lanca para o caller. Falhas viram console.warn.
 * Inspirado em granvinhas/process-message/utils/typing.ts (sendUazapiTyping),
 * porem com API enxuta (3 args) e sem dependencia do payload completo.
 *
 * Uso:
 *   await sendTypingIndicator(token, baseUrl, recipient)
 */

const TYPING_DELAY_MS = 30000
const TYPING_PATH = '/send/presence'
const COMPOSING = 'composing' as const

/**
 * Envia indicador "composing" para `recipient` via UAZ.
 * - token: token UAZ da instancia (header `token`)
 * - baseUrl: ex. "https://uaz.example.com" (sem barra final)
 * - recipient: numero/jid do destinatario
 *
 * Sempre resolve `void`. Em caso de falha, apenas loga.
 */
export async function sendTypingIndicator(
  token: string,
  baseUrl: string,
  recipient: string,
): Promise<void> {
  if (!token) {
    console.warn('[typing-indicator] token ausente — pulando envio')
    return
  }
  if (!recipient) {
    console.warn('[typing-indicator] recipient ausente — pulando envio')
    return
  }
  if (!baseUrl) {
    console.warn('[typing-indicator] baseUrl ausente — pulando envio')
    return
  }

  const url = `${baseUrl.replace(/\/+$/, '')}${TYPING_PATH}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token,
      },
      body: JSON.stringify({
        number: recipient,
        presence: COMPOSING,
        delay: TYPING_DELAY_MS,
      }),
    })

    if (!response.ok) {
      let detail = ''
      try {
        detail = await response.text()
      } catch {
        // ignore
      }
      console.warn(
        `[typing-indicator] UAZ respondeu ${response.status} ao enviar presence`,
        detail.slice(0, 200),
      )
    }
  } catch (err) {
    console.warn(
      '[typing-indicator] erro ao enviar presence:',
      err instanceof Error ? err.message : err,
    )
  }
}
