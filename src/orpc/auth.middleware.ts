/**
 * oRPC SPIKE — middleware de auth equivalente a authProcedure({ required: true })
 *
 * Porta mecânica de src/server/core/auth/procedures/auth.procedure.ts.
 * REUSA os mesmos utilitários do app (nada de validação reimplementada):
 *   - validateBearerToken  (@/lib/auth/jwt)          — verificação do JWT
 *   - database             (@/server/services/database) — Prisma singleton
 *   - AuthRepository       (@/server/core/auth/repositories/auth.repository)
 *   - getCustomRolePermissions (@/lib/auth/permissions)
 *
 * Diferenças de sintaxe vs Igniter (semântica idêntica):
 *   - Igniter: procedure retorna `Response.json(..., {status:401})` para negar
 *     e um objeto para estender o contexto.
 *   - oRPC: middleware lança `ORPCError('UNAUTHORIZED')` (vira 401 no
 *     OpenAPIHandler) e estende contexto com `next({ context: {...} })`.
 */
import { ORPCError } from '@orpc/server'
import type { User } from '@prisma/client'
import { validateBearerToken } from '@/lib/auth/jwt'
import { database } from '@/server/services/database'
import { AuthRepository } from '@/server/core/auth/repositories/auth.repository'
import { apiKeysRepository } from '@/server/core/api-keys/api-keys.repository'
import { getCustomRolePermissions, type CustomRoleContext } from '@/lib/auth/permissions'
import { base } from './base'

export type AuthContext = {
  auth: {
    session: { user: User | null }
    repository: AuthRepository
    customRole: CustomRoleContext | null
  }
}

/**
 * Extrai o token do header Authorization ou do cookie httpOnly `accessToken`
 * — mesma lógica (copiada 1:1) da authProcedure original.
 */
function extractToken(headers: Headers): string | null {
  const authHeader = headers.get('authorization') || headers.get('Authorization')

  let cookieToken: string | undefined
  if (!authHeader) {
    const cookieHeader = headers.get('cookie') || ''
    cookieToken = cookieHeader
      .split(';')
      .map((c: string) => c.trim())
      .find((c: string) => c.startsWith('accessToken='))
      ?.split('=')
      .slice(1)
      .join('=')
  }

  const effective = authHeader || (cookieToken ? `Bearer ${cookieToken}` : null)
  if (!effective) return null
  return effective.startsWith('Bearer ') ? effective.slice(7) : effective
}

/**
 * Equivalente a `use: [authProcedure({ required: true })]`.
 * (O caminho `required: false` da procedure original é trivial de portar da
 * mesma forma — retornaria user null em vez de lançar — omitido no spike por
 * não ser usado pelo controller messages.)
 */
export const requireAuth = base.middleware(async ({ context, next }) => {
  const token = extractToken(context.headers)
  const authRepo = new AuthRepository(database)

  if (!token) {
    throw new ORPCError('UNAUTHORIZED', { message: 'Token não fornecido' })
  }

  const payload = validateBearerToken(token)
  if (!payload) {
    throw new ORPCError('UNAUTHORIZED', { message: 'Token inválido' })
  }

  const user = await database.user.findUnique({
    where: { id: payload.userId },
    include: {
      organizations: {
        where: { isActive: true },
        include: { organization: true },
      },
    },
  })

  if (!user || user.isActive === false) {
    throw new ORPCError('UNAUTHORIZED', { message: 'Token inválido' })
  }

  // Mesma extensão do objeto user feita pela authProcedure original.
  const userWithOrg = {
    ...user,
    organizationId: payload.currentOrgId,
  }

  // Resolve CustomRole — cópia 1:1 da authProcedure.
  let customRoleCtx: CustomRoleContext | null = null
  const currentUserOrg = user.organizations.find(
    (uo) => uo.organizationId === payload.currentOrgId && uo.isActive,
  )
  if (currentUserOrg && (currentUserOrg as { customRoleId?: string | null }).customRoleId) {
    const customRoleId = (currentUserOrg as { customRoleId?: string }).customRoleId as string
    const permissions = await getCustomRolePermissions(customRoleId, database)
    if (permissions) {
      const roleRecord = await database.customRole.findUnique({
        where: { id: customRoleId },
        select: { id: true, slug: true, priority: true },
      })
      if (roleRecord) {
        customRoleCtx = {
          id: roleRecord.id,
          slug: roleRecord.slug,
          permissions,
          priority: roleRecord.priority,
        }
      }
    }
  }

  return next({
    context: {
      auth: {
        session: { user: userWithOrg as User },
        repository: authRepo,
        customRole: customRoleCtx,
      },
    } satisfies AuthContext,
  })
})

/**
 * Equivalente a `use: [authOrApiKeyProcedure({ required: true })]`.
 *
 * Porta mecânica de src/server/core/auth/procedures/api-key.procedure.ts
 * (authOrApiKeyProcedure, caminho required:true — o único usado pelos
 * controllers migrados). Ordem preservada: API Key primeiro (header
 * X-API-Key), depois fallback para JWT/cookie de sessão.
 *
 * Diferenças deliberadas vs requireAuth (fiéis ao original):
 *   - No caminho API Key, o user assume currentOrgId/organizationId da KEY
 *     (não do payload JWT) e customRole é sempre null.
 *   - No caminho JWT, a resolução de CustomRole usa user.currentOrgId do
 *     BANCO (a procedure original não lê payload.currentOrgId aqui).
 *   - Mensagens de erro idênticas às da procedure original.
 */
export const authOrApiKey = base.middleware(async ({ context, next }) => {
  const headers = context.headers
  const apiKeyHeader = headers.get('x-api-key') || headers.get('X-API-Key')

  // 1. API Key primeiro (mais simples, sem JWT)
  if (apiKeyHeader) {
    let auth: AuthContext['auth']
    try {
      const validation = await apiKeysRepository.validateKey(apiKeyHeader)

      if (!validation.valid || !validation.apiKey) {
        throw new ORPCError('UNAUTHORIZED', { message: 'API Key inválida, expirada ou revogada.' })
      }

      const { apiKey: keyData } = validation

      const user = await database.user.findUnique({
        where: { id: keyData.userId },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      })

      if (!user || user.isActive === false) {
        throw new ORPCError('UNAUTHORIZED', {
          message: 'Usuário vinculado à API Key não encontrado ou inativo.',
        })
      }

      // Atualizar lastUsedAt (fire and forget) — mesma extração de IP
      const clientIp = headers.get('x-forwarded-for') || headers.get('x-real-ip') || null
      apiKeysRepository.updateLastUsed(keyData.id, clientIp).catch(() => {})

      const userWithOrg = {
        ...user,
        currentOrgId: keyData.organizationId,
        organizationId: keyData.organizationId,
      }

      auth = {
        session: { user: userWithOrg as User },
        repository: new AuthRepository(database),
        customRole: null,
      }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      console.error('[AuthOrApiKey] API Key error:', error)
      throw new ORPCError('INTERNAL_SERVER_ERROR', { message: 'Erro ao validar API Key.' })
    }
    return next({ context: { auth } satisfies AuthContext })
  }

  // 2. Fallback para JWT/session (required: true)
  const token = extractToken(headers)
  if (!token) {
    throw new ORPCError('UNAUTHORIZED', { message: 'Token não fornecido' })
  }

  let auth: AuthContext['auth']
  try {
    const decoded = validateBearerToken(token)
    if (!decoded?.userId) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Token inválido' })
    }

    const user = await database.user.findUnique({
      where: { id: decoded.userId },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
      },
    })

    if (!user || user.isActive === false) {
      throw new ORPCError('UNAUTHORIZED', { message: 'Usuário não encontrado' })
    }

    // CustomRole resolvido pela org do BANCO (user.currentOrgId) — cópia 1:1.
    let customRoleCtx: CustomRoleContext | null = null
    const currentUserOrg = user.organizations?.find(
      (uo) => uo.organizationId === user.currentOrgId && uo.isActive,
    )
    if (currentUserOrg && (currentUserOrg as { customRoleId?: string | null }).customRoleId) {
      const customRoleId = (currentUserOrg as { customRoleId?: string }).customRoleId as string
      const permissions = await getCustomRolePermissions(customRoleId, database)
      if (permissions) {
        const roleRecord = await database.customRole.findUnique({
          where: { id: customRoleId },
          select: { id: true, slug: true, priority: true },
        })
        if (roleRecord) {
          customRoleCtx = {
            id: roleRecord.id,
            slug: roleRecord.slug,
            permissions,
            priority: roleRecord.priority,
          }
        }
      }
    }

    auth = {
      session: { user },
      repository: new AuthRepository(database),
      customRole: customRoleCtx,
    }
  } catch (error) {
    if (error instanceof ORPCError) throw error
    throw new ORPCError('UNAUTHORIZED', { message: 'Token expirado ou inválido' })
  }

  return next({ context: { auth } satisfies AuthContext })
})
