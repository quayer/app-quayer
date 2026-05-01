/**
 * API Key Procedure
 *
 * Procedure Igniter.js que autentica requests via header X-API-Key.
 * Alternativa ao authProcedure para acesso programatico (CLI, webhooks, integrações).
 *
 * Uso: use: [apiKeyProcedure()]
 * Ou combinado: use: [authOrApiKeyProcedure()]
 */

import { igniter } from '@/igniter'
import { AuthRepository } from '../repositories/auth.repository'
import { apiKeysRepository } from '@/server/core/api-keys/api-keys.repository'
import type { User } from '@prisma/client'
import type { ApiKeyScope } from '@/server/core/api-keys/api-keys.schemas'
import type { CustomRoleContext } from '@/lib/auth/permissions'

type ApiKeyProcedureOptions = {
  /** Scopes necessarios para esta action */
  requiredScopes?: ApiKeyScope[]
}

type AuthContext = {
  auth: {
    session: {
      user: User | null
    }
    repository: AuthRepository
    customRole: CustomRoleContext | null
  }
}

/**
 * Extrai API Key do header X-API-Key
 */
function getApiKeyFromHeader(request: { headers: { get(name: string): string | null } }): string | null {
  return request.headers.get('x-api-key') || request.headers.get('X-API-Key') || null
}

/**
 * Verifica se o usuario tem os scopes necessarios
 */
function hasRequiredScopes(keyScopes: string[], requiredScopes: ApiKeyScope[]): boolean {
  if (requiredScopes.length === 0) return true
  // admin scope tem acesso total
  if (keyScopes.includes('admin')) return true
  // read/write genericos cobrem sub-scopes
  return requiredScopes.every(scope => {
    if (keyScopes.includes(scope)) return true
    // 'read' cobre qualquer scope ':read'
    const [, action] = scope.split(':')
    if (action === 'read' && keyScopes.includes('read')) return true
    if (action === 'write' && keyScopes.includes('write')) return true
    return false
  })
}

/**
 * Procedure de autenticacao via API Key.
 * Le header X-API-Key, valida, e injeta user/org no contexto.
 */
export const apiKeyProcedure = igniter.procedure({
  name: 'ApiKeyProcedure',
  handler: async (
    options: ApiKeyProcedureOptions = {},
    ctx
  ): Promise<AuthContext | Response> => {
    const { request, context } = ctx
    const { requiredScopes = [] } = options

    const apiKey = getApiKeyFromHeader(request)

    if (!apiKey) {
      return Response.json(
        { error: 'API Key não fornecida. Envie o header X-API-Key.' },
        { status: 401 }
      )
    }

    try {
      // Validar a key
      const validation = await apiKeysRepository.validateKey(apiKey)

      if (!validation.valid || !validation.apiKey) {
        return Response.json(
          { error: 'API Key inválida, expirada ou revogada.' },
          { status: 401 }
        )
      }

      const { apiKey: keyData } = validation

      // Verificar scopes
      if (!hasRequiredScopes(keyData.scopes, requiredScopes)) {
        return Response.json(
          { error: `Scopes insuficientes. Necessário: ${requiredScopes.join(', ')}` },
          { status: 403 }
        )
      }

      // Buscar user vinculado a key
      const user = await context.db.user.findUnique({
        where: { id: keyData.userId },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      })

      if (!user || user.isActive === false) {
        return Response.json(
          { error: 'Usuário vinculado à API Key não encontrado ou inativo.' },
          { status: 401 }
        )
      }

      // Atualizar lastUsedAt (fire and forget)
      const clientIp = request.headers.get('x-forwarded-for')
        || request.headers.get('x-real-ip')
        || null
      apiKeysRepository.updateLastUsed(keyData.id, clientIp).catch(() => {})

      // Montar user com org da key
      const userWithOrg = {
        ...user,
        currentOrgId: keyData.organizationId,
        organizationId: keyData.organizationId,
      }

      const authRepo = new AuthRepository(context.db)

      return {
        auth: {
          session: {
            user: userWithOrg as User,
          },
          repository: authRepo,
          customRole: null,
        },
      }
    } catch (error) {
      console.error('[ApiKeyProcedure] Error:', error)
      return Response.json(
        { error: 'Erro ao validar API Key.' },
        { status: 500 }
      )
    }
  },
})

/**
 * Procedure combinado: tenta session (JWT) primeiro, depois API Key.
 * Use este em rotas que precisam funcionar tanto no browser quanto na CLI.
 */
export const authOrApiKeyProcedure = igniter.procedure({
  name: 'AuthOrApiKeyProcedure',
  handler: async (
    options: ApiKeyProcedureOptions & { required?: boolean } = { required: true },
    ctx
  ): Promise<AuthContext | Response> => {
    const { request, context } = ctx
    const { required = true, requiredScopes = [] } = options

    // 1. Tentar API Key primeiro (mais simples, sem JWT)
    const apiKeyHeader = getApiKeyFromHeader(request)
    if (apiKeyHeader) {
      // Delegar para apiKeyProcedure logic inline
      try {
        const validation = await apiKeysRepository.validateKey(apiKeyHeader)

        if (!validation.valid || !validation.apiKey) {
          return Response.json(
            { error: 'API Key inválida, expirada ou revogada.' },
            { status: 401 }
          )
        }

        const { apiKey: keyData } = validation

        if (!hasRequiredScopes(keyData.scopes, requiredScopes)) {
          return Response.json(
            { error: `Scopes insuficientes. Necessário: ${requiredScopes.join(', ')}` },
            { status: 403 }
          )
        }

        const user = await context.db.user.findUnique({
          where: { id: keyData.userId },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        })

        if (!user || user.isActive === false) {
          return Response.json(
            { error: 'Usuário vinculado à API Key não encontrado ou inativo.' },
            { status: 401 }
          )
        }

        const clientIp = request.headers.get('x-forwarded-for')
          || request.headers.get('x-real-ip')
          || null
        apiKeysRepository.updateLastUsed(keyData.id, clientIp).catch(() => {})

        const userWithOrg = {
          ...user,
          currentOrgId: keyData.organizationId,
          organizationId: keyData.organizationId,
        }

        const authRepo = new AuthRepository(context.db)

        return {
          auth: {
            session: {
              user: userWithOrg as User,
            },
            repository: authRepo,
            customRole: null,
          },
        }
      } catch (error) {
        console.error('[AuthOrApiKeyProcedure] API Key error:', error)
        return Response.json(
          { error: 'Erro ao validar API Key.' },
          { status: 500 }
        )
      }
    }

    // 2. Fallback para JWT/session
    const { AuthRepository: AuthRepo } = await import('../repositories/auth.repository')
    const { validateBearerToken } = await import('@/lib/auth/jwt')
    const { getCustomRolePermissions } = await import('@/lib/auth/permissions')

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    let cookieToken: string | undefined
    if (!authHeader) {
      const cookieHeader = request.headers.get('cookie') || ''
      cookieToken = cookieHeader
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('accessToken='))
        ?.split('=')
        .slice(1)
        .join('=')
    }

    const effectiveAuthHeader = authHeader || (cookieToken ? `Bearer ${cookieToken}` : null)
    const authRepo = new AuthRepo(context.db)

    if (!effectiveAuthHeader && required) {
      return Response.json({ error: 'Token não fornecido' }, { status: 401 })
    }

    if (!effectiveAuthHeader && !required) {
      return {
        auth: {
          session: { user: null },
          repository: authRepo,
          customRole: null,
        },
      }
    }

    if (!effectiveAuthHeader) {
      return {
        auth: {
          session: { user: null },
          repository: authRepo,
          customRole: null,
        },
      }
    }

    const token = effectiveAuthHeader.replace('Bearer ', '')

    try {
      const decoded = validateBearerToken(token)
      if (!decoded?.userId) {
        if (required) {
          return Response.json({ error: 'Token inválido' }, { status: 401 })
        }
        return {
          auth: {
            session: { user: null },
            repository: authRepo,
            customRole: null,
          },
        }
      }

      const user = await context.db.user.findUnique({
        where: { id: decoded.userId },
        include: {
          organizations: {
            where: { isActive: true },
            include: { organization: true },
          },
        },
      })

      if (!user || user.isActive === false) {
        if (required) {
          return Response.json({ error: 'Usuário não encontrado' }, { status: 401 })
        }
        return {
          auth: {
            session: { user: null },
            repository: authRepo,
            customRole: null,
          },
        }
      }

      let customRoleCtx: CustomRoleContext | null = null
      const currentUserOrg = user.organizations?.find(
        (uo: any) => uo.organizationId === user.currentOrgId && uo.isActive
      )
      if (currentUserOrg && (currentUserOrg as any).customRoleId) {
        const customRoleId = (currentUserOrg as any).customRoleId as string
        const permissions = await getCustomRolePermissions(customRoleId, context.db)
        if (permissions) {
          const roleRecord = await context.db.customRole.findUnique({
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

      return {
        auth: {
          session: { user },
          repository: authRepo,
          customRole: customRoleCtx,
        },
      }
    } catch {
      if (required) {
        return Response.json({ error: 'Token expirado ou inválido' }, { status: 401 })
      }
      return {
        auth: {
          session: { user: null },
          repository: authRepo,
          customRole: null,
        },
      }
    }
  },
})
