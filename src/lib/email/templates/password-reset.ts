interface PasswordResetParams { name: string; resetUrl: string; expirationMinutes?: number }

export function getPasswordResetEmailTemplate({ name, resetUrl, expirationMinutes }: PasswordResetParams): string {
  const expiry = expirationMinutes ? ` (expira em ${expirationMinutes} minutos)` : ''
  return `<h1>Redefinição de Senha</h1><p>Olá ${name}, <a href="${resetUrl}">clique aqui</a> para redefinir sua senha${expiry}.</p>`
}
