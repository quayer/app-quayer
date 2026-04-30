import { store } from '@/server/services/store'
import { createBullMQAdapter } from '@igniter-js/adapter-bullmq'
import { z } from 'zod'
import { storage, BUCKETS, mediaPath } from '@/server/services/storage'
import { getDatabase } from '@/server/services/database'

/**
 * Job queue adapter for background processing.
 *
 * @remarks
 * Handles asynchronous job processing with BullMQ.
 *
 * @see https://github.com/felipebarcelospro/igniter-js/tree/main/packages/adapter-bullmq
 */
export const jobs = createBullMQAdapter({
  store,
  autoStartWorker: {
    concurrency: 1,
    queues: ['*']
  }
})

export const REGISTERED_JOBS = jobs.merge({
  system: jobs.router({
    jobs: {
      sampleJob: jobs.register({
        name: 'sampleJob',
        input: z.object({
          message: z.string()
        }),
        handler: async ({ input }) => {
          console.log(input.message)
        }
      })
    }
  }),
  storage: jobs.router({
    jobs: {
      uploadMedia: jobs.register({
        name: 'uploadMedia',
        input: z.object({
          messageId: z.string(),
          organizationId: z.string(),
          sessionId: z.string(),
          mediaUrl: z.string(),
          mimeType: z.string().optional(),
          fileName: z.string().optional(),
        }),
        handler: async ({ input }) => {
          if (!storage.isAvailable()) {
            console.log('[Storage Job] Supabase not configured, skipping upload')
            return
          }

          const db = getDatabase()
          const { messageId, organizationId, sessionId, mediaUrl, mimeType } = input

          try {
            let fileBuffer: Buffer

            if (mediaUrl.startsWith('data:')) {
              // Base64 data URI → Buffer
              const base64Data = mediaUrl.split(',')[1]
              fileBuffer = Buffer.from(base64Data, 'base64')
            } else {
              // External URL → download → Buffer
              const response = await fetch(mediaUrl)
              if (!response.ok) {
                console.error(`[Storage Job] Failed to download media: ${response.status}`)
                return
              }
              const arrayBuffer = await response.arrayBuffer()
              fileBuffer = Buffer.from(arrayBuffer)
            }

            // Determine file extension from mimeType
            const ext = mimeTypeToExtension(mimeType || 'application/octet-stream')
            const path = mediaPath(organizationId, sessionId, messageId, ext)

            // Upload to Supabase Storage
            const result = await storage.upload(BUCKETS.MEDIA, path, fileBuffer, {
              contentType: mimeType || 'application/octet-stream',
              upsert: true,
            })

            // Update message with storage path
            await db.message.update({
              where: { id: messageId },
              data: {
                storagePath: result.path,
                storageProvider: 'supabase',
              } as any, // Prisma drift - storagePath/storageProvider pending migration
            })

            console.log(`[Storage Job] Media uploaded: ${result.path} (${fileBuffer.length} bytes)`)
          } catch (error) {
            console.error(`[Storage Job] Upload failed for message ${messageId}:`, error)
          }
        }
      }),
    }
  }),
})

function mimeTypeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  }
  return map[mimeType] || mimeType.split('/')[1] || 'bin'
}
