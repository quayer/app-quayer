/**
 * Channel Credentials — crypto helpers (route-private).
 *
 * Encapsulates the BYOK encryption pattern used by the channel-credentials
 * routes, mirroring src/server/core/providers/providers.repository.ts:
 *   - secret Connection columns are AES-encrypted via lib/crypto `encrypt()`
 *     before persist;
 *   - status reads only ever expose a `last4` hint derived by decrypting
 *     in-memory, never the raw token.
 */

import { encrypt, decrypt } from '@/lib/crypto'
import type { ChannelKind, ChannelConnectionData } from './channel-credentials.contract'

/**
 * Connection columns that hold secrets per channel kind (encrypt before persist).
 * Maps the contract's logical SECRET_FIELDS onto actual Connection column names.
 */
export const SECRET_COLUMNS: Record<ChannelKind, readonly string[]> = {
  whatsapp_business: ['cloudApiAccessToken', 'cloudApiVerifyToken'],
  whatsapp_cloud: ['cloudApiAccessToken', 'cloudApiVerifyToken'],
  instagram: ['igPageAccessToken', 'igAppSecret', 'igVerifyToken'],
}

/** Encrypt the secret columns of a plaintext Connection-data object. */
export function encryptSecretColumns(
  data: ChannelConnectionData,
  kind: ChannelKind,
): Record<string, unknown> {
  const secretCols = SECRET_COLUMNS[kind]
  const out: Record<string, unknown> = { ...data }
  for (const col of secretCols) {
    const raw = out[col]
    if (typeof raw === 'string' && raw.length > 0) {
      out[col] = encrypt(raw)
    }
  }
  return out
}

/** Derive a non-sensitive last-4 hint from an encrypted blob (decrypt in-memory). */
export function lastFour(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null
  try {
    const plain = decrypt(encrypted)
    return plain.length >= 4 ? plain.slice(-4) : null
  } catch {
    return null
  }
}
