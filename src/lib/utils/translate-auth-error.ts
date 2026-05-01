const errorMap: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email ou senha inválidos.',
  ACCOUNT_NOT_FOUND: 'Conta não encontrada.',
  ACCOUNT_LOCKED: 'Conta bloqueada temporariamente. Tente novamente mais tarde.',
  EMAIL_NOT_VERIFIED: 'Email não verificado. Verifique sua caixa de entrada.',
  OTP_EXPIRED: 'Código expirado. Solicite um novo.',
  OTP_INVALID: 'Código inválido. Verifique e tente novamente.',
  OTP_EMAIL_DISABLED: 'Login por email desabilitado. Use outro método.',
  OTP_PHONE_DISABLED: 'Login por WhatsApp desabilitado. Use outro método.',
  TOO_MANY_REQUESTS: 'Muitas tentativas. Aguarde antes de tentar novamente.',
  TURNSTILE_FAILED: 'Verificação de segurança falhou. Recarregue a página.',
  CSRF_INVALID: 'Sessão inválida. Recarregue a página.',
  PASSKEY_FAILED: 'Autenticação com chave de acesso falhou.',
  TWO_FACTOR_REQUIRED: 'Autenticação em dois fatores necessária.',
  TWO_FACTOR_INVALID: 'Código de autenticação inválido.',
  UNAUTHORIZED: 'Você precisa estar autenticado.',
  FORBIDDEN: 'Acesso não autorizado.',
}

export function translateAuthError(error: string): string {
  if (!error) return 'Ocorreu um erro inesperado.'
  const upperKey = error.toUpperCase().replace(/\s+/g, '_')
  return errorMap[upperKey] ?? errorMap[error] ?? error
}
