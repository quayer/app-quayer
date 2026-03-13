/**
 * Verified Domains Controller
 *
 * Allows org masters to add, verify (DNS TXT or email), update, and remove
 * verified domains. Verified domains can be used for auto-join on signup.
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { authProcedure } from '@/server/features/auth/procedures/auth.procedure'
import { emailService } from '@/lib/email'
import crypto from 'crypto'
import dns from 'dns'
import { promisify } from 'util'

const resolveTxt = promisify(dns.resolveTxt)

// ==========================================
// Constants
// ==========================================

/**
 * Blocklist of generic email provider domains that cannot be used for auto-join.
 */
const BLOCKED_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'yahoo.com.br',
  'hotmail.com.br',
  'outlook.com.br',
  'live.com',
  'aol.com',
  'icloud.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
  'tutanota.com',
])

/**
 * In-memory rate limiter for domain verifications: 10 per hour per org.
 */
const verificationAttempts = new Map<string, { count: number; resetAt: number }>()

function checkVerificationRateLimit(orgId: string): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour
  const maxAttempts = 10

  const entry = verificationAttempts.get(orgId)

  if (!entry || now >= entry.resetAt) {
    verificationAttempts.set(orgId, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  if (entry.count >= maxAttempts) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  entry.count++
  return { allowed: true, remaining: maxAttempts - entry.count }
}

// ==========================================
// In-memory store for email verification codes
// ==========================================
const emailVerificationCodes = new Map<string, { code: string; expiresAt: number }>()

function generateEmailCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

// ==========================================
// Zod Schemas
// ==========================================

const addDomainSchema = z.object({
  domain: z.string()
    .min(3)
    .max(253)
    .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/, 'Domínio inválido')
    .transform((d) => d.toLowerCase()),
  method: z.enum(['DNS_TXT', 'EMAIL']),
})

const verifyDomainDnsSchema = z.object({
  domainId: z.string().uuid(),
})

const verifyDomainEmailSchema = z.object({
  domainId: z.string().uuid(),
  code: z.string().length(6).regex(/^\d+$/, 'Código deve conter apenas dígitos'),
})

const updateDomainSchema = z.object({
  autoJoin: z.boolean().optional(),
  defaultRoleId: z.string().uuid().nullable().optional(),
})

const removeDomainSchema = z.object({
  domainId: z.string().uuid(),
})

// ==========================================
// Controller
// ==========================================

export const verifiedDomainsController = igniter.controller({
  name: 'verifiedDomains',
  path: '/verified-domains',
  description: 'Verified Domains — add, verify, update and remove org domains',
  actions: {
    // ==========================================
    // ADD DOMAIN — start verification process
    // ==========================================
    addDomain: igniter.mutation({
      name: 'AddDomain',
      description: 'Add a domain for verification (DNS TXT or email)',
      path: '/',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: addDomainSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem gerenciar domínios')
        }

        const { domain, method } = request.body

        // Block generic email domains
        if (BLOCKED_DOMAINS.has(domain)) {
          return response.badRequest(`O domínio "${domain}" é um provedor de email genérico e não pode ser verificado`)
        }

        // Check if domain already exists for this org
        const existing = await context.db.verifiedDomain.findUnique({
          where: { organizationId_domain: { organizationId: orgId, domain } },
        })
        if (existing) {
          return response.badRequest(`O domínio "${domain}" já foi adicionado a esta organização`)
        }

        // Generate verification token
        const verificationToken = `quayer-verify=${crypto.randomBytes(32).toString('hex')}`

        const created = await context.db.verifiedDomain.create({
          data: {
            organizationId: orgId,
            domain,
            verificationMethod: method,
            verificationToken,
          },
        })

        // If EMAIL method, send verification email to admin@domain
        if (method === 'EMAIL') {
          const code = generateEmailCode()
          emailVerificationCodes.set(created.id, {
            code,
            expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
          })

          try {
            await emailService.send({
              to: `admin@${domain}`,
              subject: 'Verificação de Domínio - Quayer',
              html: `
                <h2>Verificação de Domínio</h2>
                <p>Alguém solicitou a verificação do domínio <strong>${domain}</strong> na plataforma Quayer.</p>
                <p>Use o código abaixo para confirmar a verificação:</p>
                <h1 style="font-family: monospace; font-size: 32px; letter-spacing: 4px; text-align: center; padding: 16px; background: #f4f4f5; border-radius: 8px;">${code}</h1>
                <p>Este código expira em 30 minutos.</p>
                <p>Se você não solicitou esta verificação, ignore este email.</p>
              `,
            })
          } catch {
            console.error(`Failed to send domain verification email to admin@${domain}`)
          }
        }

        return response.created({
          id: created.id,
          domain: created.domain,
          verificationMethod: created.verificationMethod,
          verificationToken: method === 'DNS_TXT' ? created.verificationToken : undefined,
          createdAt: created.createdAt,
          instructions: method === 'DNS_TXT'
            ? `Adicione o seguinte registro TXT no DNS do seu domínio: ${verificationToken}`
            : `Email de verificação enviado para admin@${domain}. Insira o código de 6 dígitos para verificar.`,
        })
      },
    }),

    // ==========================================
    // VERIFY DOMAIN DNS — check DNS TXT record
    // ==========================================
    verifyDomainDns: igniter.mutation({
      name: 'VerifyDomainDns',
      description: 'Verify domain ownership via DNS TXT record lookup',
      path: '/verify-dns',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: verifyDomainDnsSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem verificar domínios')
        }

        // Rate limit: 10 verifications per hour per org
        const rateCheck = checkVerificationRateLimit(orgId)
        if (!rateCheck.allowed) {
          return Response.json(
            { error: `Limite de verificações atingido. Tente novamente em ${rateCheck.retryAfterSeconds}s` },
            { status: 429 }
          )
        }

        const { domainId } = request.body

        const domain = await context.db.verifiedDomain.findUnique({
          where: { id: domainId },
        })

        if (!domain) return response.notFound('Domínio não encontrado')
        if (domain.organizationId !== orgId) return response.forbidden('Domínio não pertence a esta organização')
        if (domain.verifiedAt) return response.badRequest('Domínio já verificado')
        if (domain.verificationMethod !== 'DNS_TXT') {
          return response.badRequest('Este domínio usa verificação por email, não DNS')
        }

        try {
          const records = await resolveTxt(domain.domain)
          // records is string[][] — flatten
          const allRecords = records.flat()
          const found = allRecords.some((record) => record.includes(domain.verificationToken))

          if (!found) {
            return response.badRequest('Registro TXT de verificação não encontrado no DNS. Verifique a propagação e tente novamente.')
          }

          // Mark as verified
          const updated = await context.db.verifiedDomain.update({
            where: { id: domainId },
            data: { verifiedAt: new Date() },
          })

          console.log(`[AUDIT] domain_verified: org=${orgId}, domain=${domain.domain}, method=DNS_TXT`)

          return response.success({
            id: updated.id,
            domain: updated.domain,
            verifiedAt: updated.verifiedAt,
            message: 'Domínio verificado com sucesso via DNS TXT',
          })
        } catch (err: any) {
          if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
            return response.badRequest('Nenhum registro TXT encontrado para este domínio. Verifique o DNS e tente novamente.')
          }
          console.error('DNS resolution error:', err)
          return response.badRequest('Erro ao consultar DNS. Tente novamente mais tarde.')
        }
      },
    }),

    // ==========================================
    // VERIFY DOMAIN EMAIL — check 6-digit code
    // ==========================================
    verifyDomainEmail: igniter.mutation({
      name: 'VerifyDomainEmail',
      description: 'Verify domain ownership via email code sent to admin@domain',
      path: '/verify-email',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: verifyDomainEmailSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem verificar domínios')
        }

        // Rate limit
        const rateCheck = checkVerificationRateLimit(orgId)
        if (!rateCheck.allowed) {
          return Response.json(
            { error: `Limite de verificações atingido. Tente novamente em ${rateCheck.retryAfterSeconds}s` },
            { status: 429 }
          )
        }

        const { domainId, code } = request.body

        const domain = await context.db.verifiedDomain.findUnique({
          where: { id: domainId },
        })

        if (!domain) return response.notFound('Domínio não encontrado')
        if (domain.organizationId !== orgId) return response.forbidden('Domínio não pertence a esta organização')
        if (domain.verifiedAt) return response.badRequest('Domínio já verificado')
        if (domain.verificationMethod !== 'EMAIL') {
          return response.badRequest('Este domínio usa verificação por DNS, não email')
        }

        // Check the stored verification code
        const stored = emailVerificationCodes.get(domainId)
        if (!stored) {
          return response.badRequest('Código de verificação expirado ou não encontrado. Remova o domínio e adicione novamente.')
        }

        if (Date.now() > stored.expiresAt) {
          emailVerificationCodes.delete(domainId)
          return response.badRequest('Código de verificação expirado. Remova o domínio e adicione novamente.')
        }

        if (stored.code !== code) {
          return response.badRequest('Código de verificação inválido')
        }

        // Verified! Clean up code and update domain
        emailVerificationCodes.delete(domainId)

        const updated = await context.db.verifiedDomain.update({
          where: { id: domainId },
          data: { verifiedAt: new Date() },
        })

        console.log(`[AUDIT] domain_verified: org=${orgId}, domain=${domain.domain}, method=EMAIL`)

        return response.success({
          id: updated.id,
          domain: updated.domain,
          verifiedAt: updated.verifiedAt,
          message: 'Domínio verificado com sucesso via email',
        })
      },
    }),

    // ==========================================
    // LIST — all verified domains for current org
    // ==========================================
    list: igniter.query({
      name: 'ListVerifiedDomains',
      description: 'List all verified domains for the current organization',
      path: '/',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem gerenciar domínios')
        }

        const domains = await context.db.verifiedDomain.findMany({
          where: { organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          include: {
            defaultRole: {
              select: { id: true, name: true, slug: true },
            },
          },
        })

        return response.success(domains)
      },
    }),

    // ==========================================
    // UPDATE DOMAIN — toggle autoJoin, set defaultRoleId
    // ==========================================
    updateDomain: igniter.mutation({
      name: 'UpdateVerifiedDomain',
      description: 'Update verified domain settings (autoJoin, defaultRoleId)',
      path: '/:id',
      method: 'PUT',
      use: [authProcedure({ required: true })],
      body: updateDomainSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem gerenciar domínios')
        }

        const { id } = request.params as { id: string }
        const { autoJoin, defaultRoleId } = request.body

        const domain = await context.db.verifiedDomain.findUnique({
          where: { id },
        })

        if (!domain) return response.notFound('Domínio não encontrado')
        if (domain.organizationId !== orgId) return response.forbidden('Domínio não pertence a esta organização')
        if (!domain.verifiedAt) return response.badRequest('Domínio precisa estar verificado antes de alterar configurações')

        // Validate defaultRoleId if provided
        if (defaultRoleId) {
          const role = await context.db.customRole.findUnique({ where: { id: defaultRoleId } })
          if (!role || role.organizationId !== orgId) {
            return response.badRequest('Role padrão não encontrado nesta organização')
          }
        }

        const updated = await context.db.verifiedDomain.update({
          where: { id },
          data: {
            ...(autoJoin !== undefined && { autoJoin }),
            ...(defaultRoleId !== undefined && { defaultRoleId }),
          },
          include: {
            defaultRole: {
              select: { id: true, name: true, slug: true },
            },
          },
        })

        console.log(`[AUDIT] domain_updated: org=${orgId}, domain=${domain.domain}, autoJoin=${updated.autoJoin}`)

        return response.success(updated)
      },
    }),

    // ==========================================
    // REMOVE DOMAIN — delete
    // ==========================================
    removeDomain: igniter.mutation({
      name: 'RemoveVerifiedDomain',
      description: 'Remove a verified domain (does not affect existing members)',
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem gerenciar domínios')
        }

        const { id } = request.params as { id: string }

        const domain = await context.db.verifiedDomain.findUnique({
          where: { id },
        })

        if (!domain) return response.notFound('Domínio não encontrado')
        if (domain.organizationId !== orgId) return response.forbidden('Domínio não pertence a esta organização')

        await context.db.verifiedDomain.delete({ where: { id } })

        // Clean up any stored email verification codes
        emailVerificationCodes.delete(id)

        console.log(`[AUDIT] domain_removed: org=${orgId}, domain=${domain.domain}`)

        return response.success({ message: 'Domínio removido com sucesso' })
      },
    }),
  },
})
