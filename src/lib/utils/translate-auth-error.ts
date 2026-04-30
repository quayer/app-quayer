const AUTH_ERROR_MAP: Record<string, string> = {
  'Invalid credentials': 'Credenciais inválidas',
  'User not found': 'Usuário não encontrado',
  'Invalid password': 'Senha inválida',
  'Email not verified': 'E-mail não verificado',
  'Account disabled': 'Conta desativada',
  'Too many attempts': 'Muitas tentativas. Tente novamente mais tarde',
  'Invalid token': 'Token inválido ou expirado',
  'Token expired': 'Token expirado',
  'Unauthorized': 'Não autorizado',
  'Invalid code': 'Código inválido',
  'Code expired': 'Código expirado',
}

export function translateAuthError(message: string): string {
  if (!message) return 'Ocorreu um erro inesperado'
  for (const [key, value] of Object.entries(AUTH_ERROR_MAP)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return value
  }
  return message
}
