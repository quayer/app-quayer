/**
 * Auth Google OAuth flow
 *
 * Extraido do monolito auth.controller.ts. Contratos preservados.
 */

import { igniter } from "@/igniter";
import { database as db } from "@/server/services/database";
import crypto from "crypto";
import { z } from "zod";
import { googleCallbackSchema } from "../auth.schemas";
import { UserRole } from "@/lib/auth/roles";
import { emailService } from "@/lib/email";
import { RateLimiter } from "@/lib/rate-limit/rate-limiter";
import {
  getClientIdentifier, createAuditLog, dashboardUrl, isProduction,
  registerDeviceSession,
} from "../_shared/helpers";
import { isSignupEnabled, SIGNUP_DISABLED_MESSAGE } from "../_shared/signup-gate";
import { issueSession } from "../_shared/issue-session";
import { check2faAndIssueChallenge } from "../_shared/two-factor-gate";
import { finalizeLogin } from "../_shared/finalize-login";
import { rateLimitProcedure } from "../procedures/rate-limit.procedure";

/**
 * Rate limiters dedicados ao fluxo Google OAuth.
 *  - googleCallback: 10 requisições / 10 minutos por IP
 *  - googleAuth (init): 20 requisições / 10 minutos por IP
 * Prefixos isolados para não colidir com `authRateLimiter`.
 */
const oauthGoogleCallbackRateLimiter = new RateLimiter({
  limit: 10,
  window: 600,
  prefix: 'ratelimit:oauth-google-callback',
  failClosedInProduction: true,
});

const oauthGoogleInitRateLimiter = new RateLimiter({
  limit: 20,
  window: 600,
  prefix: 'ratelimit:oauth-google-init',
  failClosedInProduction: true,
});

export const oauthGoogleController = igniter.controller({
  name: "auth-oauth-google",
  path: "/auth",
  description: "Auth Google OAuth flow",
  actions: {
    /**
     * Google Auth - Iniciar fluxo OAuth
     *
     * CSRF protection: generates a cryptographically random `state` token,
     * stores it in an httpOnly+Secure+SameSite=Lax cookie (oauth_google_state)
     * valid for 10 minutes, and embeds it in the Google authorization URL.
     * The callback handler validates the returned state against the cookie
     * using timing-safe comparison before processing any token exchange.
     */
    googleAuth: igniter.query({
      name: 'Google Auth',
      description: 'Initiate Google OAuth flow',
      path: '/google',
      method: 'GET',
      use: [rateLimitProcedure({ limiter: oauthGoogleInitRateLimiter })],
      handler: async ({ request, response }) => {
        // Generate a cryptographically random CSRF state token (64 hex chars)
        const state = crypto.randomBytes(32).toString('hex');

        // Store state in a short-lived httpOnly cookie so the callback can
        // validate it without relying on client-side storage.
        response.setCookie('oauth_google_state', state, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'lax' as const,
          path: '/',
          maxAge: 600, // 10 minutes — enough for the OAuth round-trip
        });

        const { getGoogleAuthUrl } = await import('@/lib/auth/google-oauth');
        const authUrl = getGoogleAuthUrl(state);
        return response.success({ authUrl });
      },
    }),

    /**
     * Google Callback - Processar retorno do Google OAuth
     */
    googleCallback: igniter.mutation({
      name: 'Google Callback',
      description: 'Process Google OAuth callback',
      path: '/google/callback',
      method: 'POST',
      body: googleCallbackSchema,
      use: [rateLimitProcedure({ limiter: oauthGoogleCallbackRateLimiter })],
      handler: async ({ request, response }) => {
        const { code, state } = request.body;
        const { getGoogleTokens, getGoogleUserInfo } = await import('@/lib/auth/google-oauth');

        // --- CSRF state validation (Login-CSRF prevention) ---
        // Read the state stored in the httpOnly cookie set during googleAuth.
        const cookieHeader = request.headers.get('cookie') || '';
        const cookieState = cookieHeader
          .split(';')
          .map((c: string) => c.trim())
          .find((c: string) => c.startsWith('oauth_google_state='))
          ?.split('=')
          .slice(1)
          .join('=') ?? '';

        // Reject immediately if cookie is absent or lengths differ (prevents
        // timing oracle when buffers of different length are compared).
        if (!cookieState || cookieState.length !== state.length) {
          console.error('[Google OAuth] State mismatch — possible CSRF attack');
          return response.status(403).json({ error: 'Invalid OAuth state' });
        }

        // Constant-time comparison to prevent timing attacks.
        const stateMatches = crypto.timingSafeEqual(
          Buffer.from(cookieState, 'utf8'),
          Buffer.from(state, 'utf8'),
        );

        if (!stateMatches) {
          console.error('[Google OAuth] State mismatch — possible CSRF attack');
          return response.status(403).json({ error: 'Invalid OAuth state' });
        }

        // Invalidate the state cookie (one-shot) immediately after validation.
        response.setCookie('oauth_google_state', '', {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'lax' as const,
          path: '/',
          maxAge: 0,
        });
        // --- end CSRF validation ---

        try {
          // Trocar código por tokens
          const tokens = await getGoogleTokens(code);

          if (!tokens.access_token) {
            console.error('[Google OAuth] access_token missing from token exchange response');
            return response.status(400).json({ error: 'Failed to get access token' });
          }

          // Obter informações do usuário
          const googleUser = await getGoogleUserInfo(tokens.access_token);

          /**
           * Email verification check.
           *
           * Google's userinfo endpoint behaviour by account type:
           *   - Consumer accounts:  verified_email = true | false
           *   - Google Workspace:   verified_email may be undefined (field absent)
           *     but `hd` (hosted domain) is present — Workspace only populates `hd`
           *     for active, verified accounts, so its presence implies verification.
           *
           * We only hard-reject when verified_email is explicitly `false`.
           * Undefined (Workspace) or true (Consumer) are treated as verified.
           */
          const isWorkspaceAccount = typeof googleUser.hd === 'string' && googleUser.hd.length > 0;
          if (googleUser.verified_email === false && !isWorkspaceAccount) {
            console.error('[Google OAuth] Provider returned unverified email; rejecting');
            return response.status(400).json({ error: 'Google email not verified' });
          }

          // Buscar ou criar usuário
          let user = await db.user.findUnique({
            where: { email: googleUser.email },
          });

          let isNewGoogleUser = false;

          if (!user) {
            // Signup gate — bloqueia criação de novos usuários quando desabilitado
            if (!isSignupEnabled()) {
              return response.status(403).json({ error: SIGNUP_DISABLED_MESSAGE });
            }

            // Criar novo usuário
            const usersCount = await db.user.count();
            const isFirstUser = usersCount === 0;

            // Criar organização padrão para usuário Google OAuth
            const slug = googleUser.name
              .toLowerCase()
              .replace(/[^a-z0-9]/g, '-')
              .substring(0, 50);

            // Gerar documento único baseado em UUID para evitar colisões
            const uniqueDocument = crypto.randomUUID().replace(/-/g, '').substring(0, 14);

            const organization = await db.organization.create({
              data: {
                name: `${googleUser.name}'s Organization`,
                slug: `${slug}-${Date.now()}`,
                document: uniqueDocument, // Documento único gerado automaticamente
                type: 'pf',
                isActive: true,
              },
            });

            // Google OAuth users are passwordless
            user = await db.user.create({
              data: {
                email: googleUser.email,
                name: googleUser.name,
                password: null, // Passwordless — OAuth user
                role: isFirstUser ? UserRole.ADMIN : UserRole.USER,
                emailVerified: new Date(), // Google já verificou - must be DateTime
                onboardingCompleted: true,
                currentOrgId: organization.id,
                organizations: {
                  create: {
                    organizationId: organization.id,
                    role: 'master',
                  },
                },
              },
            });
            isNewGoogleUser = true;
          }

          // Registrar/atualizar identidade OAuth vinculada ao usuário
          await db.userIdentity.upsert({
            where: {
              provider_providerUserId: {
                provider: 'google',
                providerUserId: googleUser.sub,
              },
            },
            create: {
              userId: user.id,
              provider: 'google',
              providerUserId: googleUser.sub,
              identifier: googleUser.email,
            },
            update: {
              lastUsedAt: new Date(),
            },
          });

          // 2FA gate: se usuário existente tem TOTP ativo, emitir challenge e encerrar
          if (!isNewGoogleUser) {
            const twoFactorGate = await check2faAndIssueChallenge(user, request, 'google');
            if (twoFactorGate) {
              return response.success(twoFactorGate);
            }
          }

          // --- Caminho SIGNUP (novo usuário) ---
          if (isNewGoogleUser) {
            // issueSession: cria tokens + cookies. Audit logs manuais (ordem importa).
            await issueSession(response, user);

            await emailService.sendWelcomeEmail(user.email, user.name, dashboardUrl);
            await createAuditLog('user.signup', user.id, request, { method: 'google' }, user.currentOrgId);
            await createAuditLog('auth.signup', user.id, request, { method: 'google' }, user.currentOrgId);

            // Device session non-blocking (signup path: sem geo-block)
            await registerDeviceSession(user.id, request);

            return response.success({
              needsOnboarding: !user.onboardingCompleted,
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                currentOrgId: user.currentOrgId,
              },
            });
          }

          // --- Caminho LOGIN (usuário existente, sem 2FA) ---
          const loginResult = await finalizeLogin({
            user,
            request,
            response,
            method: 'google',
            auditEvents: [
              { action: 'user.login' },
              { action: 'auth.login' },
            ],
          });

          if (loginResult.blocked) {
            return response.status(403).json({ error: 'Login bloqueado por política geográfica da organização' });
          }

          return response.success({
            needsOnboarding: !user.onboardingCompleted,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              currentOrgId: user.currentOrgId,
            },
          });
        } catch (error: any) {
          // Do not log error.message in production — may contain PII from provider responses
          if (process.env.NODE_ENV === 'development') {
            console.error('[Google OAuth] Authentication failed:', error.message);
          } else {
            console.error('[Google OAuth] Authentication failed');
          }
          return response.status(400).json({
            error: 'Google authentication failed',
            message: error.message || 'Erro ao processar autenticação com Google',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
          });
        }
      },
    }),
  },
});
