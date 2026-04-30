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
import { RateLimiter, authRateLimiter } from "@/lib/rate-limit/rate-limiter";
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

/**
 * Detect the real MIME type of an image buffer by inspecting magic bytes.
 * Returns null for unsupported or unrecognised formats (including GIF, which
 * is intentionally excluded to prevent tracking-pixel abuse).
 *
 * Supported formats: JPEG (FF D8), PNG (89 50 4E 47 0D 0A 1A 0A), WebP (RIFF...WEBP).
 */
function detectImageMimeFromBuffer(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null;

  // JPEG: starts with FF D8
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) return 'image/png';

  // WebP: RIFF????WEBP (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';

  // GIF and all other formats are intentionally rejected.
  return null;
}

const meRateLimiter = new RateLimiter({
  limit: 120,
  window: 60,
  prefix: 'ratelimit:me',
});

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
      handler: async ({ request, response, context }) => {
        const authUser = context.auth?.session?.user;
        if (!authUser) {
          return response.status(401).json({ error: 'Unauthorized' });
        }

        const clientIp = getClientIdentifier(request);
        const rateLimit = await meRateLimiter.check(authUser.id + ':' + clientIp);
        if (!rateLimit.success) {
          return response.status(429).json({ error: 'Too many requests' });
        }

        const user = await db.user.findUnique({
          where: { id: authUser.id },
          include: {
            organizations: {
              where: { isActive: true },
              include: { organization: true },
            },
            preferences: {
              select: {
                messageSignature: true,
                aiSuggestionsEnabled: true,
              },
            },
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
            preferences: {
              select: {
                messageSignature: true,
                aiSuggestionsEnabled: true,
              },
            },
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
      use: [authProcedure({ required: true }), csrfProcedure()],
      body: z.object({
        fileBase64: z.string().min(1, 'Conteúdo do arquivo é obrigatório'),
        fileName: z.string().min(1, 'Nome do arquivo é obrigatório'),
        // GIF is excluded: animated GIFs can be used as tracking pixels and carry
        // hidden payloads. Only static image formats are accepted.
        mimeType: z
          .string()
          .regex(/^image\/(jpeg|png|webp)$/, 'Tipo de imagem não suportado'),
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

        // Magic-byte validation: verify the actual file content matches a known
        // image format regardless of the client-supplied mimeType. This prevents
        // a renamed HTML/SVG/script file from being stored as an image.
        const detectedMime = detectImageMimeFromBuffer(fileBuffer);
        if (!detectedMime) {
          return response.status(400).json({ error: 'Conteúdo do arquivo não corresponde a uma imagem suportada (jpeg, png, webp)' });
        }
        if (detectedMime !== mimeType) {
          return response.status(400).json({ error: 'Tipo de arquivo declarado não corresponde ao conteúdo real' });
        }

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
