import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';
import { ConnectionStatus } from '@prisma/client';

// Profile picture cache (in-memory for quick lookups)
// We download and cache as base64 so they don't expire
const profilePicCache = new Map<string, { url: string | null; expiresAt: number }>();
const PROFILE_PIC_CACHE_TTL = 1000 * 60 * 60; // 1 hour (cached as base64, doesn't expire)

/**
 * Download image from URL and convert to base64 data URL
 * Handles WhatsApp CDN URL expiration gracefully
 */
async function downloadAsBase64(imageUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // 403 = URL expired, 404 = no image, both are expected
      if (response.status === 403 || response.status === 404) {
        console.debug(`[ProfilePic] Image unavailable (${response.status}): URL expired or not found`);
      } else {
        console.warn(`[ProfilePic] Failed to download image: ${response.status}`);
      }
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Validate it's actually an image
    if (!contentType.startsWith('image/')) {
      console.warn(`[ProfilePic] Unexpected content type: ${contentType}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    // Skip if too small (likely an error response)
    if (arrayBuffer.byteLength < 100) {
      console.debug('[ProfilePic] Image too small, likely error response');
      return null;
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[ProfilePic] Request timeout');
    } else {
      console.error('[ProfilePic] Error downloading image:', error);
    }
    return null;
  }
}

/**
 * Contacts Controller
 *
 * Gerenciamento de contatos do sistema
 * Contatos são criados automaticamente a partir de interações WhatsApp
 *
 * Rotas:
 * - GET    /api/contacts                - Listar contatos
 * - GET    /api/contacts/:id            - Buscar por ID
 * - PUT    /api/contacts/:id            - Atualizar contato
 * - DELETE /api/contacts/:id            - Deletar contato
 * - GET    /api/contacts/:id/sessions   - Histórico de sessões do contato
 */
export const contactsController = igniter.controller({
  name: 'contacts',
  path: '/contacts',
  description: 'Gerenciamento de contatos',

  actions: {
    /**
     * GET /api/contacts
     * Listar contatos com filtros e paginação
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        search: z.string().optional(),
        tag: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { page = 1, limit = 50, search, tag } = request.query;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const isAdmin = user.role === 'admin';

        // 🔒 SECURITY FIX: Bloquear usuários sem organização (previne vazamento de dados)
        if (!isAdmin && !user.currentOrgId) {
          return response.forbidden('Usuário não possui organização associada. Complete o onboarding primeiro.');
        }

        // Admin pode ver todos os contatos, outros usuários veem apenas da sua org
        const organizationId = isAdmin ? undefined : user.currentOrgId;

        const where: any = {};

        // Filtrar por organização se não for admin
        if (organizationId) {
          where.organizationId = organizationId;
        }

        // Busca por nome, telefone ou email
        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { phoneNumber: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ];
        }

        // Filtrar por tag
        if (tag) {
          where.tags = { has: tag };
        }

        const [contacts, total] = await Promise.all([
          database.contact.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { updatedAt: 'desc' },
            include: {
              // Incluir última sessão para mostrar última interação
              chatSessions: {
                take: 1,
                orderBy: { updatedAt: 'desc' },
                select: {
                  id: true,
                  status: true,
                  updatedAt: true,
                  organization: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          }),
          database.contact.count({ where }),
        ]);

        // Formatar resposta com última interação
        const formattedContacts = contacts.map((contact) => ({
          ...contact,
          lastInteractionAt: contact.chatSessions[0]?.updatedAt || contact.updatedAt,
          lastSessionStatus: contact.chatSessions[0]?.status || null,
          organizationName: contact.chatSessions[0]?.organization?.name || null,
        }));

        return response.success({
          data: formattedContacts,
          pagination: {
            total,
            totalPages: Math.ceil(total / limit),
            page,
            limit,
          },
        });
      },
    }),

    /**
     * GET /api/contacts/:id
     * Buscar contato por ID
     */
    getById: igniter.query({
      path: '/:id',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // 🔒 SECURITY: Validar organização antes de buscar
        if (user.role !== 'admin' && !user.currentOrgId) {
          return response.forbidden('Usuário não possui organização associada');
        }

        const contact = await database.contact.findUnique({
          where: { id },
          include: {
            chatSessions: {
              take: 10,
              orderBy: { updatedAt: 'desc' },
              select: {
                id: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                organization: {
                  select: { id: true, name: true },
                },
              },
            },
            contactAttributes: {
              include: {
                attribute: true,
              },
            },
            contactObservations: {
              take: 10,
              orderBy: { createdAt: 'desc' },
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão (admin pode ver qualquer contato)
        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a este contato');
        }

        return response.success({
          data: contact,
        });
      },
    }),

    /**
     * PUT /api/contacts/:id
     * Atualizar contato
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      body: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        tags: z.array(z.string()).optional(),
        bypassBots: z.boolean().optional(),
        customFields: z.record(z.any()).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const { name, email, tags, bypassBots, customFields } = request.body;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // 🔒 SECURITY: Validar organização antes de modificar
        if (user.role !== 'admin' && !user.currentOrgId) {
          return response.forbidden('Usuário não possui organização associada');
        }

        // Verificar se contato existe
        const existing = await database.contact.findUnique({
          where: { id },
        });

        if (!existing) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão
        if (user.role !== 'admin' && existing.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a este contato');
        }

        const contact = await database.contact.update({
          where: { id },
          data: {
            ...(name !== undefined && { name }),
            ...(email !== undefined && { email }),
            ...(tags !== undefined && { tags }),
            ...(bypassBots !== undefined && { bypassBots }),
            ...(customFields !== undefined && { customFields }),
          },
        });

        return response.success({
          data: contact,
          message: 'Contato atualizado com sucesso',
        });
      },
    }),

    /**
     * DELETE /api/contacts/:id
     * Deletar contato
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // 🔒 SECURITY: Validar organização antes de deletar
        if (user.role !== 'admin' && !user.currentOrgId) {
          return response.forbidden('Usuário não possui organização associada');
        }

        const contact = await database.contact.findUnique({
          where: { id },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão
        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a este contato');
        }

        await database.contact.delete({
          where: { id },
        });

        return response.noContent();
      },
    }),

    /**
     * GET /api/contacts/:id/sessions
     * Histórico de sessões do contato
     */
    getSessions: igniter.query({
      path: '/:id/sessions',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(50).default(20),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = request.params as { id: string };
        const { page = 1, limit = 20 } = request.query;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // 🔒 SECURITY: Validar organização antes de acessar
        if (user.role !== 'admin' && !user.currentOrgId) {
          return response.forbidden('Usuário não possui organização associada');
        }

        // Verificar se contato existe
        const contact = await database.contact.findUnique({
          where: { id },
        });

        if (!contact) {
          return response.notFound('Contato não encontrado');
        }

        // Verificar permissão
        if (user.role !== 'admin' && contact.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado');
        }

        const [sessions, total] = await Promise.all([
          database.chatSession.findMany({
            where: { contactId: id },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { updatedAt: 'desc' },
            include: {
              organization: {
                select: { id: true, name: true },
              },
              connection: {
                select: { id: true, name: true, phoneNumber: true },
              },
              _count: {
                select: { messages: true },
              },
            },
          }),
          database.chatSession.count({ where: { contactId: id } }),
        ]);

        return response.success({
          data: sessions,
          pagination: {
            total,
            totalPages: Math.ceil(total / limit),
            page,
            limit,
          },
        });
      },
    }),

    /**
     * GET /api/contacts/profile-picture
     * Fetch profile picture from WhatsApp API
     */
    profilePicture: igniter.query({
      path: '/profile-picture',
      query: z.object({
        instanceId: z.string().uuid(),
        phoneNumber: z.string(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { instanceId, phoneNumber } = request.query;
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        // Check cache first (short TTL because WhatsApp URLs expire fast)
        const cleanNumber = phoneNumber.replace(/@.*$/, '');
        const cacheKey = `${instanceId}:${cleanNumber}`;
        const cached = profilePicCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          return response.success({ url: cached.url, source: 'cache' });
        }

        // NOTE: We don't use database-stored URLs because WhatsApp URLs expire quickly
        // Always fetch fresh from the WhatsApp API

        // Fetch from WhatsApp API
        const connection = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: { some: { userId: user.id } },
            },
          },
          select: { uazapiToken: true, status: true },
        });

        if (!connection || connection.status !== ConnectionStatus.CONNECTED || !connection.uazapiToken) {
          // Log detalhado para debugging
          console.warn(`[ContactsController] Connection unavailable for profile pic:`, {
            instanceId,
            phoneNumber: cleanNumber,
            found: !!connection,
            status: connection?.status,
            hasToken: !!connection?.uazapiToken,
          });
          // Cache null result to avoid repeated API calls
          profilePicCache.set(cacheKey, { url: null, expiresAt: Date.now() + PROFILE_PIC_CACHE_TTL });
          return response.success({ url: null, source: 'unavailable' });
        }

        try {
          const baseUrl = process.env.UAZAPI_URL || 'https://quayer.uazapi.com';

          // Use POST /chat/details endpoint (more reliable than GET /profile/image)
          const apiResponse = await fetch(`${baseUrl}/chat/details`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'token': connection.uazapiToken,
            },
            body: JSON.stringify({
              number: cleanNumber,
            }),
          });

          if (!apiResponse.ok) {
            // Log detalhado para debugging
            const errorText = await apiResponse.text().catch(() => 'Failed to read error body');
            console.warn(`[ContactsController] Profile picture API error for ${cleanNumber}:`, {
              status: apiResponse.status,
              statusText: apiResponse.statusText,
              body: errorText.substring(0, 200), // Limitar tamanho do log
              instanceId,
            });
            profilePicCache.set(cacheKey, { url: null, expiresAt: Date.now() + PROFILE_PIC_CACHE_TTL });
            return response.success({ url: null, source: 'api_error' });
          }

          const data = await apiResponse.json();
          // /chat/details returns { image, imagePreview, ... }
          const profilePicUrl = data.image || data.imagePreview || data.profilePicUrl || data.url || null;

          if (!profilePicUrl) {
            profilePicCache.set(cacheKey, { url: null, expiresAt: Date.now() + PROFILE_PIC_CACHE_TTL });
            return response.success({ url: null, source: 'no_url' });
          }

          // Download image and convert to base64 (so it doesn't expire)
          const base64Url = await downloadAsBase64(profilePicUrl);

          // Cache the result (base64 or null)
          profilePicCache.set(cacheKey, {
            url: base64Url,
            expiresAt: Date.now() + PROFILE_PIC_CACHE_TTL,
          });

          return response.success({ url: base64Url, source: 'api' });
        } catch (error) {
          console.error('[ContactsController] Error fetching profile picture:', error);
          profilePicCache.set(cacheKey, { url: null, expiresAt: Date.now() + PROFILE_PIC_CACHE_TTL });
          return response.success({ url: null, source: 'error' });
        }
      },
    }),
  },
});
