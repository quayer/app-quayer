/**
 * Crypto Library
 *
 * Encrypts and decrypts sensitive data using AES-256-GCM
 * Used for storing uazapi tokens securely in the database
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits

/**
 * Get encryption key from environment
 * Falls back to a default key for development (NOT FOR PRODUCTION!)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY environment variable is required in production')
    }

    // Development fallback (NOT SECURE - only for local dev)
    console.warn('⚠️  Using default encryption key. Set ENCRYPTION_KEY env var in production!')
    return crypto.scryptSync('quayer-dev-key', 'salt', KEY_LENGTH)
  }

  // Derive key from environment variable
  return crypto.scryptSync(key, 'salt', KEY_LENGTH)
}

/**
 * Encrypt a string value
 *
 * @param plaintext - The string to encrypt
 * @returns Encrypted value in format: iv:authTag:ciphertext (base64)
 *
 * @example
 * ```ts
 * const token = "abc123xyz"
 * const encrypted = encrypt(token)
 * // Returns: "a1b2c3:d4e5f6:g7h8i9..." (base64 encoded)
 * ```
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string')
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64')
  ciphertext += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`
}

/**
 * Decrypt an encrypted string
 *
 * @param encrypted - The encrypted value from encrypt()
 * @returns Decrypted plaintext string
 *
 * @example
 * ```ts
 * const encrypted = "a1b2c3:d4e5f6:g7h8i9..."
 * const token = decrypt(encrypted)
 * // Returns: "abc123xyz"
 * ```
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) {
    throw new Error('Cannot decrypt empty string')
  }

  const parts = encrypted.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format. Expected: iv:authTag:ciphertext')
  }

  const [ivBase64, authTagBase64, ciphertext] = parts

  const key = getEncryptionKey()
  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let plaintext = decipher.update(ciphertext, 'base64', 'utf8')
  plaintext += decipher.final('utf8')

  return plaintext
}

/**
 * Generate a random encryption key for .env
 * Run: node -e "require('./src/lib/crypto').generateKey()"
 */
export function generateKey(): void {
  const key = crypto.randomBytes(32).toString('hex')
  console.log('\n🔐 Generated encryption key:')
  console.log(`ENCRYPTION_KEY=${key}`)
  console.log('\n⚠️  Add this to your .env file!')
  console.log('⚠️  Keep it secret! Never commit it to git!\n')
}
