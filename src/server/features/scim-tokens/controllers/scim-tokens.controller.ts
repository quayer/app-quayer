/**
 * SCIM Tokens Controller
 *
 * Gerenciamento de tokens SCIM para integração com IdPs (Okta, Azure AD, etc).
 * Apenas masters da org podem gerenciar tokens.
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import crypto from 'crypto'
import { authProcedure } from '@/server/features/auth/procedures/auth.procedure'
import { hashPassword } from '@/lib/auth/bcrypt'

// ==========================================
// Zod Schemas
// ==========================================

const createScimTokenSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(), // ISO 8601 datetime, optional
})

// ==========================================
// Controller
// ==========================================

export const scimTokensController = igniter.controller({
  name: 'scimTokens',
  path: '/scim-tokens',
  description: 'SCIM Token management — generate and revoke tokens for IdP integration',
  actions: {
    // ==========================================
    // LIST — all SCIM tokens for current org (without hash)
    // ==========================================
    list: igniter.query({
      name: 'ListScimTokens',
      description: 'List all SCIM tokens for the current organization',
      path: '/',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        // Check master/admin role
        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem gerenciar tokens SCIM')
        }

        const tokens = await context.db.scimToken.findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            name: true,
            lastUsedAt: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })

        return response.success(tokens)
      },
    }),

    // ==========================================
    // CREATE — generate a new SCIM token
    // ==========================================
    create: igniter.mutation({
      name: 'CreateScimToken',
      description: 'Generate a new SCIM token for the organization',
      path: '/',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: createScimTokenSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        // Check master/admin role
        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem criar tokens SCIM')
        }

        const { name, expiresAt } = request.body

        // Generate 64 bytes hex token (128 hex chars)
        const plainToken = crypto.randomBytes(64).toString('hex')

        // Hash with bcrypt for storage
        const tokenHash = await hashPassword(plainToken)

        const scimToken = await context.db.scimToken.create({
          data: {
            organizationId: orgId,
            name,
            tokenHash,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          },
          select: {
            id: true,
            name: true,
            expiresAt: true,
            createdAt: true,
          },
        })

        // Return plaintext token only once
        return response.created({
          ...scimToken,
          token: plainToken, // Only shown once at creation
        })
      },
    }),

    // ==========================================
    // REVOKE — revoke a SCIM token
    // ==========================================
    revoke: igniter.mutation({
      name: 'RevokeScimToken',
      description: 'Revoke a SCIM token',
      path: '/:id/revoke',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const orgId = user.organizationId || user.currentOrgId
        if (!orgId) return response.badRequest('Nenhuma organização ativa')

        // Check master/admin role
        const orgRole = user.organizationRole
        if (orgRole !== 'master' && user.role !== 'admin') {
          return response.forbidden('Apenas masters podem revogar tokens SCIM')
        }

        const { id } = request.params as { id: string }

        // Verify the token belongs to this org
        const existing = await context.db.scimToken.findFirst({
          where: { id, organizationId: orgId },
        })

        if (!existing) {
          return response.notFound('Token não encontrado')
        }

        if (existing.revokedAt) {
          return response.badRequest('Token já foi revogado')
        }

        const updated = await context.db.scimToken.update({
          where: { id },
          data: { revokedAt: new Date() },
          select: {
            id: true,
            name: true,
            revokedAt: true,
          },
        })

        return response.success(updated)
      },
    }),
  },
})
