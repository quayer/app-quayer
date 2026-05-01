interface WelcomeSignupParams { name: string; code: string; magicLink: string; expirationMinutes?: number }

export function getWelcomeSignupEmailTemplate({ name, code, magicLink, expirationMinutes }: WelcomeSignupParams): string {
  const expiry = expirationMinutes ? ` (expira em ${expirationMinutes} minutos)` : ''
  return `<h1>Bem-vindo ao Quayer, ${name}!</h1><p>Seu código de acesso: <strong>${code}</strong>${expiry}. <a href="${magicLink}">Ou clique aqui para entrar</a>.</p>`
}
