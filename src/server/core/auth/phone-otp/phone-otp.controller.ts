/**
 * Auth phone OTP via WhatsApp
 *
 * Extraido do monolito auth.controller.ts. Contratos preservados.
 */

import { igniter } from "@/igniter";
import { database as db } from "@/server/services/database";
import { phoneOTPSchema } from "../auth.schemas";
import { normalizePhone, sendWhatsAppOTP } from "@/lib/uaz/whatsapp-otp";
import { generateOTPCode } from "@/lib/auth/bcrypt";
import { turnstileProcedure } from "../procedures/turnstile.procedure";
import { checkOtpRateLimit } from "@/lib/rate-limit/otp-rate-limit";
import { getClientIdentifier } from "../_shared/helpers";
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from "../_shared/signup-gate";

export const phoneOtpController = igniter.controller({
  name: "auth-phone-otp",
  path: "/auth",
  description: "Auth phone OTP via WhatsApp",
  actions: {
    loginOTPPhone: igniter.mutation({
      name: 'Login OTP Phone',
      path: '/login-otp-phone',
      method: 'POST',
      body: phoneOTPSchema,
      use: [turnstileProcedure()],
      handler: async ({ request, response }) => {
        const normalized = normalizePhone(request.body.phone)
        const clientIp = getClientIdentifier(request)

        // Lookup do usuário pelo telefone — define se é login (existente)
        // ou signup (novo). Para 2FA também precisamos das preferences.
        const phoneUser = await db.user.findFirst({
          where: { phone: normalized },
          select: { twoFactorEnabled: true, preferences: { select: { otpPhoneDisabled: true } } },
        });

        // Signup gate aplicado apenas para usuários NOVOS (alinhado com
        // googleCallback). Usuários existentes podem continuar fazendo login
        // via WhatsApp mesmo com signup desabilitado.
        if (!phoneUser && !isSignupEnabled()) {
          return response.forbidden(SIGNUP_DISABLED_MESSAGE)
        }

        // Se o usuário com esse telefone tem 2FA ativo e desabilitou OTP por telefone, bloquear
        if (phoneUser?.twoFactorEnabled && phoneUser.preferences?.otpPhoneDisabled) {
          return response.badRequest('OTP por telefone desabilitado. Use seu aplicativo autenticador para fazer login.')
        }

        // Rate-limit: 3 por telefone/15min, 5 por IP/hora
        const rateLimitResult = await checkOtpRateLimit(normalized, clientIp)
        if (!rateLimitResult.success) {
          const retryAfter = rateLimitResult.retryAfter || 60
          console.warn(`[loginOTPPhone] Rate limited — phone: ${normalized}, IP: ${clientIp}`)
          return Response.json(
            { error: `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minuto(s).` },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
          )
        }

        const code = generateOTPCode()

        await db.verificationCode.deleteMany({ where: { identifier: normalized, type: 'WHATSAPP_OTP' } })
        await db.verificationCode.create({
          data: {
            identifier: normalized,
            code,
            type: 'WHATSAPP_OTP',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        })

        let delivered = false
        try {
          delivered = await sendWhatsAppOTP(normalized, code)
        } catch (err) {
          console.error('[loginOTPPhone] sendWhatsAppOTP threw:', err)
          delivered = false
        }

        if (!delivered) {
          // sendWhatsAppOTP signaled failure (UAZAPI down, env missing, HTTP non-2xx).
          // The verification code is in the DB, but we should NOT lie to the
          // client by returning {sent:true} — that strands the user on a verify
          // screen waiting for a message that will never arrive.
          return response.badRequest(
            'Não foi possível enviar o código pelo WhatsApp. Verifique o número e tente novamente, ou use email.'
          )
        }

        return response.success({ sent: true })
      },
    }),
  },
});
