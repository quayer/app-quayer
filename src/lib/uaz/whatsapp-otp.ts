export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export async function sendWhatsAppOTP(phone: string, code: string): Promise<boolean> {
  const apiKey = process.env.UAZ_API_KEY
  const instanceId = process.env.UAZ_INSTANCE_ID
  const baseUrl = process.env.UAZ_API_URL ?? 'https://api.uazapi.com'

  if (!apiKey || !instanceId) {
    console.warn('[whatsapp-otp] UAZ_API_KEY or UAZ_INSTANCE_ID not configured')
    return false
  }

  try {
    const res = await fetch(`${baseUrl}/message/sendText/${instanceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: `${phone}@s.whatsapp.net`, text: `Seu código de verificação: *${code}*` }),
    })
    return res.ok
  } catch {
    return false
  }
}
