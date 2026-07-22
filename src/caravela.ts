/**
 * Caravela — instância do Quayer (o cais de onde a caravela zarpa).
 *
 * Configura o @caravela/core com as peças REAIS do app:
 *   - authenticator `sessionOrApiKey`: a MESMA lógica da
 *     authOrApiKeyProcedure (API Key primeiro, fallback JWT/cookie),
 *     reusando apiKeysRepository/validateBearerToken/database.
 *   - tenancy.scope: client Prisma escopado por organização via Proxy —
 *     WHITELIST de models mapeados; reads coletivos ganham
 *     where.organizationId, creates ganham data.organizationId; operações
 *     por chave única passam direto (posse verificada no handler, como no
 *     original). Model fora da whitelist = ERRO explícito (fail-closed).
 *   - audit sink: grava os eventos OCSF do pipeline no AuditLog existente.
 *
 * Primeiro consumidor real: departments.caravela.ts (dogfood do critério
 * SPEC-CORE §9).
 */
import { Caravela, CaravelaError, type CaravelaAuditSink } from '@caravela/core'
import type { Prisma, User } from '@prisma/client'
import { database } from '@/server/services/database'
import { validateBearerToken } from '@/lib/auth/jwt'
import { apiKeysRepository } from '@/server/core/api-keys/api-keys.repository'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** User autenticado com a org ativa resolvida (sessão OU api key). */
export type QuayerUser = User & { currentOrgId: string | null }

// ---------------------------------------------------------------------------
// Authenticator: sessionOrApiKey (paridade com authOrApiKeyProcedure)
// ---------------------------------------------------------------------------

function extractBearerToken(headers: Headers): string | null {
  const authHeader = headers.get('authorization') || headers.get('Authorization')
  let cookieToken: string | undefined
  if (!authHeader) {
    const cookieHeader = headers.get('cookie') || ''
    cookieToken = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('accessToken='))
      ?.split('=')
      .slice(1)
      .join('=')
  }
  const effective = authHeader || (cookieToken ? `Bearer ${cookieToken}` : null)
  if (!effective) return null
  return effective.startsWith('Bearer ') ? effective.slice(7) : effective
}

async function sessionOrApiKey({ headers }: { headers: Headers }): Promise<QuayerUser | null> {
  // 1. API Key primeiro (auth stateless; org vem da KEY)
  const apiKeyHeader = headers.get('x-api-key') || headers.get('X-API-Key')
  if (apiKeyHeader) {
    const validation = await apiKeysRepository.validateKey(apiKeyHeader)
    if (!validation.valid || !validation.apiKey) {
      throw new CaravelaError('UNAUTHORIZED', {
        message: 'API Key inválida, expirada ou revogada.',
      })
    }
    const keyData = validation.apiKey
    const user = await database.user.findUnique({ where: { id: keyData.userId } })
    if (!user || user.isActive === false) {
      throw new CaravelaError('UNAUTHORIZED', {
        message: 'Usuário vinculado à API Key não encontrado ou inativo.',
      })
    }
    const clientIp = headers.get('x-forwarded-for') || headers.get('x-real-ip') || null
    apiKeysRepository.updateLastUsed(keyData.id, clientIp).catch(() => {})
    return { ...user, currentOrgId: keyData.organizationId }
  }

  // 2. Fallback JWT/cookie de sessão
  const token = extractBearerToken(headers)
  if (!token) return null // core converte em 401 'Não autenticado'

  const payload = validateBearerToken(token)
  if (!payload?.userId) {
    throw new CaravelaError('UNAUTHORIZED', { message: 'Token inválido' })
  }
  const user = await database.user.findUnique({ where: { id: payload.userId } })
  if (!user || user.isActive === false) {
    throw new CaravelaError('UNAUTHORIZED', { message: 'Usuário não encontrado' })
  }
  return user as QuayerUser
}

// ---------------------------------------------------------------------------
// Tenancy: client escopado por Proxy (D1 — o cru fica inalcançável)
// ---------------------------------------------------------------------------

/**
 * Models mapeados no scope (crescem conforme o dogfood avança). Para cada
 * um: reads/updates COLETIVOS ganham where.organizationId; create ganha
 * data.organizationId; operações por chave ÚNICA (findUnique/update/delete/
 * upsert com where unique) passam direto — a posse é verificada no fluxo do
 * handler, como no código original (BOLA intra-tenant é authorization, não
 * scope — SEGURANCA §4).
 */
const ORG_SCOPED_MODELS = new Set(['department', 'departmentMember', 'userOrganization'])

const COLLECTIVE_WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'count',
  'aggregate',
  'updateMany',
  'deleteMany',
])
const CREATE_OPS = new Set(['create'])

type AnyDelegate = Record<string, (args?: Record<string, unknown>) => unknown>

export type ScopedDb = {
  [model: string]: AnyDelegate | undefined
}

function scopeDatabase(db: unknown, orgId: string): ScopedDb {
  const raw = db as Record<string, AnyDelegate | undefined>
  return new Proxy({} as ScopedDb, {
    get(_target, modelName: string) {
      if (typeof modelName !== 'string' || modelName.startsWith('$')) {
        throw new Error(
          `[caravela:scope] acesso a "${String(modelName)}" não é permitido no client escopado`,
        )
      }
      if (!ORG_SCOPED_MODELS.has(modelName)) {
        throw new Error(
          `[caravela:scope] model "${modelName}" não está mapeado no scope por organização — ` +
            `mapeie-o em ORG_SCOPED_MODELS (src/caravela.ts) ou declare a action como unscoped`,
        )
      }
      const delegate = raw[modelName]
      // Delegate ausente (migration não landou) fica visível para o handler
      // degradar — mesma resiliência do original.
      if (!delegate) return undefined

      return new Proxy({} as AnyDelegate, {
        get(_t, op: string) {
          return (args: Record<string, unknown> = {}) => {
            if (COLLECTIVE_WHERE_OPS.has(op)) {
              const where = (args.where as Record<string, unknown> | undefined) ?? {}
              return delegate[op]!({ ...args, where: { ...where, organizationId: orgId } })
            }
            if (CREATE_OPS.has(op)) {
              const data = (args.data as Record<string, unknown> | undefined) ?? {}
              return delegate[op]!({ ...args, data: { organizationId: orgId, ...data } })
            }
            return delegate[op]!(args)
          }
        },
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Audit sink: eventos do pipeline -> AuditLog existente
// ---------------------------------------------------------------------------

const auditSink: CaravelaAuditSink = {
  async write(event) {
    // O modelo AuditLog exige userId — negações ANÔNIMAS (401 sem user)
    // não são persistíveis neste sink na v0.1; ficam no log da aplicação.
    // (Evolução registrada: coluna userId opcional OU sink dedicado.)
    if (!event.actor.user_id) {
      console.warn('[caravela:audit] evento anônimo não persistido:', event.api.operation)
      return
    }
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: event.api.operation,
      resource: 'caravela',
      userId: event.actor.user_id,
      metadata: event as unknown as Prisma.InputJsonValue,
    }
    if (event.tenant.org_id) data.organizationId = event.tenant.org_id
    await database.auditLog.create({ data })
  },
}

// ---------------------------------------------------------------------------
// A instância
// ---------------------------------------------------------------------------

export const caravela = Caravela.init({
  db: database,
  authenticators: {
    sessionOrApiKey,
  },
  tenancy: {
    orgIdOf: (user: QuayerUser) => user.currentOrgId,
    scope: scopeDatabase,
  },
  audit: { sink: auditSink },
})
