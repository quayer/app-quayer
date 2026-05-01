import { createClient } from '@supabase/supabase-js'

export const BUCKETS = {
  MEDIA: process.env.SUPABASE_STORAGE_BUCKET_MEDIA ?? 'media-whatsapp',
  PROFILES: process.env.SUPABASE_STORAGE_BUCKET_PROFILES ?? 'profile-pictures',
  ATTACHMENTS: process.env.SUPABASE_STORAGE_BUCKET_ATTACHMENTS ?? 'attachments',
} as const

type UploadOptions = {
  contentType?: string
  upsert?: boolean
}

function createStorageClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  const isAvailable = () => Boolean(url && key)

  const getClient = () => {
    if (!url || !key) throw new Error('Supabase not configured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return createClient(url, key)
  }

  const upload = async (bucket: string, path: string, data: Buffer | Blob, options?: UploadOptions) => {
    const { data: result, error } = await getClient()
      .storage.from(bucket)
      .upload(path, data, { contentType: options?.contentType, upsert: options?.upsert ?? true })
    if (error) throw error
    return result
  }

  const getSignedUrl = async (bucket: string, path: string, expiresIn?: number) => {
    const expiry = expiresIn ?? Number(process.env.SUPABASE_STORAGE_SIGNED_URL_EXPIRY ?? 604800)
    const { data, error } = await getClient().storage.from(bucket).createSignedUrl(path, expiry)
    if (error) throw error
    return data.signedUrl
  }

  const remove = async (bucket: string, paths: string[]) => {
    const { error } = await getClient().storage.from(bucket).remove(paths)
    if (error) throw error
  }

  return { isAvailable, upload, getSignedUrl, remove }
}

export const storage = createStorageClient()
