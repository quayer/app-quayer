/**
 * Storage facade — backend controlado por env `STORAGE_BACKEND`:
 *
 * - `supabase` (default): Supabase Storage com signed URLs (comportamento original).
 * - `local`: filesystem da própria VPS (padrão portado do Orayon.Profissoes K4).
 *   Grava em `STORAGE_LOCAL_ROOT` (default /data/storage — bind mount do host) e
 *   retorna URL pública `{PUBLIC_STORAGE_BASE_URL}/{bucket}/{key}`, servida pela
 *   rota GET /api/v1/files/[...path]. Zero custo, zero egress, sem MinIO/S3.
 *   "Signed URL" aqui é pública-por-link: as keys são não-adivinháveis
 *   (sha256/uuid) e `expiresIn` é ignorado.
 *
 * Consumidores usam SEMPRE a facade (isAvailable/upload/getSignedUrl/remove) —
 * trocar de backend não toca em nenhum call site.
 */
import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'

export const BUCKETS = {
  MEDIA: process.env.SUPABASE_STORAGE_BUCKET_MEDIA ?? 'media-whatsapp',
  PROFILES: process.env.SUPABASE_STORAGE_BUCKET_PROFILES ?? 'profile-pictures',
  ATTACHMENTS: process.env.SUPABASE_STORAGE_BUCKET_ATTACHMENTS ?? 'attachments',
} as const

type UploadOptions = {
  contentType?: string
  upsert?: boolean
}

type UploadResult = { path: string }

type StorageDriver = {
  isAvailable: () => boolean
  upload: (bucket: string, key: string, data: Buffer | Blob, options?: UploadOptions) => Promise<UploadResult>
  getSignedUrl: (bucket: string, key: string, expiresIn?: number) => Promise<string>
  remove: (bucket: string, keys: string[]) => Promise<void>
}

export const LOCAL_STORAGE_ROOT = process.env.STORAGE_LOCAL_ROOT ?? '/data/storage'

/**
 * Resolve `<root>/<bucket>/<key>` garantindo que o resultado fica DENTRO do root
 * (guard de path traversal — usado no write do driver e no read da rota /files).
 */
export function resolveLocalStoragePath(bucket: string, key: string): string {
  const root = path.resolve(LOCAL_STORAGE_ROOT)
  const resolved = path.resolve(root, bucket, key)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Storage path fora do root: ${bucket}/${key}`)
  }
  return resolved
}

function createSupabaseDriver(): StorageDriver {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  const getClient = () => {
    if (!url || !key) throw new Error('Supabase not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return createClient(url, key)
  }

  return {
    isAvailable: () => Boolean(url && key),
    upload: async (bucket, objectKey, data, options) => {
      const { data: result, error } = await getClient()
        .storage.from(bucket)
        .upload(objectKey, data, { contentType: options?.contentType, upsert: options?.upsert ?? true })
      if (error) throw error
      return result
    },
    getSignedUrl: async (bucket, objectKey, expiresIn) => {
      const expiry = expiresIn ?? Number(process.env.SUPABASE_STORAGE_SIGNED_URL_EXPIRY ?? 604800)
      const { data, error } = await getClient().storage.from(bucket).createSignedUrl(objectKey, expiry)
      if (error) throw error
      return data.signedUrl
    },
    remove: async (bucket, keys) => {
      const { error } = await getClient().storage.from(bucket).remove(keys)
      if (error) throw error
    },
  }
}

function createLocalDriver(): StorageDriver {
  const publicBase = (process.env.PUBLIC_STORAGE_BASE_URL ?? '').replace(/\/+$/, '')

  const publicUrl = (bucket: string, objectKey: string) => {
    const rel = [bucket, ...objectKey.split('/')].map(encodeURIComponent).join('/')
    return `${publicBase}/${rel}`
  }

  return {
    // Sem PUBLIC_STORAGE_BASE_URL os links gerados seriam inúteis para
    // consumidores externos (UAZ/WhatsApp) — trata como indisponível.
    isAvailable: () => Boolean(publicBase),
    upload: async (bucket, objectKey, data, options) => {
      const filePath = resolveLocalStoragePath(bucket, objectKey)
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer())
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      if (options?.upsert === false) {
        await fs.writeFile(filePath, buffer, { flag: 'wx' })
      } else {
        await fs.writeFile(filePath, buffer)
      }
      return { path: objectKey }
    },
    getSignedUrl: async (bucket, objectKey) => publicUrl(bucket, objectKey),
    remove: async (bucket, keys) => {
      await Promise.all(
        keys.map(async (k) => {
          try {
            await fs.unlink(resolveLocalStoragePath(bucket, k))
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
          }
        })
      )
    },
  }
}

function createStorageClient(): StorageDriver {
  const backend = process.env.STORAGE_BACKEND ?? 'supabase'
  return backend === 'local' ? createLocalDriver() : createSupabaseDriver()
}

export const storage = createStorageClient()
