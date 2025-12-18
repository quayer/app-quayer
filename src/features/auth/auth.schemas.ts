/**
 * Auth Feature - Zod Validation Schemas
 *
 * Schemas de validação para autenticação e autorização
 */

import { z } from 'zod';

/**
 * Schema de Login
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Schema de Registro
 */
export const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
      'Password must contain at least one special character'
    ),
  name: z
    .string({ required_error: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .trim(),
  document: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        // Remove non-digits
        const digits = val.replace(/\D/g, '');
        // CPF: 11 digits, CNPJ: 14 digits
        return digits.length === 11 || digits.length === 14;
      },
      { message: 'Document must be a valid CPF (11 digits) or CNPJ (14 digits)' }
    ),
  organizationName: z
    .string()
    .optional()
    .transform((val) => val?.trim()),
});

export type RegisterInput = z.infer<typeof registerSchema>;

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
 * Schema de Forgot Password
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Schema de Reset Password
 */
export const resetPasswordSchema = z.object({
  token: z.string({ required_error: 'Reset token is required' }),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'),
  // confirmPassword is validated client-side only
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Schema de Change Password (usuário logado)
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string({ required_error: 'Current password is required' }),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string({ required_error: 'Confirm password is required' }),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "New password must be different from current password",
  path: ['newPassword'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

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
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'),
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
 * Schema de Login com Remember Me
 */
export const loginWithRememberMeSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginWithRememberMeInput = z.infer<typeof loginWithRememberMeSchema>;

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
 * Schema de WebAuthn Login Options (com email - fluxo legado)
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
 * Schema de WebAuthn Login Options Discoverable (sem email - usernameless)
 * Usado para login com passkeys que armazenam o userHandle internamente
 */
export const webAuthnLoginOptionsDiscoverableSchema = z.object({
  // Nenhum campo obrigatório - login sem email
});

export type WebAuthnLoginOptionsDiscoverableInput = z.infer<typeof webAuthnLoginOptionsDiscoverableSchema>;

/**
 * Schema de WebAuthn Login Verify (com email - fluxo legado)
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
 * Schema de WebAuthn Login Verify Discoverable (sem email - usernameless)
 * O userHandle na credential contém o userId
 */
export const webAuthnLoginVerifyDiscoverableSchema = z.object({
  credential: z.any(), // PublicKeyCredential JSON com userHandle
  rememberMe: z.boolean().optional().default(false),
});

export type WebAuthnLoginVerifyDiscoverableInput = z.infer<typeof webAuthnLoginVerifyDiscoverableSchema>;
