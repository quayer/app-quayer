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
        // Signup gate — este endpoint serve exclusivamente o fluxo de signup
        // via WhatsApp (usado no signup-form.tsx). verifyLoginOTPPhone foi
        // removido, então bloquear o envio bloqueia o signup inteiro.
        if (!isSignupEnabled()) {
          return response.forbidden(SIGNUP_DISABLED_MESSAGE)
        }

        const normalized = normalizePhone(request.body.phone)
        const clientIp = getClientIdentifier(request)

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

        try {
          await sendWhatsAppOTP(normalized, code)
        } catch (err) {
          console.error('[loginOTPPhone] sendWhatsAppOTP failed:', err)
          return response.badRequest('Serviço WhatsApp temporariamente indisponível. Tente fazer login com email.')
        }

        return response.success({ sent: true })
      },
    }),
  },
});
