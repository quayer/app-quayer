interface VerificationParams { name: string; code: string; expirationMinutes?: number }

export function getVerificationEmailTemplate({ name, code, expirationMinutes }: VerificationParams): string {
  const expiry = expirationMinutes ? ` (válido por ${expirationMinutes} minutos)` : ''
  return `<h1>Verificação de Email</h1><p>Olá ${name}, seu código é: <strong>${code}</strong>${expiry}</p>`
}
