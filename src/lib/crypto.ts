import crypto from 'crypto';

const rawKey = process.env.ENCRYPTION_KEY;
if (!rawKey || rawKey.length < 32) {
  throw new Error('[Crypto] ENCRYPTION_KEY must be set and at least 32 characters.');
}
const ENCRYPTION_KEY = rawKey;

// Fixed salt is intentional: ENCRYPTION_KEY itself carries all the entropy.
// scryptSync here is used purely for key derivation to produce a fixed-length
// output — not for password hashing (where per-user random salts are required).
const SCRYPT_SALT = 'quayer-crypto-salt';
const KEY_LENGTH = 32;

function deriveKey(): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY, SCRYPT_SALT, KEY_LENGTH);
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = deriveKey();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, dataHex] = ciphertext.split(':');
  if (!ivHex || !dataHex) throw new Error('[Crypto] Invalid ciphertext format.');
  const iv = Buffer.from(ivHex, 'hex');
  const key = deriveKey();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}
