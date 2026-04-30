import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client instance for Storage, Realtime, and other Supabase services.
 *
 * NOTE: Database access continues via Prisma (context.db).
 * This client is ONLY for Supabase-specific features (Storage, Realtime CDC).
 */
let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. ' +
        'Set them in .env or disable Supabase features.'
      )
    }

    _supabase = createClient(url, key, {
      auth: { persistSession: false },
    })
  }
  return _supabase
}

/** Check if Supabase is configured (non-throwing) */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Lazy proxy (same pattern as database.ts)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as any)[prop]
  },
})
