/**
 * Calendar Crypto Service — QH-12
 *
 * Helper de criptografia em repouso para tokens OAuth do Google Calendar
 * (refresh_token armazenado em OrganizationProvider.credentials.refreshToken).
 *
 * Algoritmo: AES-256-GCM (authenticated encryption) — upgrade em relação ao
 * AES-256-CBC de src/lib/crypto.ts, que continua em uso para channel-credentials.
 * GCM garante integridade (auth-tag) além da confidencialidade.
 *
 * Chave: mesma ENCRYPTION_KEY do ambiente (>= 32 chars), derivada via scrypt
 * com salt fixo idêntico ao de src/lib/crypto.ts para reutilizar a entropia
 * já presente no ambiente sem precisar de uma env adicional.
 *
 * Formato armazenado: "enc:v1:<base64>"
 *   base64 = iv(12 bytes) || authTag(16 bytes) || ciphertext(N bytes)
 *   — todos concatenados em um único Buffer antes da codificação.
 *
 * Compatibilidade retroativa: decryptToken aceita valores SEM o prefixo
 * "enc:v1:" e os retorna sem modificação (tokens legados em claro ou CBC).
 *
 * @module infra/calendar-crypto.service
 */

import crypto from 'crypto'

// ── Constants ────────────────────────────────────────────────────────────────

const ALGORITHM = 'aes-256-gcm' as const
const IV_BYTES = 12 // NIST recommended for GCM
const TAG_BYTES = 16
const KEY_BYTES = 32
const SCRYPT_SALT = 'quayer-crypto-salt' // mirrors src/lib/crypto.ts
const VERSION_PREFIX = 'enc:v1:'

// ── Key derivation (lazy, cached) ────────────────────────────────────────────

let _derivedKey: Buffer | undefined

/**
 * Validates ENCRYPTION_KEY and derives the AES-256 key via scrypt.
 * Lazy: validates on first use so Next.js build-time imports don't crash
 * when the env is absent (same pattern as src/lib/crypto.ts).
 * Throws a descriptive error if the env is missing or too short.
 */
function getDerivedKey(): Buffer {
  if (_derivedKey) return _derivedKey

  const raw = process.env.ENCRYPTION_KEY
  if (!raw || raw.length < 32) {
    throw new Error(
      '[CalendarCrypto] ENCRYPTION_KEY must be set and at least 32 characters.',
    )
  }

  _derivedKey = crypto.scryptSync(raw, SCRYPT_SALT, KEY_BYTES)
  return _derivedKey
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext token with AES-256-GCM.
 *
 * Returns a versioned string:
 *   "enc:v1:<base64>"
 * where base64 encodes: iv(12) || authTag(16) || ciphertext(N)
 *
 * Throws only when ENCRYPTION_KEY is missing/too short (programming error).
 * Never logs the key or the plaintext.
 *
 * @param plain - Raw token string (e.g. Google refresh_token).
 * @returns Versioned, base64-encoded ciphertext suitable for database storage.
 */
export function encryptToken(plain: string): string {
  const key = getDerivedKey()
  const iv = crypto.randomBytes(IV_BYTES)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // iv || authTag || ciphertext — fixed-length header simplifies decryption.
  const payload = Buffer.concat([iv, authTag, ciphertext])
  return `${VERSION_PREFIX}${payload.toString('base64')}`
}

/**
 * Decrypts a token produced by encryptToken.
 *
 * Backward-compatible: if `stored` does NOT start with "enc:v1:", it is
 * returned as-is (legacy plaintext or CBC-encrypted values already in DB).
 * This allows a zero-downtime migration where old rows are re-encrypted
 * lazily on the next write.
 *
 * Throws when:
 *   - ENCRYPTION_KEY is missing/too short.
 *   - The versioned payload is malformed (truncated iv/authTag/ciphertext).
 *   - GCM auth-tag verification fails (tampered ciphertext).
 *
 * @param stored - Value read from the database.
 * @returns Plaintext token string.
 */
export function decryptToken(stored: string): string {
  // Legacy value (no prefix): return as-is for backward compatibility.
  if (!stored.startsWith(VERSION_PREFIX)) {
    return stored
  }

  const key = getDerivedKey()
  const b64 = stored.slice(VERSION_PREFIX.length)
  const payload = Buffer.from(b64, 'base64')

  // Minimum: iv(12) + authTag(16) = 28 bytes; ciphertext may be 0 bytes for empty plaintext.
  if (payload.length < IV_BYTES + TAG_BYTES) {
    throw new Error('[CalendarCrypto] Ciphertext payload too short — may be truncated.')
  }

  const iv = payload.subarray(0, IV_BYTES)
  const authTag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(), // throws if authTag verification fails
  ])

  return decrypted.toString('utf8')
}
