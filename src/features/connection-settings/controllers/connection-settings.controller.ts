/**
 * Connection Settings Controller
 *
 * CRUD para configurações avançadas de conexões/instâncias
 * Permite customização por instância de:
 * - Concatenação de mensagens
 * - Transcrição & IA
 * - Geocoding
 * - WhatsApp 24h Window
 * - Bot Echo Detection
 * - Auto-Pause
 * - Comandos via Chat
 */

import { igniter } from "@/igniter";
import { z } from "zod";
import { authProcedure } from "@/features/auth/procedures/auth.procedure";
import { logger } from "@/services/logger";

// ==================== SCHEMAS ====================

const ConnectionSettingsSchema = z.object({
  // Concatenação
  concatEnabled: z.boolean().optional(),
  concatTimeoutMs: z.number().min(1000).max(30000).optional(),
  concatMaxMessages: z.number().min(1).max(50).optional(),
  concatSameType: z.boolean().optional(),
  concatSameSender: z.boolean().optional(),

  // Transcrição & IA
  transcriptionEnabled: z.boolean().optional(),
  imageDescriptionEnabled: z.boolean().optional(),
  documentAnalysisEnabled: z.boolean().optional(),
  videoTranscriptionEnabled: z.boolean().optional(),

  // Geocoding
  geocodingEnabled: z.boolean().optional(),
  geocodingApiKey: z.string().optional().nullable(),

  // AI Models
  transcriptionModel: z.string().optional().nullable(),
  visionModel: z.string().optional().nullable(),
  analysisModel: z.string().optional().nullable(),

  // AI Prompts
  imagePrompt: z.string().optional().nullable(),
  audioPrompt: z.string().optional().nullable(),
  documentPrompt: z.string().optional().nullable(),
  videoPrompt: z.string().optional().nullable(),

  // WhatsApp 24h Window
  enforceWhatsAppWindow: z.boolean().optional(),
  templateFallbackEnabled: z.boolean().optional(),

  // Bot Echo Detection
  botEchoEnabled: z.boolean().optional(),
  botSignature: z.string().optional().nullable(),

  // Auto-Pause
  autoPauseOnHumanReply: z.boolean().optional(),
  autoPauseDurationHours: z.number().min(1).max(168).optional(), // max 7 days

  // Comandos
  commandsEnabled: z.boolean().optional(),
  commandPrefix: z.string().max(5).optional(),
});

export const connectionSettingsController = igniter.controller({
  name: "connectionSettings",
  path: "/connection-settings",
  description: "Configurações avançadas de conexões/instâncias",
  actions: {
    // ==================== GET SETTINGS ====================
    get: igniter.query({
      name: "GetSettings",
      description: "Obter configurações de uma conexão",
      path: "/:connectionId",
      method: "GET",
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { connectionId } = request.params as { connectionId: string };

        logger.info("Getting connection settings", {
          connectionId,
          userId: context.auth?.session?.user?.id,
        });

        // Verificar se conexão existe e pertence à organização do usuário
        const connection = await context.db.connection.findUnique({
          where: { id: connectionId },
          include: { settings: true },
        });

        if (!connection) {
          return response.notFound("Conexão não encontrada");
        }

        // Verificar permissão (admin ou mesma organização)
        const userRole = context.auth?.session?.user?.role;
        const userOrgId = context.auth?.session?.user?.currentOrgId;

        if (userRole !== "admin" && connection.organizationId !== userOrgId) {
          return response.forbidden("Sem permissão para acessar esta conexão");
        }

        // Se não tem settings, retornar defaults
        if (!connection.settings) {
          return response.success({
            connectionId,
            settings: getDefaultSettings(),
            isDefault: true,
          });
        }

        return response.success({
          connectionId,
          settings: connection.settings,
          isDefault: false,
        });
      },
    }),

    // ==================== UPDATE SETTINGS ====================
    update: igniter.mutation({
      name: "UpdateSettings",
      description: "Atualizar configurações de uma conexão",
      path: "/:connectionId",
      method: "PUT",
      use: [authProcedure({ required: true })],
      body: ConnectionSettingsSchema,
      handler: async ({ request, response, context }) => {
        const { connectionId } = request.params as { connectionId: string };
        const settings = request.body;

        logger.info("Updating connection settings", {
          connectionId,
          userId: context.auth?.session?.user?.id,
          settings: Object.keys(settings),
        });

        // Verificar se conexão existe
        const connection = await context.db.connection.findUnique({
          where: { id: connectionId },
        });

        if (!connection) {
          return response.notFound("Conexão não encontrada");
        }

        // Verificar permissão
        const userRole = context.auth?.session?.user?.role;
        const userOrgId = context.auth?.session?.user?.currentOrgId;

        if (userRole !== "admin" && connection.organizationId !== userOrgId) {
          return response.forbidden("Sem permissão para modificar esta conexão");
        }

        // Upsert settings
        const updatedSettings = await context.db.connectionSettings.upsert({
          where: { connectionId },
          create: {
            connectionId,
            ...settings,
          },
          update: settings,
        });

        logger.info("Connection settings updated", {
          connectionId,
          settingsId: updatedSettings.id,
        });

        return response.success({
          connectionId,
          settings: updatedSettings,
          message: "Configurações atualizadas com sucesso",
        });
      },
    }),

    // ==================== RESET TO DEFAULTS ====================
    reset: igniter.mutation({
      name: "ResetSettings",
      description: "Resetar configurações para os valores padrão",
      path: "/:connectionId/reset",
      method: "POST",
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { connectionId } = request.params as { connectionId: string };

        logger.info("Resetting connection settings", {
          connectionId,
          userId: context.auth?.session?.user?.id,
        });

        // Verificar se conexão existe
        const connection = await context.db.connection.findUnique({
          where: { id: connectionId },
        });

        if (!connection) {
          return response.notFound("Conexão não encontrada");
        }

        // Verificar permissão
        const userRole = context.auth?.session?.user?.role;
        const userOrgId = context.auth?.session?.user?.currentOrgId;

        if (userRole !== "admin" && connection.organizationId !== userOrgId) {
          return response.forbidden("Sem permissão para modificar esta conexão");
        }

        // Deletar settings existentes (vai usar defaults)
        await context.db.connectionSettings.deleteMany({
          where: { connectionId },
        });

        logger.info("Connection settings reset to defaults", { connectionId });

        return response.success({
          connectionId,
          settings: getDefaultSettings(),
          message: "Configurações restauradas para os valores padrão",
        });
      },
    }),

    // ==================== LIST ALL (Admin) ====================
    list: igniter.query({
      name: "ListAllSettings",
      description: "Listar todas as configurações (admin only)",
      path: "/",
      method: "GET",
      use: [authProcedure({ required: true })],
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(20),
        organizationId: z.string().uuid().optional(),
      }),
      handler: async ({ request, response, context }) => {
        // Verificar se é admin
        const userRole = context.auth?.session?.user?.role;
        if (userRole !== "admin") {
          return response.forbidden("Apenas administradores podem listar todas as configurações");
        }

        const { page = 1, limit = 20, organizationId } = request.query || {};
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {};
        if (organizationId) {
          where.connection = { organizationId };
        }

        const [settings, total] = await Promise.all([
          context.db.connectionSettings.findMany({
            where,
            include: {
              connection: {
                select: {
                  id: true,
                  name: true,
                  organizationId: true,
                  organization: {
                    select: { name: true },
                  },
                },
              },
            },
            skip,
            take: limit,
            orderBy: { updatedAt: "desc" },
          }),
          context.db.connectionSettings.count({ where }),
        ]);

        return response.success({
          items: settings,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      },
    }),
  },
});

// ==================== HELPERS ====================

function getDefaultSettings() {
  return {
    // Concatenação
    concatEnabled: true,
    concatTimeoutMs: 8000,
    concatMaxMessages: 10,
    concatSameType: false,
    concatSameSender: true,

    // Transcrição & IA
    transcriptionEnabled: true,
    imageDescriptionEnabled: true,
    documentAnalysisEnabled: true,
    videoTranscriptionEnabled: true,

    // Geocoding
    geocodingEnabled: true,
    geocodingApiKey: null,

    // AI Models
    transcriptionModel: "whisper-1",
    visionModel: "gpt-4o",
    analysisModel: "gpt-4o",

    // AI Prompts
    imagePrompt: null,
    audioPrompt: null,
    documentPrompt: null,
    videoPrompt: null,

    // WhatsApp 24h Window
    enforceWhatsAppWindow: true,
    templateFallbackEnabled: false,

    // Bot Echo Detection
    botEchoEnabled: true,
    botSignature: null,

    // Auto-Pause
    autoPauseOnHumanReply: true,
    autoPauseDurationHours: 24,

    // Comandos
    commandsEnabled: true,
    commandPrefix: "@",
  };
}
