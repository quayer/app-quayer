import { uazapiClient } from '@/lib/providers/adapters/uazapi/uazapi.client'
import { database } from '@/server/services/database'

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length < 12 ? `55${digits}` : digits
}

export async function sendWhatsAppOTP(phone: string, code: string): Promise<void> {
  const normalized = normalizePhone(phone)

  // Busca a primeira conexão que tem token da instância UAZAPI configurado
  const conn = await database.connection.findFirst({
    where: { uazapiToken: { not: null } },
    select: { uazapiToken: true },
    orderBy: { createdAt: 'asc' }
  })

  // Fallback: usar UAZAPI_INSTANCE_TOKEN do ambiente se nenhuma conexão no DB tiver token
  const token = conn?.uazapiToken ?? process.env.UAZAPI_INSTANCE_TOKEN ?? null

  if (!token) {
    throw new Error('Nenhuma instância WhatsApp disponível')
  }

  // Enviar OTP com botão de copiar código via /send/menu
  // Fallback para /send/text caso /send/menu falhe (compatibilidade)
  try {
    await uazapiClient.sendMenu(
      '',
      token,
      {
        number: normalized,
        type: 'button',
        text: `*Quayer* — Seu código de acesso:\n\n*${code}*\n\nVálido por 10 minutos. Não compartilhe.`,
        choices: [
          `Copiar código|copy:${code}`,
        ],
        footerText: 'quayer.com',
      }
    )
  } catch (err) {
    console.warn('[WhatsApp OTP] sendMenu falhou, usando sendText como fallback:', err)
    await uazapiClient.sendText(
      '',
      token,
      {
        number: normalized,
        text: `*Quayer* — Seu código de acesso:\n\n*${code}*\n\nVálido por 10 minutos. Não compartilhe.`
      }
    )
  }
}
