/**
 * Organization Providers Controller
 *
 * CRUD para gerenciamento de provedores BYOC (Bring Your Own Credentials).
 * Suporta múltiplas chaves por provedor (com nome/label) e override por projeto Builder.
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { credentialResolver } from '@/lib/providers/credential-resolver.service';
import { database } from '@/server/services/database';
import { logger } from '@/server/services/logger';
import type { OrganizationProvider, ProviderCategory } from '@prisma/client';

// ==================== SCHEMAS ====================

const ProviderCategoryEnum = z.enum(['AI', 'TRANSCRIPTION', 'TTS', 'INFRASTRUCTURE', 'AUXILIARY']);

const CredentialsSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  apiUrl: z.string().optional(),
  region: z.string().optional(),
  bucket: z.string().optional(),
  projectId: z.string().optional(),
}).passthrough();

const CreateProviderSchema = z.object({
  name: z.string().max(100).optional().default(''),
  category: ProviderCategoryEnum,
  provider: z.string().min(1).max(50),
  credentials: CredentialsSchema,
  settings: z.record(z.unknown()).optional(),
  isPrimary: z.boolean().optional().default(false),
  priority: z.number().int().min(0).max(100).optional(),
  /** When set, this key belongs to a specific BuilderProject (not org-wide) */
  builderProjectId: z.string().uuid().optional(),
});

const UpdateProviderSchema = z.object({
  name: z.string().max(100).optional(),
  credentials: CredentialsSchema.optional(),
  settings: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

// ==================== CONTROLLER ====================

export const organizationProvidersController = igniter.controller({
  name: 'organizationProviders',
  path: '/organization-providers',
  description: 'Gerenciamento de provedores BYOC',
  actions: {
    // ==================== LIST AVAILABLE PROVIDERS ====================
    listAvailable: igniter.query({
      name: 'ListAvailableProviders',
      description: 'Listar provedores disponíveis por categoria',
      path: '/available',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Autenticação necessária');

        const availableProviders = {
          AI: [
            { id: 'openai', name: 'OpenAI', description: 'GPT-4, GPT-3.5, Whisper' },
            { id: 'anthropic', name: 'Anthropic', description: 'Claude 3.5, Claude 3' },
            { id: 'google', name: 'Google AI', description: 'Gemini Pro, Gemini Flash' },
            { id: 'openrouter', name: 'OpenRouter', description: 'Acesso a múltiplos modelos' },
          ],
          TRANSCRIPTION: [
            { id: 'whisper', name: 'Whisper (OpenAI)', description: 'Transcrição de áudio' },
            { id: 'deepgram', name: 'Deepgram', description: 'Transcrição em tempo real' },
            { id: 'assemblyai', name: 'AssemblyAI', description: 'Transcrição com diarização' },
          ],
          TTS: [
            { id: 'elevenlabs', name: 'ElevenLabs', description: 'Vozes realistas' },
            { id: 'openai-tts', name: 'OpenAI TTS', description: 'Text-to-Speech básico' },
          ],
          INFRASTRUCTURE: [
            { id: 'redis', name: 'Redis', description: 'Cache e Pub/Sub' },
            { id: 'postgresql', name: 'PostgreSQL', description: 'Banco de dados relacional' },
            { id: 'supabase', name: 'Supabase', description: 'BaaS completo' },
            { id: 's3', name: 'AWS S3', description: 'Storage de arquivos' },
          ],
          AUXILIARY: [
            { id: 'google-maps', name: 'Google Maps', description: 'Geocoding e mapas' },
            { id: 'sendgrid', name: 'SendGrid', description: 'Envio de emails' },
            { id: 'resend', name: 'Resend', description: 'Email para desenvolvedores' },
          ],
        };

        return response.success({ data: availableProviders });
      },
    }),

    // ==================== GET RESOLVED CREDENTIALS (debug/admin) ====================
    resolve: igniter.query({
      name: 'ResolveCredentials',
      description: 'Resolver credenciais (para debug/admin)',
      path: '/resolve/:category/:provider',
      method: 'GET',
      query: z.object({
        connectionId: z.string().optional(),
        projectId: z.string().uuid().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Autenticação necessária');
        if (user.role !== 'admin') return response.forbidden('Apenas administradores');

        const { category, provider } = request.params as { category: string; provider: string };
        const organizationId = user.currentOrgId;
        if (!organizationId) return response.forbidden('Organização não encontrada');

        const resolved = await credentialResolver.resolve(
          category as ProviderCategory,
          provider,
          {
            organizationId,
            connectionId: request.query.connectionId,
            projectId: request.query.projectId,
          }
        );

        if (!resolved) return response.notFound('Nenhuma credencial encontrada');

        return response.success({
          data: {
            source: resolved.source,
            provider: resolved.provider,
            providerId: resolved.providerId,
            hasCredentials: !!resolved.credentials.apiKey || !!resolved.credentials.apiUrl,
            settings: resolved.settings,
          },
        });
      },
    }),

    // ==================== LIST ====================
    list: igniter.query({
      name: 'ListProviders',
      description: 'Listar provedores da organização (ou de um projeto específico)',
      path: '/',
      method: 'GET',
      query: z.object({
        category: ProviderCategoryEnum.optional(),
        isActive: z.coerce.boolean().optional(),
        /** When provided, returns only project-scoped keys for this project */
        builderProjectId: z.string().uuid().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Autenticação necessária');

        const organizationId = user.role === 'admin' ? undefined : user.currentOrgId;
        if (user.role !== 'admin' && !organizationId) {
          return response.forbidden('Organização não encontrada');
        }

        const where: Record<string, unknown> = {};
        if (organizationId) where.organizationId = organizationId;
        if (request.query.category) where.category = request.query.category;
        if (request.query.isActive !== undefined) where.isActive = request.query.isActive;

        // Scope filter: project-level or org-level (null)
        if (request.query.builderProjectId) {
          where.builderProjectId = request.query.builderProjectId;
        } else {
          where.builderProjectId = null;
        }

        const providers = await database.organizationProvider.findMany({
          where,
          orderBy: [{ category: 'asc' }, { priority: 'asc' }],
          include: {
            organization: { select: { id: true, name: true } },
          },
        });

        const maskedProviders = providers.map((p: OrganizationProvider) => ({
          ...p,
          credentials: maskCredentials(p.credentials as Record<string, string>),
        }));

        return response.success({ data: maskedProviders, count: maskedProviders.length });
      },
    }),

    // ==================== GET BY ID ====================
    getById: igniter.query({
      name: 'GetProvider',
      path: '/:id',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        const { id } = request.params as { id: string };
        if (!user) return response.unauthorized('Autenticação necessária');

        const provider = await database.organizationProvider.findUnique({
          where: { id },
          include: { organization: { select: { id: true, name: true } } },
        });

        if (!provider) return response.notFound('Provedor não encontrado');
        if (user.role !== 'admin' && provider.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        return response.success({
          data: {
            ...provider,
            credentials: maskCredentials(provider.credentials as Record<string, string>),
          },
        });
      },
    }),

    // ==================== CREATE ====================
    create: igniter.mutation({
      name: 'CreateProvider',
      path: '/',
      method: 'POST',
      body: CreateProviderSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) return response.unauthorized('Autenticação necessária');

        const organizationId = user.currentOrgId;
        if (!organizationId) return response.forbidden('Organização não encontrada');

        const { name, category, provider, credentials, settings, isPrimary, builderProjectId } = request.body;

        // Validate project scope: project must belong to this org
        if (builderProjectId) {
          const project = await database.builderProject.findUnique({
            where: { id: builderProjectId },
            select: { organizationId: true },
          });
          if (!project || project.organizationId !== organizationId) {
            return response.forbidden('Projeto não pertence à organização');
          }
        }

        // Auto-assign next priority for this (org, category, provider, scope) combination
        const maxEntry = await database.organizationProvider.findFirst({
          where: { organizationId, category, provider, builderProjectId: builderProjectId ?? null },
          orderBy: { priority: 'desc' },
          select: { priority: true },
        });
        const nextPriority = request.body.priority ?? (maxEntry ? maxEntry.priority + 1 : 0);

        // Auto-generate name if empty
        const entryCount = await database.organizationProvider.count({
          where: { organizationId, category, provider, builderProjectId: builderProjectId ?? null },
        });
        const resolvedName = name?.trim() || `Chave ${entryCount + 1}`;

        // If isPrimary, demote others in same scope
        if (isPrimary) {
          await database.organizationProvider.updateMany({
            where: {
              organizationId,
              category,
              isPrimary: true,
              builderProjectId: builderProjectId ?? null,
            },
            data: { isPrimary: false },
          });
        }

        const created = await database.organizationProvider.create({
          data: {
            organizationId,
            name: resolvedName,
            category,
            provider,
            credentials: credentials as object,
            settings: (settings || {}) as object,
            isPrimary: isPrimary || false,
            priority: nextPriority,
            builderProjectId: builderProjectId ?? null,
          },
        });

        credentialResolver.invalidateOrganization(organizationId);
        if (builderProjectId) credentialResolver.invalidateProject(builderProjectId);

        logger.info('Created organization provider', {
          organizationId,
          category,
          provider,
          builderProjectId: builderProjectId ?? null,
          userId: user.id,
        });

        return response.success({
          data: {
            ...created,
            credentials: maskCredentials(created.credentials as Record<string, string>),
          },
          message: 'Provedor criado com sucesso',
        });
      },
    }),

    // ==================== UPDATE ====================
    update: igniter.mutation({
      name: 'UpdateProvider',
      path: '/:id',
      method: 'PUT',
      body: UpdateProviderSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        const { id } = request.params as { id: string };
        if (!user) return response.unauthorized('Autenticação necessária');

        const existing = await database.organizationProvider.findUnique({ where: { id } });
        if (!existing) return response.notFound('Provedor não encontrado');
        if (user.role !== 'admin' && existing.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        const { name, credentials, settings, isActive, isPrimary, priority } = request.body;

        if (isPrimary) {
          await database.organizationProvider.updateMany({
            where: {
              organizationId: existing.organizationId,
              category: existing.category,
              isPrimary: true,
              builderProjectId: existing.builderProjectId,
              id: { not: id },
            },
            data: { isPrimary: false },
          });
        }

        const updated = await database.organizationProvider.update({
          where: { id },
          data: {
            ...(name !== undefined && { name: name.trim() }),
            ...(credentials && { credentials: credentials as object }),
            ...(settings !== undefined && { settings: settings as object }),
            ...(isActive !== undefined && { isActive }),
            ...(isPrimary !== undefined && { isPrimary }),
            ...(priority !== undefined && { priority }),
          },
        });

        credentialResolver.invalidateOrganization(existing.organizationId);
        if (existing.builderProjectId) credentialResolver.invalidateProject(existing.builderProjectId);

        return response.success({
          data: {
            ...updated,
            credentials: maskCredentials(updated.credentials as Record<string, string>),
          },
          message: 'Provedor atualizado com sucesso',
        });
      },
    }),

    // ==================== DELETE ====================
    delete: igniter.mutation({
      name: 'DeleteProvider',
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        const { id } = request.params as { id: string };
        if (!user) return response.unauthorized('Autenticação necessária');

        const existing = await database.organizationProvider.findUnique({ where: { id } });
        if (!existing) return response.notFound('Provedor não encontrado');
        if (user.role !== 'admin' && existing.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        await database.organizationProvider.delete({ where: { id } });

        credentialResolver.invalidateOrganization(existing.organizationId);
        if (existing.builderProjectId) credentialResolver.invalidateProject(existing.builderProjectId);

        logger.info('Deleted organization provider', {
          providerId: id,
          organizationId: existing.organizationId,
          provider: existing.provider,
          builderProjectId: existing.builderProjectId,
          userId: user.id,
        });

        return response.noContent();
      },
    }),

    // ==================== TEST CONNECTION ====================
    test: igniter.mutation({
      name: 'TestProvider',
      path: '/:id/test',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        const { id } = request.params as { id: string };
        if (!user) return response.unauthorized('Autenticação necessária');

        const existing = await database.organizationProvider.findUnique({ where: { id } });
        if (!existing) return response.notFound('Provedor não encontrado');
        if (user.role !== 'admin' && existing.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        const result = await credentialResolver.testProvider(id);

        return response.success({
          data: result,
          message: result.success
            ? 'Conexão testada com sucesso'
            : `Falha na conexão: ${result.error}`,
        });
      },
    }),
  },
});

// ==================== HELPERS ====================

function maskCredentials(credentials: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};

  for (const [key, value] of Object.entries(credentials)) {
    if (!value) {
      masked[key] = '';
      continue;
    }

    if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('password')) {
      if (value.length <= 8) {
        masked[key] = '********';
      } else {
        masked[key] = value.slice(0, 4) + '****' + value.slice(-4);
      }
    } else if (key.toLowerCase().includes('url')) {
      try {
        const url = new URL(value);
        if (url.password) {
          url.password = '****';
          masked[key] = url.toString();
        } else {
          masked[key] = value;
        }
      } catch {
        masked[key] = value;
      }
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
