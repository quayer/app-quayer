/**
 * Auth Feature - Zod Validation Schemas
 *
 * Schemas de validação para autenticação e autorização.
 *
 * Post-pivot (Builder IA WhatsApp-only): removed schemas for deleted actions
 * (updateProfile, updatePreferences, sendVerification, resendVerification,
 * verifyLoginOTPPhone, all mfa-totp actions, webauthn, refreshToken).
 */

import { z } from 'zod';

/**
 * Schema de Logout
 */
export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  everywhere: z.boolean().optional().default(false), // Logout de todos os dispositivos
});

export type LogoutInput = z.infer<typeof logoutSchema>;

/**
 * Schema de Switch Organization
 */
export const switchOrganizationSchema = z.object({
  organizationId: z.string({ required_error: 'Organization ID is required' }).uuid(),
});

export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;

/**
 * Schema de Google Callback
 */
export const googleCallbackSchema = z.object({
  code: z.string({ required_error: 'Authorization code is required' }),
});

export type GoogleCallbackInput = z.infer<typeof googleCallbackSchema>;

/**
 * Schema de Send Verification Email (kept — used by unit tests in
 * `test/unit/auth/zod-schemas.test.ts` even though the action was removed).
 */
export const sendVerificationSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
});

export type SendVerificationInput = z.infer<typeof sendVerificationSchema>;

/**
 * Schema de Verify Email with Code
 */
export const verifyEmailCodeSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  code: z
    .string({ required_error: 'Verification code is required' })
    .length(6, 'Code must be 6 digits'),
});

export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;

/**
 * Schema de Magic Link Request (kept — used by unit tests).
 */
export const magicLinkSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  rememberMe: z.boolean().optional().default(false),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

/**
 * Schema de Magic Link Verify
 */
export const verifyMagicLinkSchema = z.object({
  token: z.string({ required_error: 'Magic link token is required' }),
});

export type VerifyMagicLinkInput = z.infer<typeof verifyMagicLinkSchema>;

/**
 * Schema de Check Magic Link Status (polling from original tab)
 */
export const checkMagicLinkStatusSchema = z.object({
  sessionId: z.string({ required_error: 'Session ID is required' }).uuid('Invalid session ID'),
});

export type CheckMagicLinkStatusInput = z.infer<typeof checkMagicLinkStatusSchema>;

/**
 * Schema de Passwordless OTP Request
 */
export const passwordlessOTPSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  rememberMe: z.boolean().optional().default(false),
});

export type PasswordlessOTPInput = z.infer<typeof passwordlessOTPSchema>;

/**
 * Schema de Passwordless OTP Verify
 */
export const verifyPasswordlessOTPSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  code: z
    .string({ required_error: 'OTP code is required' })
    .length(6, 'Code must be 6 digits'),
  rememberMe: z.boolean().optional().default(false),
});

export type VerifyPasswordlessOTPInput = z.infer<typeof verifyPasswordlessOTPSchema>;

/**
 * Schema de Signup OTP Request
 */
export const signupOTPSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .trim(),
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
});

export type SignupOTPInput = z.infer<typeof signupOTPSchema>;

/**
 * Schema de Signup OTP Verify
 */
export const verifySignupOTPSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  code: z
    .string({ required_error: 'OTP code is required' })
    .length(6, 'Code must be 6 digits'),
});

export type VerifySignupOTPInput = z.infer<typeof verifySignupOTPSchema>;

/**
 * Schema de Phone OTP Request
 */
export const phoneOTPSchema = z.object({ phone: z.string().min(8).max(20) });

export type PhoneOTPInput = z.infer<typeof phoneOTPSchema>;

// ============================================================
// Response schemas — shared between backend response shaping
// and contract tests (US-108 upgrade from bootstrap mode).
//
// IMPORTANT: these schemas describe the EXACT payload returned by
// `auth.controller.ts` today. Do not edit unless the controller changes.
// ============================================================

/**
 * Response of POST /auth/login-otp (passwordless OTP request).
 * Source: `auth.controller.ts` — both the new-user branch (line ~1527)
 * and the existing-user branch (line ~1570) return this shape.
 */
export const otpRequestResponseSchema = z.object({
  sent: z.boolean(),
  message: z.string(),
  magicLinkSessionId: z.string(),
  // Only present on the new-user branch — kept optional so the schema
  // matches both code paths.
  isNewUser: z.boolean().optional(),
});

export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;

/**
 * Response of POST /auth/verify-login-otp (passwordless OTP verify).
 * Source: `auth.controller.ts` ~line 1688 — `response.success({ needsOnboarding, user })`.
 * Cookies (access + refresh) are set as httpOnly so they are NOT in the JSON body.
 */
export const otpVerifyResponseSchema = z.object({
  needsOnboarding: z.boolean(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: z.string(),
    currentOrgId: z.string().nullable(),
    organizationRole: z.string().optional(),
  }),
});

export type OtpVerifyResponse = z.infer<typeof otpVerifyResponseSchema>;

/**
 * Response of POST /auth/signup-otp (signup code request).
 * Source: `auth.controller.ts` ~line 1284 — `response.success({ sent, message })`.
 */
export const signupResponseSchema = z.object({
  sent: z.boolean(),
  message: z.string(),
});

export type SignupResponse = z.infer<typeof signupResponseSchema>;
