/**
 * Identity — OTP Preferences routes
 *
 * Actions: getOtpPreferences (GET /me/otp-preferences), updateOtpPreferences (PATCH /me/otp-preferences)
 * Controla quais métodos OTP o usuário tem habilitados. Requer 2FA ativo para desabilitar.
 */

import { igniter } from '@/igniter';
import { database as db } from '@/server/services/database';
import { z } from 'zod';
import { authProcedure } from '../procedures/auth.procedure';
import { csrfProcedure } from '../procedures/csrf.procedure';

export const otpPreferencesRoutes = {
  getOtpPreferences: igniter.query({
    name: 'Get OTP Preferences',
    description: 'Get user OTP method preferences',
    path: '/me/otp-preferences',
    method: 'GET',
    use: [authProcedure({ required: true })],
    handler: async ({ response, context }) => {
      const authUser = context.auth?.session?.user;
      if (!authUser) return response.status(401).json({ error: 'Unauthorized' });

      const prefs = await db.userPreferences.findUnique({
        where: { userId: authUser.id },
        select: { otpEmailDisabled: true, otpPhoneDisabled: true },
      });

      return response.success({
        otpEmailDisabled: prefs?.otpEmailDisabled ?? false,
        otpPhoneDisabled: prefs?.otpPhoneDisabled ?? false,
      });
    },
  }),

  updateOtpPreferences: igniter.mutation({
    name: 'Update OTP Preferences',
    description: 'Enable or disable OTP login methods (requires active 2FA)',
    path: '/me/otp-preferences',
    method: 'PATCH',
    body: z.object({
      otpEmailDisabled: z.boolean().optional(),
      otpPhoneDisabled: z.boolean().optional(),
    }),
    use: [authProcedure({ required: true }), csrfProcedure()],
    handler: async ({ request, response, context }) => {
      const authUser = context.auth?.session?.user;
      if (!authUser) return response.status(401).json({ error: 'Unauthorized' });

      const user = await db.user.findUnique({
        where: { id: authUser.id },
        select: { twoFactorEnabled: true },
      });

      // Só permite desabilitar OTP se o TOTP estiver ativo — evita lockout
      const { otpEmailDisabled, otpPhoneDisabled } = request.body;
      if ((otpEmailDisabled === true || otpPhoneDisabled === true) && !user?.twoFactorEnabled) {
        return response.status(403).json({
          error: 'Ative a autenticação em duas etapas antes de desabilitar métodos OTP.',
        });
      }

      await db.userPreferences.upsert({
        where: { userId: authUser.id },
        create: {
          userId: authUser.id,
          ...(otpEmailDisabled !== undefined && { otpEmailDisabled }),
          ...(otpPhoneDisabled !== undefined && { otpPhoneDisabled }),
        },
        update: {
          ...(otpEmailDisabled !== undefined && { otpEmailDisabled }),
          ...(otpPhoneDisabled !== undefined && { otpPhoneDisabled }),
        },
      });

      return response.success({ updated: true });
    },
  }),
};
