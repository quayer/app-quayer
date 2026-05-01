import crypto from 'crypto';
import { database as db } from '@/server/services/database';

const rawEncKey = process.env.ENCRYPTION_KEY;
if (!rawEncKey || rawEncKey.length < 32) {
  throw new Error('[SystemSettings] ENCRYPTION_KEY must be set and at least 32 characters.');
}

const SCRYPT_SALT = 'quayer-settings-salt';
const KEY_LENGTH = 32;

function deriveKey(): Buffer {
  return crypto.scryptSync(rawEncKey as string, SCRYPT_SALT, KEY_LENGTH);
}

function encryptValue(text: string): string {
  const iv = crypto.randomBytes(12);
  const key = deriveKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `gcm:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptValue(ciphertext: string): string {
  try {
    if (ciphertext.startsWith('gcm:')) {
      const parts = ciphertext.slice(4).split(':');
      if (parts.length !== 3) throw new Error('Invalid GCM format');
      const [ivHex, authTagHex, dataHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const data = Buffer.from(dataHex, 'hex');
      const key = deriveKey();
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString('utf8');
    }

    // Legacy CBC format (backward compatibility)
    console.warn('[SystemSettings] Decrypting legacy CBC-encrypted value — re-encrypt on next write.');
    const [ivHex, dataHex] = ciphertext.split(':');
    if (!ivHex || !dataHex) return ciphertext;
    const iv = Buffer.from(ivHex, 'hex');
    const legacyKey = crypto.scryptSync(rawEncKey as string, 'salt', KEY_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKey, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return ciphertext;
  }
}

function parseCategoryKey(key: string): { category: string; settingKey: string } {
  const sep = key.indexOf('.');
  if (sep === -1) return { category: 'system', settingKey: key }
  return { category: key.slice(0, sep), settingKey: key.slice(sep + 1) }
}

export interface SystemSetting {
  key: string;
  value: string;
  encrypted: boolean;
}

export async function getSystemSetting(key: string): Promise<string | null> {
  const { category, settingKey } = parseCategoryKey(key);
  const record = await db.systemSettings.findFirst({ where: { category, key: settingKey } });
  if (!record) return null;
  if (record.encrypted) return decryptValue(record.value);
  return record.value;
}

export async function setSystemSetting(
  key: string,
  value: string,
  encrypted = false,
): Promise<void> {
  const { category, settingKey } = parseCategoryKey(key);
  const storedValue = encrypted ? encryptValue(value) : value;
  await db.systemSettings.upsert({
    where: { category_key: { category, key: settingKey } },
    update: { value: storedValue, encrypted },
    create: { category, key: settingKey, value: storedValue, encrypted },
  });
}

export async function deleteSystemSetting(key: string): Promise<void> {
  const { category, settingKey } = parseCategoryKey(key);
  await db.systemSettings.deleteMany({ where: { category, key: settingKey } });
}

export async function getAllSystemSettings(): Promise<SystemSetting[]> {
  const records = await db.systemSettings.findMany();
  return records.map(r => ({
    key: `${r.category}.${r.key}`,
    value: r.encrypted ? decryptValue(r.value) : r.value,
    encrypted: r.encrypted,
  }));
}
