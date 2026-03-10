import { igniter } from '@/igniter'
import { z } from 'zod'
import { shareRepository } from '../share.repository'
import type {
  GenerateShareLinkInput,
  GenerateShareLinkOutput,
  ValidateTokenOutput,
  GenerateClientQROutput,
  CheckConnectionStatusOutput,
} from '../share.interfaces'
import { database } from '@/services/database'

export const shareController = igniter.controller({
  name: 'share',
  path: '/share',
  actions: {
    /**
     * Generate shareable link for instance
     * POST /api/v1/share/generate
     */
    generate: igniter.mutation({
      path: '/generate',
      method: 'POST',
      body: z.object({
        instanceId: z.string().uuid(),
        expiresInHours: z.number().positive().optional().default(24),
      }),
      handler: async ({ request, response }) => {
        // Verify instance exists
        const { instanceId, expiresInHours } = request.body

        const instance = await database.instance.findUnique({
          where: { id: instanceId },
        })

        if (!instance) {
          return response.notFound('Instância não encontrada')
        }

        // Calculate expiration
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + (expiresInHours || 24))

        // Create share token
        const shareToken = await shareRepository.createShareToken(
          instanceId,
          expiresAt
        )

        // Generate shareable URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const url = `${baseUrl}/connect/${shareToken.token}`

        return response.success({
          token: shareToken.token,
          url,
          expiresAt,
        })
      },
    }),

    /**
     * Validate token and get instance info
     * GET /api/v1/share/validate/:token
     */
    validate: igniter.query({
      path: '/validate/:token',
      handler: async ({ request, response }) => {
        const { token } = request.params as { token: string }

        const shareToken = await shareRepository.findByTokenWithInstance(token)

        if (!shareToken) {
          return response.success({
            valid: false,
          })
        }

        // Check if expired
        const now = new Date()
        if (shareToken.expiresAt < now) {
          return response.success({
            valid: false,
          })
        }

        return response.success({
          valid: true,
          instanceId: shareToken.instanceId,
          instanceName: shareToken.instance.name,
          expiresAt: shareToken.expiresAt,
        })
      },
    }),

    /**
     * Generate QR code for client
     * POST /api/v1/share/qr
     */
    generateQR: igniter.mutation({
      path: '/qr',
      method: 'POST',
      body: z.object({
        token: z.string().uuid(),
      }),
      handler: async ({ request, response }) => {
        const { token } = request.body

        const shareToken = await shareRepository.findByTokenWithInstance(token)

        if (!shareToken) {
          return response.unauthorized('Token inválido ou expirado')
        }

        // Check if expired
        const now = new Date()
        if (shareToken.expiresAt < now) {
          return response.unauthorized('Token expirado')
        }

        const instance = shareToken.instance

        // Generate QR code via UAZapi
        try {
          const uazapiResponse = await fetch(
            `https://api.uazapi.com/instances/${instance.brokerId}/qr`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${instance.uazapiToken}`,
                'Content-Type': 'application/json',
              },
            }
          )

          if (!uazapiResponse.ok) {
            const errorData = await uazapiResponse.json()
            return response.badRequest(errorData.error?.message || 'Erro ao gerar QR Code')
          }

          const data = await uazapiResponse.json()

          // Mark token as used
          if (!shareToken.usedAt) {
            await shareRepository.markAsUsed(token)
          }

          return response.success({
            qrCode: data.qrCode,
            expires: data.expires || 120000, // Default 2 minutes
          })
        } catch (error: any) {
          return response.badRequest(error?.message || 'Erro ao gerar QR Code')
        }
      },
    }),

    /**
     * Check connection status
     * GET /api/v1/share/status/:token
     */
    checkStatus: igniter.query({
      path: '/status/:token',
      handler: async ({ request, response }) => {
        const { token } = request.params as { token: string }

        const shareToken = await shareRepository.findByTokenWithInstance(token)

        if (!shareToken) {
          return response.success({
            status: 'expired',
          })
        }

        // Check if expired
        const now = new Date()
        if (shareToken.expiresAt < now) {
          return response.success({
            status: 'expired',
          })
        }

        const instance = shareToken.instance

        // Check instance status
        if (instance.status === 'connected') {
          return response.success({
            status: 'connected',
            connectedAt: instance.lastConnected || undefined,
          })
        }

        return response.success({
          status: 'pending',
        })
      },
    }),
  },
})
