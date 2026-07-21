/**
 * Auth/Identity — porta mecânica para oRPC (lote 4a do controller auth).
 *
 * Origem: ./admin.routes.ts + ./linked-accounts.routes.ts +
 * ./otp-preferences.routes.ts + ./profile.routes.ts (8 actions).
 *
 * Preservação de URL (basePath /api/v1 + controller /auth + action):
 *   listUsers             GET    /api/v1/auth/users
 *   listLinkedAccounts    GET    /api/v1/auth/me/linked-accounts
 *   unlinkAccount         DELETE /api/v1/auth/me/linked-accounts/:provider
 *   getOtpPreferences     GET    /api/v1/auth/me/otp-preferences
 *   updateOtpPreferences  PATCH  /api/v1/auth/me/otp-preferences
 *   me                    GET    /api/v1/auth/me
 *   updateMe              PATCH  /api/v1/auth/me
 *   uploadAvatar          POST   /api/v1/auth/me/avatar
 *
 * Fidelidade: validação manual do provider no unlink (mensagem/status),
 * guarda de único método de login, gate 2FA das preferências OTP, rate limit
 * do /me (mesmo prefixo), validação por magic bytes do avatar e o storage
 * service REUSADO. Shapes de sucesso via ok().
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database as db } from '@/server/services/database'
import { storage, BUCKETS } from '@/server/services/storage'
import { RateLimiter } from '@/lib/rate-limit/rate-limiter'
import { getClientIdentifier, createAuditLog } from '../_shared/helpers'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { requireAuth } from '@/orpc/auth.middleware'
import { requireCsrf } from '@/orpc/csrf.middleware'

/**
 * Cópia 1:1 de profile.routes.ts — detecção de MIME real por magic bytes
 * (GIF deliberadamente rejeitado: tracking pixel / payload escondido).
 */
function detectImageMimeFromBuffer(
  buffer: Buffer,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null

  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
    return 'image/png'

  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp'

  return null
}

/** Mesma config/prefixo de profile.routes.ts — limite compartilhado via Redis. */
const meRateLimiter = new RateLimiter({
  limit: 120,
  window: 60,
  prefix: 'ratelimit:me',
  failClosedInProduction: true,
})

const authed = base.use(requireAuth)
const authedCsrf = authed.use(requireCsrf)

/** Guarda comum: user autenticado presente (defensivo — o middleware já barra). */
function userOf(context: { auth: { session: { user: unknown } } }) {
  const user = context.auth.session.user as {
    id: string
    role: string
    currentOrgId: string | null
  } | null
  if (!user) throw new ORPCError('UNAUTHORIZED', { message: 'Unauthorized' })
  return user
}

// ──────────────────────────────────────────────────────────────────────────
// LIST USERS — GET /auth/users (admin only)
// ──────────────────────────────────────────────────────────────────────────
export const listUsers = authedCsrf
  .route({
    method: 'GET',
    path: '/auth/users',
    summary: 'List Users',
    description: 'List all users (admin only)',
  })
  .handler(async ({ context }) => {
    const user = userOf(context)

    if (user.role !== 'admin') {
      throw new ORPCError('FORBIDDEN', { message: 'Admin access required' })
    }

    const orgId = user.currentOrgId
    if (!orgId) {
      throw new ORPCError('BAD_REQUEST', { message: 'No organization selected' })
    }

    const users = await db.user.findMany({
      where: {
        organizations: { some: { organizationId: orgId } },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        emailVerified: true,
        currentOrgId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(users)
  })

// ──────────────────────────────────────────────────────────────────────────
// LINKED ACCOUNTS — GET /auth/me/linked-accounts
// ──────────────────────────────────────────────────────────────────────────
export const listLinkedAccounts = authed
  .route({
    method: 'GET',
    path: '/auth/me/linked-accounts',
    summary: 'List Linked Accounts',
    description: 'List external identity providers linked to the authenticated user',
  })
  .handler(async ({ context }) => {
    const authUser = userOf(context)

    const identities = await db.userIdentity.findMany({
      where: { userId: authUser.id },
      orderBy: { connectedAt: 'asc' },
    })

    return ok(
      identities.map((i: { provider: string; identifier: string; connectedAt: Date }) => ({
        provider: i.provider,
        identifier: i.identifier,
        connectedAt: i.connectedAt.toISOString(),
      })),
    )
  })

// ──────────────────────────────────────────────────────────────────────────
// UNLINK — DELETE /auth/me/linked-accounts/{provider}
// ──────────────────────────────────────────────────────────────────────────
export const unlinkAccount = authedCsrf
  .route({
    method: 'DELETE',
    path: '/auth/me/linked-accounts/{provider}',
    summary: 'Unlink Account',
    description: 'Remove an external identity provider from the authenticated user',
  })
  // Validação do provider é MANUAL (safeParse) para preservar mensagem/status.
  .input(z.object({ provider: z.string() }))
  .handler(async ({ input, context }) => {
    const authUser = userOf(context)

    const providerParseResult = z.enum(['google', 'whatsapp']).safeParse(input.provider)

    if (!providerParseResult.success) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Provider inválido. Use "google" ou "whatsapp".',
      })
    }

    const provider = providerParseResult.data

    const user = await db.user.findUnique({
      where: { id: authUser.id },
      select: { password: true, currentOrgId: true },
    })

    if (!user) throw new ORPCError('NOT_FOUND', { message: 'Usuário não encontrado' })

    // Contagem de todos os métodos de auth disponíveis
    const [identityCount, passkeyCount] = await Promise.all([
      db.userIdentity.count({ where: { userId: authUser.id } }),
      db.passkeyCredential.count({ where: { userId: authUser.id } }),
    ])
    const totalAuthMethods = identityCount + (user.password ? 1 : 0) + passkeyCount

    if (totalAuthMethods <= 1) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Você não pode remover seu único método de login. Adicione outro método antes.',
      })
    }

    try {
      await db.userIdentity.delete({
        where: {
          userId_provider: { userId: authUser.id, provider },
        },
      })
    } catch (err: unknown) {
      // Prisma P2025: record not found
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        throw new ORPCError('NOT_FOUND', { message: 'Conta vinculada não encontrada.' })
      }
      throw err
    }

    await createAuditLog(
      'user.identity.unlink',
      authUser.id,
      { headers: context.headers },
      { provider },
      user.currentOrgId,
    )

    return ok({ unlinked: true })
  })

// ──────────────────────────────────────────────────────────────────────────
// OTP PREFERENCES — GET/PATCH /auth/me/otp-preferences
// ──────────────────────────────────────────────────────────────────────────
export const getOtpPreferences = authed
  .route({
    method: 'GET',
    path: '/auth/me/otp-preferences',
    summary: 'Get OTP Preferences',
    description: 'Get user OTP method preferences',
  })
  .handler(async ({ context }) => {
    const authUser = userOf(context)

    const prefs = await db.userPreferences.findUnique({
      where: { userId: authUser.id },
      select: { otpEmailDisabled: true, otpPhoneDisabled: true },
    })

    return ok({
      otpEmailDisabled: prefs?.otpEmailDisabled ?? false,
      otpPhoneDisabled: prefs?.otpPhoneDisabled ?? false,
    })
  })

export const updateOtpPreferences = authedCsrf
  .route({
    method: 'PATCH',
    path: '/auth/me/otp-preferences',
    summary: 'Update OTP Preferences',
    description: 'Enable or disable OTP login methods (requires active 2FA)',
  })
  .input(
    z.object({
      otpEmailDisabled: z.boolean().optional(),
      otpPhoneDisabled: z.boolean().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const authUser = userOf(context)

    const user = await db.user.findUnique({
      where: { id: authUser.id },
      select: { twoFactorEnabled: true },
    })

    // Só permite desabilitar OTP se o TOTP estiver ativo — evita lockout
    const { otpEmailDisabled, otpPhoneDisabled } = input
    if ((otpEmailDisabled === true || otpPhoneDisabled === true) && !user?.twoFactorEnabled) {
      throw new ORPCError('FORBIDDEN', {
        message: 'Ative a autenticação em duas etapas antes de desabilitar métodos OTP.',
      })
    }

    await db.userPreferences.upsert({
      where: { userId: authUser.id },
      create: {
        userId: authUser.id,
        ...(otpEmailDisabled !== undefined && { otpEmailDisabled }),
        ...(otpPhoneDisabled !== undefined && { otpPhoneDisabled }),
      },
      update: {
        ...(otpEmailDisabled !== undefined && { otpEmailDisabled }),
        ...(otpPhoneDisabled !== undefined && { otpPhoneDisabled }),
      },
    })

    return ok({ updated: true })
  })

// ──────────────────────────────────────────────────────────────────────────
// ME — GET /auth/me
// ──────────────────────────────────────────────────────────────────────────
export const me = authed
  .route({
    method: 'GET',
    path: '/auth/me',
    summary: 'Get Current User',
    description: 'Get authenticated user data',
  })
  .handler(async ({ context }) => {
    const authUser = userOf(context)

    const clientIp = getClientIdentifier({ headers: context.headers })
    const rateLimit = await meRateLimiter.check(authUser.id + ':' + clientIp)
    if (!rateLimit.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: 'Too many requests' })
    }

    const user = await db.user.findUnique({
      where: { id: authUser.id },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
        preferences: {
          select: {
            messageSignature: true,
            aiSuggestionsEnabled: true,
          },
        },
      },
    })

    if (!user) throw new ORPCError('NOT_FOUND', { message: 'User not found' })

    return ok({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      currentOrgId: user.currentOrgId,
      isAgency: user.isAgency,
      avatarUrl: user.avatarUrl ?? null,
      organizations: user.organizations.map((org) => ({
        id: org.organization.id,
        name: org.organization.name,
        slug: org.organization.slug,
        role: org.role,
      })),
      preferences: user.preferences,
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// UPDATE ME — PATCH /auth/me
// ──────────────────────────────────────────────────────────────────────────
export const updateMe = authed
  .route({
    method: 'PATCH',
    path: '/auth/me',
    summary: 'Update Current User',
    description: 'Update authenticated user profile fields',
  })
  .input(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, 'Nome não pode ser vazio')
        .max(120, 'Nome muito longo')
        .optional(),
      language: z.string().trim().min(2, 'Idioma inválido').max(10, 'Idioma inválido').optional(),
      timezone: z
        .string()
        .trim()
        .min(1, 'Fuso horário inválido')
        .max(64, 'Fuso horário inválido')
        .optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const authUser = userOf(context)

    const { name, language, timezone } = input

    // TODO(schema) herdado do original: language/timezone entram quando os
    // campos existirem no User — hoje só name é persistido; os demais são
    // ecoados de volta para compat com o frontend.
    const data: { name?: string } = {}
    if (typeof name === 'string') data.name = name

    if (Object.keys(data).length > 0) {
      await db.user.update({
        where: { id: authUser.id },
        data,
      })
    }

    const user = await db.user.findUnique({
      where: { id: authUser.id },
      include: {
        organizations: {
          where: { isActive: true },
          include: { organization: true },
        },
        preferences: {
          select: {
            messageSignature: true,
            aiSuggestionsEnabled: true,
          },
        },
      },
    })

    if (!user) throw new ORPCError('NOT_FOUND', { message: 'Usuário não encontrado' })

    return ok({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      currentOrgId: user.currentOrgId,
      language: language ?? null,
      timezone: timezone ?? null,
      avatarUrl: user.avatarUrl ?? null,
      organizations: user.organizations.map((org) => ({
        id: org.organization.id,
        name: org.organization.name,
        slug: org.organization.slug,
        role: org.role,
      })),
      preferences: user.preferences,
    })
  })

// ──────────────────────────────────────────────────────────────────────────
// UPLOAD AVATAR — POST /auth/me/avatar
// ──────────────────────────────────────────────────────────────────────────
export const uploadAvatar = authedCsrf
  .route({
    method: 'POST',
    path: '/auth/me/avatar',
    summary: 'Upload User Avatar',
    description: 'Upload a new avatar for the authenticated user',
  })
  .input(
    z.object({
      fileBase64: z.string().min(1, 'Conteúdo do arquivo é obrigatório'),
      fileName: z.string().min(1, 'Nome do arquivo é obrigatório'),
      // GIF excluído: tracking pixel / payload escondido
      mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/, 'Tipo de imagem não suportado'),
    }),
  )
  .handler(async ({ input, context }) => {
    const authUser = userOf(context)

    if (!storage.isAvailable()) {
      throw new ORPCError('SERVICE_UNAVAILABLE', {
        status: 503,
        message:
          'Armazenamento não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
      })
    }

    const { fileBase64, fileName, mimeType } = input
    const fileBuffer = Buffer.from(fileBase64, 'base64')

    // Magic-byte validation: o conteúdo real precisa ser uma imagem suportada
    const detectedMime = detectImageMimeFromBuffer(fileBuffer)
    if (!detectedMime) {
      throw new ORPCError('BAD_REQUEST', {
        message:
          'Conteúdo do arquivo não corresponde a uma imagem suportada (jpeg, png, webp)',
      })
    }
    if (detectedMime !== mimeType) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Tipo de arquivo declarado não corresponde ao conteúdo real',
      })
    }

    const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5MB
    if (fileBuffer.length === 0) {
      throw new ORPCError('BAD_REQUEST', { message: 'Arquivo vazio' })
    }
    if (fileBuffer.length > MAX_AVATAR_SIZE) {
      throw new ORPCError('BAD_REQUEST', {
        message: `Avatar excede o limite de ${MAX_AVATAR_SIZE / 1024 / 1024}MB`,
      })
    }

    const ext = fileName.includes('.') ? fileName.split('.').pop() : 'jpg'
    const safeExt = (ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `avatars/${authUser.id}-${Date.now()}.${safeExt}`

    const result = await storage.upload(BUCKETS.PROFILES, path, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    })

    const avatarUrl = await storage.getSignedUrl(BUCKETS.PROFILES, result.path)

    await db.user.update({ where: { id: authUser.id }, data: { avatarUrl } })

    return ok({ avatarUrl })
  })

/** Lote identity do namespace auth (api.auth.* no client Igniter). */
export const identityActions = {
  listUsers,
  listLinkedAccounts,
  unlinkAccount,
  getOtpPreferences,
  updateOtpPreferences,
  me,
  updateMe,
  uploadAvatar,
}
