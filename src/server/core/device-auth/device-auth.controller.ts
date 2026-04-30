/**
 * Device Authorization Flow Controller
 *
 * Implements the OAuth 2.0 Device Authorization Grant (RFC 8628) pattern,
 * adapted for Quayer's CLI authentication flow.
 *
 * Flow:
 *   1. CLI calls POST /device-auth/request  → receives deviceCode + userCode
 *   2. User opens browser, navigates to verificationUrl, and clicks Authorize
 *   3. CLI polls POST /device-auth/poll every 5s until approved/denied/expired
 *   4. On approval, poll returns the full API key (one-time retrieval)
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import crypto from 'crypto'
import { database } from '@/server/services/database'
import { apiKeysRepository } from '@/server/core/api-keys/api-keys.repository'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure 40-char hex device code.
 * Used by the CLI to poll for status — never shown to users.
 */
function generateDeviceCode(): string {
  return crypto.randomBytes(20).toString('hex')
}

/**
 * Generates a human-readable 8-char user code in ABCD-1234 format.
 * Short enough to type manually, unambiguous characters only.
 */
function generateUserCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O to avoid confusion with 1/0
  const digits = '0123456789'

  const randomLetter = () => letters[crypto.randomInt(0, letters.length)]
  const randomDigit = () => digits[crypto.randomInt(0, digits.length)]

  const letterPart = [randomLetter(), randomLetter(), randomLetter(), randomLetter()].join('')
  const digitPart = [randomDigit(), randomDigit(), randomDigit(), randomDigit()].join('')

  return `${letterPart}-${digitPart}`
}

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'http://localhost:3000'

// ── Controller ────────────────────────────────────────────────────────────────

export const deviceAuthController = igniter.controller({
  name: 'deviceAuth',
  path: '/device-auth',
  description: 'Device Authorization Flow for CLI and programmatic clients (RFC 8628)',
  actions: {
    // =========================================================================
    // REQUEST — CLI initiates the device auth flow
    // =========================================================================
    request: igniter.mutation({
      name: 'Request Device Auth',
      description: 'Start a device authorization flow. Returns codes for the CLI to display and poll.',
      path: '/request',
      method: 'POST',
      body: z.object({
        scopes: z.array(z.string()).optional().default(['read', 'write']),
        keyName: z.string().min(1).max(100).optional().default('CLI'),
      }),
      handler: async ({ request, response }) => {
        const { scopes, keyName } = request.body

        const deviceCode = generateDeviceCode()
        const userCode = generateUserCode()

        const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

        try {
          await database.deviceAuthRequest.create({
            data: {
              deviceCode,
              userCode,
              scopes,
              keyName,
              expiresAt,
            },
          })

          return response.json({
            deviceCode,
            userCode,
            verificationUrl: `${APP_URL}/auth/device?code=${userCode}`,
            expiresIn: 900, // seconds
            interval: 5,   // seconds between polls
          })
        } catch (error) {
          console.error('[DeviceAuth] Error creating request:', error)
          return response.badRequest('Erro ao iniciar autorização de dispositivo')
        }
      },
    }),

    // =========================================================================
    // INFO — Frontend fetches device auth request details before showing UI
    // =========================================================================
    info: igniter.query({
      name: 'Device Auth Info',
      description: 'Get details of a device authorization request by user code. Used by the frontend authorize page.',
      path: '/info',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user as any
        if (!user) return response.unauthorized('Não autenticado')

        const url = new URL(request.raw.url, 'http://localhost')
        const userCode = url.searchParams.get('userCode')?.trim().toUpperCase()

        if (!userCode) {
          return response.badRequest('Parâmetro userCode é obrigatório')
        }

        const record = await database.deviceAuthRequest.findUnique({
          where: { userCode },
        })

        if (!record) {
          return Response.json({ error: 'NOT_FOUND', message: 'Código não encontrado' }, { status: 404 })
        }

        if (record.status === 'APPROVED') {
          return Response.json({ error: 'ALREADY_USED', message: 'Este código já foi utilizado' }, { status: 409 })
        }

        if (record.status === 'DENIED') {
          return Response.json({ error: 'DENIED', message: 'Este código foi negado' }, { status: 409 })
        }

        if (record.expiresAt < new Date() || record.status === 'EXPIRED') {
          if (record.status !== 'EXPIRED') {
            await database.deviceAuthRequest.update({
              where: { id: record.id },
              data: { status: 'EXPIRED' },
            })
          }
          return Response.json({ error: 'EXPIRED', message: 'Este código expirou' }, { status: 410 })
        }

        // Get org name for display
        const orgId = user.currentOrgId || user.organizationId
        let organizationName = 'Organização'
        if (orgId) {
          const org = await database.organization.findUnique({
            where: { id: orgId },
            select: { name: true },
          })
          if (org) organizationName = org.name
        }

        return response.json({
          userCode: record.userCode,
          keyName: record.keyName,
          scopes: record.scopes,
          organizationName,
          expiresAt: record.expiresAt.toISOString(),
        })
      },
    }),

    // =========================================================================
    // POLL — CLI polls for status until approved/denied/expired
    // =========================================================================
    poll: igniter.mutation({
      name: 'Poll Device Auth',
      description: 'Check the status of a device authorization request. Returns the API key once approved.',
      path: '/poll',
      method: 'POST',
      body: z.object({
        deviceCode: z.string().min(1),
      }),
      handler: async ({ request, response }) => {
        const { deviceCode } = request.body

        const record = await database.deviceAuthRequest.findUnique({
          where: { deviceCode },
        })

        if (!record) {
          return response.badRequest('Código de dispositivo inválido')
        }

        // Mark expired if past expiresAt
        if (record.expiresAt < new Date() && record.status === 'PENDING') {
          await database.deviceAuthRequest.update({
            where: { id: record.id },
            data: { status: 'EXPIRED' },
          })
          return response.json({ status: 'expired' })
        }

        switch (record.status) {
          case 'EXPIRED':
            return response.json({ status: 'expired' })

          case 'DENIED':
            return response.json({ status: 'denied' })

          case 'PENDING':
            return response.json({ status: 'pending' })

          case 'APPROVED': {
            // Guard: plaintext was already consumed (second poll after approval)
            if (!record.apiKeyPlaintext) {
              return response.badRequest('Chave já foi recuperada. Use a chave fornecida anteriormente.')
            }

            // One-time read: clear the plaintext so it cannot be retrieved again
            const [orgData] = await Promise.all([
              record.organizationId
                ? database.organization.findUnique({
                    where: { id: record.organizationId },
                    select: { name: true },
                  })
                : Promise.resolve(null),
              database.deviceAuthRequest.update({
                where: { id: record.id },
                data: { apiKeyPlaintext: null },
              }),
            ])

            return response.json({
              status: 'approved',
              apiKey: record.apiKeyPlaintext,
              orgName: orgData?.name ?? null,
              scopes: record.scopes,
            })
          }

          default:
            return response.badRequest('Status desconhecido')
        }
      },
    }),

    // =========================================================================
    // APPROVE — Browser user approves or denies the request
    // =========================================================================
    approve: igniter.mutation({
      name: 'Approve Device Auth',
      description: 'Approve or deny a pending device authorization request.',
      path: '/approve',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        userCode: z.string().min(1),
        action: z.enum(['approve', 'deny']),
      }),
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) {
          return response.unauthorized('Não autenticado')
        }

        const { userCode, action } = request.body

        // Find the request — must be PENDING and not expired
        const record = await database.deviceAuthRequest.findUnique({
          where: { userCode },
        })

        if (!record) {
          return response.badRequest('Código de usuário inválido')
        }

        if (record.status !== 'PENDING') {
          return response.badRequest(`Esta solicitação já foi ${record.status === 'APPROVED' ? 'aprovada' : record.status === 'DENIED' ? 'negada' : 'expirada'}`)
        }

        if (record.expiresAt < new Date()) {
          await database.deviceAuthRequest.update({
            where: { id: record.id },
            data: { status: 'EXPIRED' },
          })
          return response.badRequest('Esta solicitação de autorização expirou')
        }

        // ── DENY ──────────────────────────────────────────────────────────────
        if (action === 'deny') {
          await database.deviceAuthRequest.update({
            where: { id: record.id },
            data: {
              status: 'DENIED',
              userId: user.id,
            },
          })
          return response.json({ success: true, action: 'denied' })
        }

        // ── APPROVE ───────────────────────────────────────────────────────────
        const orgId = user.currentOrgId || user.organizationId
        if (!orgId) {
          return response.badRequest('Nenhuma organização selecionada. Selecione uma organização antes de autorizar.')
        }

        try {
          // Create the API key — repository returns fullKey only at creation time
          const apiKey = await apiKeysRepository.create({
            name: record.keyName,
            organizationId: orgId,
            userId: user.id,
            scopes: record.scopes,
            expiresAt: null, // No expiration for device-auth keys (user can revoke manually)
          })

          // Persist approval: store plaintext temporarily for one-time CLI retrieval
          await database.deviceAuthRequest.update({
            where: { id: record.id },
            data: {
              status: 'APPROVED',
              apiKeyId: apiKey.id,
              apiKeyPlaintext: apiKey.key, // Cleared after first successful poll
              userId: user.id,
              organizationId: orgId,
            },
          })

          return response.json({
            success: true,
            action: 'approved',
            keyName: apiKey.name,
          })
        } catch (error) {
          console.error('[DeviceAuth] Error creating API key on approval:', error)
          return response.badRequest('Erro ao criar API Key para o dispositivo')
        }
      },
    }),
  },
})
