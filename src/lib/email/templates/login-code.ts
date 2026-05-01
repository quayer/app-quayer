interface LoginCodeParams { name: string; code: string; magicLink: string; expirationMinutes?: number }

export function getLoginCodeEmailTemplate({ name, code, magicLink, expirationMinutes }: LoginCodeParams): string {
  const expiry = expirationMinutes ? ` (expira em ${expirationMinutes} minutos)` : ''
  return `<h1>Código de Login</h1><p>Olá ${name}, seu código é: <strong>${code}</strong>${expiry}. <a href="${magicLink}">Ou clique aqui</a>.</p>`
}
