/**
 * Auth current user identity
 *
 * Extraido do monolito auth.controller.ts. Contratos preservados.
 */

import { igniter } from "@/igniter";
import { database as db } from "@/server/services/database";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { z } from "zod";
import { storage, BUCKETS } from "@/server/services/storage";
import { normalizePhone, sendWhatsAppOTP } from "@/lib/uaz/whatsapp-otp";
import { hashPassword, verifyPassword, generateOTPCode, generateRecoveryCodes } from "@/lib/auth/bcrypt";
import { signAccessToken, signRefreshToken, verifyRefreshToken, getExpirationDate, signMagicLinkToken, verifyMagicLinkToken } from "@/lib/auth/jwt";
import { authProcedure } from "../procedures/auth.procedure";
import { csrfProcedure } from "../procedures/csrf.procedure";
import { turnstileProcedure } from "../procedures/turnstile.procedure";
import { UserRole, OrganizationRole } from "@/lib/auth/roles";
import { emailService } from "@/lib/email";
import { authRateLimiter } from "@/lib/rate-limit/rate-limiter";
import { checkOtpRateLimit } from "@/lib/rate-limit/otp-rate-limit";
import { generateCsrfToken, setCsrfCookie, clearCsrfCookie } from "@/lib/auth/csrf";
import { getIpGeolocation } from "@/lib/geocoding/ip-geolocation";
import { encrypt, decrypt } from "@/lib/crypto";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import {
  getClientIdentifier, createAuditLog, appBaseUrl, dashboardUrl, isProduction,
  setAuthCookies, clearAuthCookies, sign2faChallenge, verify2faChallenge,
  getChallengeAttempts, incrementChallengeAttempts, MAX_2FA_ATTEMPTS,
  parseDeviceName, registerDeviceSession, autoJoinByVerifiedDomain,
} from "../_shared/helpers";

export const identityController = igniter.controller({
  name: "auth-identity",
  path: "/auth",
  description: "Auth current user identity",
  actions: {
    /**
     * Me - Obter dados do usuário autenticado
     */
    me: igniter.query({
      name: 'Get Current User',
      description: 'Get authenticated user data',
      path: '/me',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ response, context }) => {
        const authUser = context.auth?.session?.user;
        if (!authUser) {
          return response.status(401).json({ error: 'Unauthorized' });
        }

        const user = await db.user.findUnique({
          where: { id: authUser.id },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
            preferences: true,
          },
        });

        if (!user) {
          return response.status(404).json({ error: 'User not found' });
        }

        return response.success({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
          currentOrgId: user.currentOrgId,
          isAgency: user.isAgency,
          organizations: user.organizations.map((org) => ({
            id: org.organization.id,
            name: org.organization.name,
            slug: org.organization.slug,
            role: org.role,
          })),
          preferences: user.preferences,
        });
      },
    }),

    /**
     * Update Me - Atualiza dados do perfil do usuário autenticado
     *
     * TODO(schema): os campos `language`, `timezone` e `avatarUrl` ainda NÃO
     * existem no modelo User (nem em UserPreferences). Por enquanto, apenas
     * `name` é persistido. Os demais são aceitos no body para compatibilidade
     * com o frontend em `src/app/conta/conta-client.tsx` e ecoados de volta,
     * mas ignorados na escrita. Adicionar via migration Prisma:
     *   model User { language String?; timezone String?; avatarUrl String? }
     */
    updateMe: igniter.mutation({
      name: 'Update Current User',
      description: 'Update authenticated user profile fields',
      path: '/me',
      method: 'PATCH',
      use: [authProcedure({ required: true })],
      body: z.object({
        name: z.string().trim().min(1, 'Nome não pode ser vazio').max(120, 'Nome muito longo').optional(),
        language: z.string().trim().min(2, 'Idioma inválido').max(10, 'Idioma inválido').optional(),
        timezone: z.string().trim().min(1, 'Fuso horário inválido').max(64, 'Fuso horário inválido').optional(),
      }),
      handler: async ({ request, response, context }) => {
        const authUser = context.auth?.session?.user;
        if (!authUser) {
          return response.status(401).json({ error: 'Não autenticado' });
        }

        const { name, language, timezone } = request.body;

        // TODO(schema): incluir language/timezone aqui quando os campos existirem no User
        const data: { name?: string } = {};
        if (typeof name === 'string') data.name = name;

        if (Object.keys(data).length > 0) {
          await db.user.update({
            where: { id: authUser.id },
            data,
          });
        }

        const user = await db.user.findUnique({
          where: { id: authUser.id },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
            preferences: true,
          },
        });

        if (!user) {
          return response.status(404).json({ error: 'Usuário não encontrado' });
        }

        return response.success({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
          currentOrgId: user.currentOrgId,
          // Campos ecoados do body (ainda sem persistência no schema). TODO(schema).
          language: language ?? null,
          timezone: timezone ?? null,
          avatarUrl: null,
          organizations: user.organizations.map((org) => ({
            id: org.organization.id,
            name: org.organization.name,
            slug: org.organization.slug,
            role: org.role,
          })),
          preferences: user.preferences,
        });
      },
    }),

    /**
     * Upload Avatar - Recebe arquivo em base64 e armazena em Supabase Storage.
     *
     * TODO(schema): `User.avatarUrl` ainda NÃO existe. O arquivo é enviado ao
     * bucket e retornamos a URL assinada, mas NÃO persistimos no banco. Adicionar:
     *   model User { avatarUrl String? }
     * E então, dentro do handler, fazer `db.user.update({ data: { avatarUrl } })`.
     */
    uploadAvatar: igniter.mutation({
      name: 'Upload User Avatar',
      description: 'Upload a new avatar for the authenticated user',
      path: '/me/avatar',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        fileBase64: z.string().min(1, 'Conteúdo do arquivo é obrigatório'),
        fileName: z.string().min(1, 'Nome do arquivo é obrigatório'),
        mimeType: z
          .string()
          .regex(/^image\/(jpeg|png|webp|gif)$/, 'Tipo de imagem não suportado'),
      }),
      handler: async ({ request, response, context }) => {
        const authUser = context.auth?.session?.user;
        if (!authUser) {
          return response.status(401).json({ error: 'Não autenticado' });
        }

        if (!storage.isAvailable()) {
          return response.status(503).json({
            error: 'Armazenamento não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
          });
        }

        const { fileBase64, fileName, mimeType } = request.body;
        const fileBuffer = Buffer.from(fileBase64, 'base64');

        const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
        if (fileBuffer.length === 0) {
          return response.status(400).json({ error: 'Arquivo vazio' });
        }
        if (fileBuffer.length > MAX_AVATAR_SIZE) {
          return response.status(400).json({
            error: `Avatar excede o limite de ${MAX_AVATAR_SIZE / 1024 / 1024}MB`,
          });
        }

        const ext = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
        const safeExt = (ext || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `avatars/${authUser.id}-${Date.now()}.${safeExt}`;

        const result = await storage.upload(BUCKETS.PROFILES, path, fileBuffer, {
          contentType: mimeType,
          upsert: true,
        });

        const avatarUrl = await storage.getSignedUrl(BUCKETS.PROFILES, result.path);

        // TODO(schema): persistir avatarUrl quando o campo existir no User.
        // await db.user.update({ where: { id: authUser.id }, data: { avatarUrl } });

        return response.success({ avatarUrl });
      },
    }),

    /**
     * List Users (Admin only)
     */
    listUsers: igniter.query({
      name: 'List Users',
      description: 'List all users (admin only)',
      path: '/users',
      method: 'GET',
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.status(401).json({ error: 'Not authenticated' });
        }

        // Verificar se é admin
        if (user.role !== 'admin') {
          return response.status(403).json({ error: 'Admin access required' });
        }

        // Filtrar por organização do usuário (multi-tenant)
        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.status(400).json({ error: 'No organization selected' });
        }

        const users = await context.db.user.findMany({
          where: {
            organizations: { some: { organizationId: orgId } },
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            emailVerified: true,
            currentOrgId: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        return response.success(users);
      },
    }),
  },
});
