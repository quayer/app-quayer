import { getSupabase, isSupabaseConfigured } from './supabase'

// Bucket names from environment (with defaults)
export const BUCKETS = {
  MEDIA: process.env.SUPABASE_STORAGE_BUCKET_MEDIA || 'media-whatsapp',
  PROFILES: process.env.SUPABASE_STORAGE_BUCKET_PROFILES || 'profile-pictures',
  ATTACHMENTS: process.env.SUPABASE_STORAGE_BUCKET_ATTACHMENTS || 'attachments',
} as const

// Default signed URL expiry: 7 days
const DEFAULT_SIGNED_URL_EXPIRY = parseInt(
  process.env.SUPABASE_STORAGE_SIGNED_URL_EXPIRY || '604800',
  10
)

export interface UploadOptions {
  contentType?: string
  cacheControl?: string
  upsert?: boolean
}

export interface UploadResult {
  path: string
  fullPath: string
}

export interface StorageService {
  upload(bucket: string, path: string, file: Buffer | Blob | File, options?: UploadOptions): Promise<UploadResult>
  download(bucket: string, path: string): Promise<Buffer>
  getSignedUrl(bucket: string, path: string, expiresIn?: number): Promise<string>
  getPublicUrl(bucket: string, path: string): string
  delete(bucket: string, paths: string[]): Promise<void>
  isAvailable(): boolean
}

/**
 * Supabase Storage implementation.
 * Uses Supabase S3-compatible storage for file persistence.
 */
class SupabaseStorageService implements StorageService {
  isAvailable(): boolean {
    return isSupabaseConfigured()
  }

  async upload(
    bucket: string,
    path: string,
    file: Buffer | Blob | File,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const supabase = getSupabase()

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        contentType: options.contentType,
        cacheControl: options.cacheControl || '3600',
        upsert: options.upsert ?? false,
      })

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`)
    }

    return {
      path: data.path,
      fullPath: `${bucket}/${data.path}`,
    }
  }

  async download(bucket: string, path: string): Promise<Buffer> {
    const supabase = getSupabase()

    const { data, error } = await supabase.storage
      .from(bucket)
      .download(path)

    if (error) {
      throw new Error(`Storage download failed: ${error.message}`)
    }

    const arrayBuffer = await data.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  async getSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = DEFAULT_SIGNED_URL_EXPIRY
  ): Promise<string> {
    const supabase = getSupabase()

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)

    if (error) {
      throw new Error(`Storage signed URL failed: ${error.message}`)
    }

    return data.signedUrl
  }

  getPublicUrl(bucket: string, path: string): string {
    const supabase = getSupabase()

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path)

    return data.publicUrl
  }

  async delete(bucket: string, paths: string[]): Promise<void> {
    const supabase = getSupabase()

    const { error } = await supabase.storage
      .from(bucket)
      .remove(paths)

    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`)
    }
  }
}

/**
 * Noop storage service — used when Supabase is not configured.
 * All operations throw with a clear message.
 */
class NoopStorageService implements StorageService {
  isAvailable(): boolean {
    return false
  }

  async upload(): Promise<UploadResult> {
    throw new Error('Storage not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }

  async download(): Promise<Buffer> {
    throw new Error('Storage not configured.')
  }

  async getSignedUrl(): Promise<string> {
    throw new Error('Storage not configured.')
  }

  getPublicUrl(): string {
    throw new Error('Storage not configured.')
  }

  async delete(): Promise<void> {
    throw new Error('Storage not configured.')
  }
}

/**
 * Storage service singleton.
 * Uses Supabase when configured, otherwise noop (throws on use).
 */
export const storage: StorageService = isSupabaseConfigured()
  ? new SupabaseStorageService()
  : new NoopStorageService()

/**
 * Generate a storage path for WhatsApp media.
 * Format: {orgId}/{sessionId}/{messageId}.{ext}
 */
export function mediaPath(
  orgId: string,
  sessionId: string,
  messageId: string,
  extension: string
): string {
  return `${orgId}/${sessionId}/${messageId}.${extension}`
}

/**
 * Generate a storage path for profile pictures.
 * Format: {contactId}.jpg
 */
export function profilePicturePath(contactId: string): string {
  return `${contactId}.jpg`
}

/**
 * Generate a storage path for user-uploaded attachments.
 * Format: {orgId}/{userId}/{timestamp}-{filename}
 */
export function attachmentPath(
  orgId: string,
  userId: string,
  filename: string
): string {
  const timestamp = Date.now()
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `${orgId}/${userId}/${timestamp}-${safeName}`
}
