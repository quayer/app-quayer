export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Envia OTP via WhatsApp usando a UAZAPI.
 *
 * Env vars (todas obrigatorias para o envio funcionar):
 *   UAZAPI_INSTANCE_TOKEN  — id/token da instancia conectada (e o "instance ID" no path da UAZAPI)
 *   UAZAPI_ADMIN_TOKEN     — apikey global do tenant
 *   UAZAPI_BASE_URL        — base URL (ex: https://quayer.uazapi.com). Aceita UAZAPI_URL como fallback
 *
 * Aliases legados (`UAZ_API_KEY`, `UAZ_INSTANCE_ID`, `UAZ_API_URL`) sao aceitos
 * para compatibilidade caso algum ambiente ainda esteja com nomes antigos.
 */
export async function sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
  const apiKey =
    process.env.UAZAPI_ADMIN_TOKEN ?? process.env.UAZ_API_KEY
  const instanceId =
    process.env.UAZAPI_INSTANCE_TOKEN ?? process.env.UAZ_INSTANCE_ID
  const baseUrl =
    process.env.UAZAPI_BASE_URL ??
    process.env.UAZAPI_URL ??
    process.env.UAZ_API_URL ??
    'https://api.uazapi.com'

  if (!apiKey || !instanceId) {
    console.warn(
      '[whatsapp-otp] UAZAPI_ADMIN_TOKEN or UAZAPI_INSTANCE_TOKEN not configured — cannot send WhatsApp OTP'
    )
    return false
  }

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/message/sendText/${instanceId}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({
        number: `${phone}@s.whatsapp.net`,
        text: `Seu codigo de verificacao Quayer: *${code}*\n\nNao compartilhe esse codigo com ninguem.`,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(
        `[whatsapp-otp] UAZAPI returned ${res.status} for phone=${phone.slice(0, 4)}***: ${text.slice(0, 200)}`
      )
      return false
    }
    return true
  } catch (err) {
    console.error('[whatsapp-otp] fetch failed:', err instanceof Error ? err.message : err)
    return false
  }
}
