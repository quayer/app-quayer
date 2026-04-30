const AUTH_ERROR_TRANSLATIONS: Record<string, string> = {
  'Invalid or expired code': 'Código inválido ou expirado.',
  'Code expired': 'Código expirado. Reenvie para obter um novo.',
  'Invalid code': 'Código inválido. Tente novamente.',
  'Invalid TOTP code.': 'Código inválido. Tente novamente.',
  'Invalid recovery code.': 'Código de recuperação inválido.',
  'Account disabled': 'Conta desativada. Entre em contato com o suporte.',
  'User not found': 'Usuário não encontrado.',
  'Too many attempts': 'Muitas tentativas. Aguarde antes de tentar novamente.',
}

export function translateAuthError(message: string): string {
  for (const [en, pt] of Object.entries(AUTH_ERROR_TRANSLATIONS)) {
    if (message.includes(en)) return pt
  }
  return message
}
