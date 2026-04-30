import { headers } from 'next/headers'

export async function requireAdmin() {
  const headersList = await headers()
  const role = headersList.get('x-user-role')
  if (role !== 'admin') {
    throw new Error('Unauthorized: admin access required')
  }
  return {
    userId: headersList.get('x-user-id') || '',
    email: headersList.get('x-user-email') || '',
    role,
    currentOrgId: headersList.get('x-current-org-id') || '',
  }
}

const PRISMA_ERROR_MAP: Record<string, string> = {
  P2002: 'Registro duplicado',
  P2025: 'Registro não encontrado',
  P2003: 'Referência inválida',
}

export function sanitizeError(error: unknown): string {
  if (process.env.NODE_ENV === 'development') {
    console.error('[Admin Action] Error:', error)
  }

  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  ) {
    const code = (error as { code: string }).code
    if (PRISMA_ERROR_MAP[code]) {
      return PRISMA_ERROR_MAP[code]
    }
  }

  return 'Erro interno do servidor'
}

export async function getActionIdentifier(): Promise<string> {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  if (userId) return userId
  const forwarded = headersList.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = headersList.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}
