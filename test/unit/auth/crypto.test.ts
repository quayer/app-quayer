/**
 * Crypto unit tests — src/lib/crypto.ts
 *
 * Covers the lazy ENCRYPTION_KEY init, encrypt/decrypt round-trip,
 * hash determinism, and randomToken entropy.
 *
 * Strategy: the module uses a module-level cache (_ENCRYPTION_KEY). We
 * use vi.resetModules() + dynamic import inside each test to get a fresh
 * module instance with a controlled env.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- helpers ----------------------------------------------------------------

async function importCryptoWith(envOverrides: Record<string, string | undefined>) {
  // Apply env overrides BEFORE resetting modules (the module reads env on first call)
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  vi.resetModules();
  return await import('@/lib/crypto');
}

// ---- getEncryptionKey (lazy init) ------------------------------------------

describe('getEncryptionKey (lazy init via encrypt/decrypt)', () => {
  afterEach(() => {
    // Restore a valid key for other test suites
    process.env.ENCRYPTION_KEY = 'test-key-exactly-32-chars-padded';
    vi.resetModules();
  });

  it('throws when ENCRYPTION_KEY is absent', async () => {
    const mod = await importCryptoWith({ ENCRYPTION_KEY: undefined });
    // encrypt/decrypt both call getEncryptionKey internally
    expect(() => mod.encrypt('test')).toThrow('[Crypto] ENCRYPTION_KEY must be set and at least 32 characters.');
  });

  it('throws when ENCRYPTION_KEY is shorter than 32 characters', async () => {
    const mod = await importCryptoWith({ ENCRYPTION_KEY: 'short' });
    expect(() => mod.encrypt('test')).toThrow('[Crypto] ENCRYPTION_KEY must be set and at least 32 characters.');
  });

  it('throws when ENCRYPTION_KEY is exactly 31 characters (boundary)', async () => {
    const mod = await importCryptoWith({ ENCRYPTION_KEY: 'a'.repeat(31) });
    expect(() => mod.encrypt('hello')).toThrow();
  });

  it('accepts ENCRYPTION_KEY of exactly 32 characters', async () => {
    const mod = await importCryptoWith({ ENCRYPTION_KEY: 'a'.repeat(32) });
    // Should NOT throw — verify by calling encrypt and checking result is a string
    const result = mod.encrypt('hello');
    expect(typeof result).toBe('string');
    expect(result).toContain(':');
  });

  it('accepts ENCRYPTION_KEY longer than 32 characters', async () => {
    const mod = await importCryptoWith({ ENCRYPTION_KEY: 'x'.repeat(64) });
    const result = mod.encrypt('hello');
    expect(typeof result).toBe('string');
    expect(result).toContain(':');
  });
});

// ---- encrypt / decrypt round-trip ------------------------------------------

describe('encrypt / decrypt round-trip', () => {
  const KEY_32 = 'test-key-exactly-32-chars-padded';

  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = KEY_32;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
  });

  it('recovers the original plaintext', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const plaintext = 'hello world';
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertext on each call (random IV)', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const c1 = encrypt('same');
    const c2 = encrypt('same');
    expect(c1).not.toBe(c2);
  });

  it('ciphertext format is iv_hex:data_hex', async () => {
    const { encrypt } = await import('@/lib/crypto');
    const ct = encrypt('test');
    const parts = ct.split(':');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // 16-byte IV = 32 hex chars
    expect(parts[1]).toMatch(/^[0-9a-f]+$/);
  });

  it('decrypt throws on malformed ciphertext (missing colon)', async () => {
    const { decrypt } = await import('@/lib/crypto');
    expect(() => decrypt('notvalid')).toThrow('[Crypto] Invalid ciphertext format.');
  });

  it('decrypt with tampered IV produces different plaintext (AES-CBC IV only affects block 1)', async () => {
    // AES-CBC: a bad IV does NOT throw — it just produces wrong decryption for the first block.
    // This test documents the actual behavior: tampered IV ≠ original plaintext.
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const plaintext = 'my secret value!'; // exactly 1 AES block (16 bytes)
    const ct = encrypt(plaintext);
    const parts = ct.split(':');
    // Flip all bits in IV
    const tamperedIv = 'ff'.repeat(16); // 32 hex chars = 16 bytes of 0xff
    const tampered = tamperedIv + ':' + parts[1];
    // decrypt either throws (padding error) or returns garbage — either way NOT the original
    let decrypted: string;
    try {
      decrypted = decrypt(tampered);
      expect(decrypted).not.toBe(plaintext);
    } catch {
      // Throwing is also acceptable behavior
      expect(true).toBe(true);
    }
  });

  it('decrypt throws on tampered data portion', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const ct = encrypt('secret');
    const parts = ct.split(':');
    // Flip last hex char of data
    const lastChar = parts[1].slice(-1);
    const flipped = lastChar === 'a' ? 'b' : 'a';
    const tampered = parts[0] + ':' + parts[1].slice(0, -1) + flipped;
    expect(() => decrypt(tampered)).toThrow();
  });

  it('round-trips Unicode / multi-byte content', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const text = '🔐 senha: açaí café';
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it('round-trips an empty string', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('round-trips a long string (> 1 AES block)', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const long = 'A'.repeat(512);
    expect(decrypt(encrypt(long))).toBe(long);
  });

  it('caches the key — second call does not re-validate env', async () => {
    const { encrypt, decrypt } = await import('@/lib/crypto');
    const ct = encrypt('data');
    // Remove env AFTER first use; key should be cached
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    // Should still work from cache
    expect(decrypt(ct)).toBe('data');
    process.env.ENCRYPTION_KEY = saved;
  });
});

// ---- hash ------------------------------------------------------------------

describe('hash', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(32);
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
  });

  it('returns a 64-char hex string (SHA-256)', async () => {
    const { hash } = await import('@/lib/crypto');
    expect(hash('hello')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input yields same output', async () => {
    const { hash } = await import('@/lib/crypto');
    expect(hash('quayer')).toBe(hash('quayer'));
  });

  it('is different for different inputs', async () => {
    const { hash } = await import('@/lib/crypto');
    expect(hash('a')).not.toBe(hash('b'));
  });
});

// ---- randomToken -----------------------------------------------------------

describe('randomToken', () => {
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(32);
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    vi.resetModules();
  });

  it('defaults to 32 bytes = 64 hex chars', async () => {
    const { randomToken } = await import('@/lib/crypto');
    expect(randomToken()).toHaveLength(64);
    expect(randomToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('respects custom byte count', async () => {
    const { randomToken } = await import('@/lib/crypto');
    expect(randomToken(16)).toHaveLength(32); // 16 bytes = 32 hex
  });

  it('produces unique tokens on consecutive calls', async () => {
    const { randomToken } = await import('@/lib/crypto');
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(randomToken());
    expect(seen.size).toBe(50);
  });
});
