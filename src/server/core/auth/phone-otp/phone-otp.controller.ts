/**
 * Auth phone OTP via WhatsApp
 *
 * Extraido do monolito auth.controller.ts. Contratos preservados.
 */

import { igniter } from "@/igniter";
import { database as db } from "@/server/services/database";
import { phoneOTPSchema, verifyPhoneOTPSchema } from "../auth.schemas";
import { normalizePhone, sendWhatsAppOTP } from "@/lib/uaz/whatsapp-otp";
import { generateOTPCode } from "@/lib/auth/bcrypt";
import { turnstileProcedure } from "../procedures/turnstile.procedure";
import { csrfProcedure } from "../procedures/csrf.procedure";
import { otpVerifyLoginRateLimiter } from "@/lib/rate-limit/rate-limiter";
import { checkOtpRateLimit } from "@/lib/rate-limit/otp-rate-limit";
import { getClientIdentifier } from "../_shared/helpers";
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from "../_shared/signup-gate";
import { check2faAndIssueChallenge } from "../_shared/two-factor-gate";
import { finalizeLogin } from "../_shared/finalize-login";
import { UserRole, OrganizationRole } from "@/lib/auth/roles";

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

    /**
     * Verify Login OTP Phone — Validate WhatsApp OTP code, 2FA gate, issue session.
     *
     * Existing-user-only: phone-only signup is not supported (User.email is
     * required + unique). New phones receive an OTP via loginOTPPhone but the
     * verify step returns "Código inválido" if no matching User row exists,
     * to avoid revealing whether a phone is registered.
     */
    verifyLoginOTPPhone: igniter.mutation({
      name: 'Verify Login OTP Phone',
      description: 'Verify WhatsApp OTP code and issue session',
      path: '/verify-login-otp-phone',
      method: 'POST',
      body: verifyPhoneOTPSchema,
      use: [csrfProcedure()],
      handler: async ({ request, response }) => {
        const normalized = normalizePhone(request.body.phone)
        const { code } = request.body
        const clientIp = getClientIdentifier(request)

        // Rate limit — 5 attempts / 10 min per IP+phone
        const rlIdentifier = `${clientIp}:${normalized}`
        const rateLimit = await otpVerifyLoginRateLimiter.check(rlIdentifier)
        if (!rateLimit.success) {
          return response.status(429).json({ error: 'Too many attempts', retryAfter: rateLimit.retryAfter })
        }

        // Camada adicional de rate-limit por telefone
        const otpRateLimit = await checkOtpRateLimit(`verify-login-phone:${normalized}`, clientIp)
        if (!otpRateLimit.success) {
          return response.status(429).json({ error: 'Too many attempts', retryAfter: otpRateLimit.retryAfter })
        }

        const user = await db.user.findFirst({
          where: { phone: normalized },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
          },
        })

        if (!user) return response.status(400).json({ error: 'Código inválido' })

        // Atomic compare-and-set: consume token in a single UPDATE (prevents replay race)
        const consumed = await db.verificationCode.updateMany({
          where: { identifier: normalized, code, type: 'WHATSAPP_OTP', used: false, expiresAt: { gt: new Date() } },
          data: { used: true },
        })

        if (consumed.count === 0) return response.status(400).json({ error: 'Código inválido ou expirado' })
        if (!user.isActive) return response.status(403).json({ error: 'Conta desativada' })

        // Marca telefone como verificado (primeira verificação bem-sucedida).
        if (!user.phoneVerified) {
          await db.user.update({ where: { id: user.id }, data: { phoneVerified: true } })
        }

        // 2FA gate — issue challenge, caller finishes TOTP step
        const twoFactorGate = await check2faAndIssueChallenge(user, request, 'phone-otp')
        if (twoFactorGate) return response.success(twoFactorGate)

        // Ensure admin has an org set
        let currentOrgId = user.currentOrgId
        if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0) {
          currentOrgId = user.organizations[0].organizationId
          await db.user.update({ where: { id: user.id }, data: { currentOrgId } })
        }

        const currentOrgRelation = user.organizations.find((org) => org.organizationId === currentOrgId)

        // Device + session + audit — all-in-one happy path
        const result = await finalizeLogin({
          user: {
            id: user.id,
            email: user.email,
            role: user.role as UserRole,
            currentOrgId,
            onboardingCompleted: user.onboardingCompleted,
          },
          request,
          response,
          method: 'phone-otp',
          auditEvents: [
            { action: 'user.login', metadata: { phone: normalized } },
            { action: 'auth.login', metadata: { phone: normalized } },
          ],
          issueOptions: {
            organizationRole: currentOrgRelation?.role as OrganizationRole | undefined,
            accessTokenExpiry: '24h',
            refreshTokenExpiry: '7d',
          },
        })

        if (result.blocked) {
          return Response.json(
            { error: 'Login bloqueado por política de segurança. Contate o administrador.' },
            { status: 403 },
          )
        }

        return response.success({
          needsOnboarding: !user.onboardingCompleted,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            currentOrgId,
            organizationRole: currentOrgRelation?.role,
          },
        })
      },
    }),
  },
});
