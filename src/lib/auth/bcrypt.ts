/**
 * Password hashing, OTP generation, and recovery code utilities.
 *
 * Uses bcryptjs (pure-JS, no native addon required) for password hashing.
 * Recovery codes use 8 random bytes → 16 hex chars (64 bits of entropy).
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// OTP code generation (numeric, used for email/SMS OTP flows)
// ---------------------------------------------------------------------------

/**
 * Generates a zero-padded numeric OTP of `digits` length.
 * Uses crypto.randomInt for uniform distribution.
 */
export function generateOTPCode(digits = 6): string {
  const max = Math.pow(10, digits);
  const code = crypto.randomInt(0, max);
  return code.toString().padStart(digits, '0');
}

// ---------------------------------------------------------------------------
// Recovery codes (2FA backup)
// ---------------------------------------------------------------------------

/**
 * Generates `count` recovery codes.
 * Each code is 16 hex characters (8 random bytes = 64 bits of entropy).
 *
 * Format validation regex: /^[0-9a-f]{16}$/
 */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(8).toString('hex')
  );
}

/** Regex that matches a valid recovery code (16 hex chars). */
export const RECOVERY_CODE_REGEX = /^[0-9a-f]{16}$/;
