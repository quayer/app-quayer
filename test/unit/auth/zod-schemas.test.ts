/**
 * US-104 — Zod auth schema tests
 *
 * Imports the actual schemas from `src/server/core/auth/auth.schemas.ts`.
 * Quayer is 100% passwordless: there is no register/login-with-password,
 * forgotPassword, or resetPassword schema. The schemas under test are the
 * passwordless OTP request/verify and signup OTP request/verify.
 */

import { describe, it, expect } from 'vitest';
import {
  passwordlessOTPSchema,
  verifyPasswordlessOTPSchema,
  signupOTPSchema,
  verifySignupOTPSchema,
  magicLinkSchema,
  verifyMagicLinkSchema,
  sendVerificationSchema,
  verifyEmailCodeSchema,
} from '@/server/core/auth/auth.schemas';

describe('passwordlessOTPSchema (request OTP)', () => {
  it('parses a valid email', () => {
    const parsed = passwordlessOTPSchema.parse({ email: 'alice@example.com' });
    expect(parsed.email).toBe('alice@example.com');
    expect(parsed.rememberMe).toBe(false);
  });

  it('lowercases email', () => {
    const parsed = passwordlessOTPSchema.parse({ email: 'ALICE@Example.COM' });
    expect(parsed.email).toBe('alice@example.com');
  });

  it('throws when email is missing', () => {
    expect(() => passwordlessOTPSchema.parse({})).toThrow();
  });

  it('throws when email format is invalid', () => {
    expect(() => passwordlessOTPSchema.parse({ email: 'not-an-email' })).toThrow();
  });
});

describe('verifyPasswordlessOTPSchema (verify OTP)', () => {
  it('parses a valid email + 6-digit code', () => {
    const parsed = verifyPasswordlessOTPSchema.parse({
      email: 'alice@example.com',
      code: '123456',
    });
    expect(parsed.code).toBe('123456');
  });

  it('throws when code is missing', () => {
    expect(() =>
      verifyPasswordlessOTPSchema.parse({ email: 'alice@example.com' })
    ).toThrow();
  });

  it('throws when code is shorter than 6 digits', () => {
    expect(() =>
      verifyPasswordlessOTPSchema.parse({ email: 'alice@example.com', code: '12345' })
    ).toThrow();
  });

  it('throws when code is longer than 6 digits', () => {
    expect(() =>
      verifyPasswordlessOTPSchema.parse({ email: 'alice@example.com', code: '1234567' })
    ).toThrow();
  });

  it('throws when email is invalid', () => {
    expect(() =>
      verifyPasswordlessOTPSchema.parse({ email: 'nope', code: '123456' })
    ).toThrow();
  });
});

describe('signupOTPSchema (signup request)', () => {
  it('parses valid name + email', () => {
    const parsed = signupOTPSchema.parse({ name: 'Alice', email: 'alice@example.com' });
    expect(parsed.name).toBe('Alice');
    expect(parsed.email).toBe('alice@example.com');
  });

  it('throws when name is missing', () => {
    expect(() => signupOTPSchema.parse({ email: 'alice@example.com' })).toThrow();
  });

  it('throws when name is shorter than 2 characters', () => {
    expect(() => signupOTPSchema.parse({ name: 'A', email: 'alice@example.com' })).toThrow();
  });

  it('throws when email is missing', () => {
    expect(() => signupOTPSchema.parse({ name: 'Alice' })).toThrow();
  });

  it('throws when email format is invalid', () => {
    expect(() => signupOTPSchema.parse({ name: 'Alice', email: 'bad' })).toThrow();
  });
});

describe('verifySignupOTPSchema', () => {
  it('parses valid email + code', () => {
    const parsed = verifySignupOTPSchema.parse({
      email: 'alice@example.com',
      code: '123456',
    });
    expect(parsed.code).toBe('123456');
  });

  it('throws when code is not exactly 6 chars', () => {
    expect(() =>
      verifySignupOTPSchema.parse({ email: 'alice@example.com', code: '123' })
    ).toThrow();
  });

  it('throws when both fields missing', () => {
    expect(() => verifySignupOTPSchema.parse({})).toThrow();
  });
});

describe('magicLinkSchema (request)', () => {
  it('parses a valid email', () => {
    const parsed = magicLinkSchema.parse({ email: 'alice@example.com' });
    expect(parsed.email).toBe('alice@example.com');
    expect(parsed.rememberMe).toBe(false);
  });

  it('honours rememberMe when supplied', () => {
    const parsed = magicLinkSchema.parse({ email: 'alice@example.com', rememberMe: true });
    expect(parsed.rememberMe).toBe(true);
  });

  it('throws on invalid email', () => {
    expect(() => magicLinkSchema.parse({ email: 'nope' })).toThrow();
  });
});

describe('verifyMagicLinkSchema', () => {
  it('parses a valid token string', () => {
    expect(verifyMagicLinkSchema.parse({ token: 'abc.def.ghi' }).token).toBe('abc.def.ghi');
  });

  it('throws when token is missing', () => {
    expect(() => verifyMagicLinkSchema.parse({})).toThrow();
  });
});

describe('sendVerificationSchema / verifyEmailCodeSchema', () => {
  it('sendVerificationSchema accepts a valid email', () => {
    expect(sendVerificationSchema.parse({ email: 'a@b.com' }).email).toBe('a@b.com');
  });

  it('sendVerificationSchema rejects invalid email', () => {
    expect(() => sendVerificationSchema.parse({ email: 'broken' })).toThrow();
  });

  it('verifyEmailCodeSchema requires a 6-digit code', () => {
    expect(() =>
      verifyEmailCodeSchema.parse({ email: 'a@b.com', code: '12' })
    ).toThrow();
    expect(
      verifyEmailCodeSchema.parse({ email: 'a@b.com', code: '654321' }).code
    ).toBe('654321');
  });
});
