import { defineConfig } from 'prisma/config'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Manually load .env since Prisma v7 doesn't auto-load it in config files
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).split('#')[0].trim()
    if (key && !process.env[key]) process.env[key] = value
  }
} catch {}

export default defineConfig({
  datasource: {
    // In Supabase: DATABASE_URL points to session pooler
    // DIRECT_DATABASE_URL points to direct connection (used by Prisma Migrate)
    // Locally: both can be the same value
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  },
})
