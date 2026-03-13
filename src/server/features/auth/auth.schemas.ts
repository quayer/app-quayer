/**
 * Auth Feature - Zod Validation Schemas
 *
 * Schemas de validação para autenticação e autorização
 */

import { z } from 'zod';

/**
 * Schema de Refresh Token
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string({ required_error: 'Refresh token is required' }).min(1),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/**
 * Schema de Logout
 */
export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  everywhere: z.boolean().optional().default(false), // Logout de todos os dispositivos
});

export type LogoutInput = z.infer<typeof logoutSchema>;

/**
 * Schema de Verify Email
 */
export const verifyEmailSchema = z.object({
  token: z.string({ required_error: 'Verification token is required' }),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Schema de Resend Verification Email
 */
export const resendVerificationSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
});

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/**
 * Schema de Accept Invitation
 */
export const acceptInvitationSchema = z.object({
  token: z.string({ required_error: 'Invitation token is required' }),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .optional()
    .nullable(),
  name: z
    .string({ required_error: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .trim(),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/**
 * Schema de Update Profile
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim()
    .optional(),
  email: z
    .string()
    .email('Invalid email format')
    .toLowerCase()
    .trim()
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

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
 * Schema de Send Verification Email
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
 * Schema de Magic Link Request
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
 * Schema de WebAuthn Registration Options
 */
export const webAuthnRegisterOptionsSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
});

export type WebAuthnRegisterOptionsInput = z.infer<typeof webAuthnRegisterOptionsSchema>;

/**
 * Schema de WebAuthn Registration Verify
 */
export const webAuthnRegisterVerifySchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  credential: z.any(), // PublicKeyCredential JSON
});

export type WebAuthnRegisterVerifyInput = z.infer<typeof webAuthnRegisterVerifySchema>;

/**
 * Schema de WebAuthn Login Options
 */
export const webAuthnLoginOptionsSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
});

export type WebAuthnLoginOptionsInput = z.infer<typeof webAuthnLoginOptionsSchema>;

/**
 * Schema de WebAuthn Login Verify
 */
export const webAuthnLoginVerifySchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  credential: z.any(), // PublicKeyCredential JSON
  rememberMe: z.boolean().optional().default(false),
});

export type WebAuthnLoginVerifyInput = z.infer<typeof webAuthnLoginVerifySchema>;

/**
 * Schema de Passkey Delete
 */
export const passkeyDeleteSchema = z.object({
  passkeyId: z.string().min(1),
});

export type PasskeyDeleteInput = z.infer<typeof passkeyDeleteSchema>;

/**
 * Schema de Phone OTP Request
 */
export const phoneOTPSchema = z.object({ phone: z.string().min(8).max(20) })

export type PhoneOTPInput = z.infer<typeof phoneOTPSchema>;

/**
 * Schema de Phone OTP Verify
 */
export const verifyPhoneOTPSchema = z.object({ phone: z.string(), code: z.string().length(6) })

export type VerifyPhoneOTPInput = z.infer<typeof verifyPhoneOTPSchema>;

/**
 * Schema de TOTP Setup (empty body — user identified by auth context)
 */
export const totpSetupSchema = z.object({});

export type TotpSetupInput = z.infer<typeof totpSetupSchema>;

/**
 * Schema de TOTP Verify — confirmar setup digitando código do authenticator
 */
export const totpVerifySchema = z.object({
  code: z
    .string({ required_error: 'TOTP code is required' })
    .length(6, 'Code must be 6 digits')
    .regex(/^\d+$/, 'Code must contain only digits'),
  deviceId: z
    .string({ required_error: 'Device ID is required' })
    .uuid('Invalid device ID format'),
});

export type TotpVerifyInput = z.infer<typeof totpVerifySchema>;

/**
 * Schema de TOTP Challenge — validar código TOTP durante login 2FA
 */
export const totpChallengeSchema = z.object({
  challengeId: z
    .string({ required_error: 'Challenge ID is required' })
    .min(1, 'Challenge ID is required'),
  code: z
    .string({ required_error: 'TOTP code is required' })
    .length(6, 'Code must be 6 digits')
    .regex(/^\d+$/, 'Code must contain only digits'),
});

export type TotpChallengeInput = z.infer<typeof totpChallengeSchema>;

/**
 * Schema de TOTP Recovery — login via recovery code when authenticator unavailable
 */
export const totpRecoverySchema = z.object({
  challengeId: z
    .string({ required_error: 'Challenge ID is required' })
    .min(1, 'Challenge ID is required'),
  recoveryCode: z
    .string({ required_error: 'Recovery code is required' })
    .min(1, 'Recovery code is required')
    .max(20, 'Recovery code is too long'),
});

export type TotpRecoveryInput = z.infer<typeof totpRecoverySchema>;

/**
 * Schema de TOTP Disable Request — solicita OTP por email para desabilitar 2FA
 */
export const totpDisableRequestSchema = z.object({});

export type TotpDisableRequestInput = z.infer<typeof totpDisableRequestSchema>;

/**
 * Schema de TOTP Disable — desabilitar 2FA (requer código TOTP + senha OU emailCode)
 */
export const totpDisableSchema = z.object({
  password: z
    .string()
    .min(1, 'Password is required')
    .optional(),
  emailCode: z
    .string()
    .length(6, 'Email code must be 6 digits')
    .optional(),
  code: z
    .string({ required_error: 'TOTP or recovery code is required' })
    .min(1, 'Code is required')
    .max(20, 'Code is too long'),
});

export type TotpDisableInput = z.infer<typeof totpDisableSchema>;

/**
 * Schema de TOTP Regenerate Codes — gerar novos recovery codes (requer código TOTP válido)
 */
export const totpRegenerateCodesSchema = z.object({
  code: z
    .string({ required_error: 'TOTP code is required' })
    .length(6, 'Code must be 6 digits')
    .regex(/^\d+$/, 'Code must contain only digits'),
});

export type TotpRegenerateCodesInput = z.infer<typeof totpRegenerateCodesSchema>;
