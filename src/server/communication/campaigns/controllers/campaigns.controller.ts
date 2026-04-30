/**
 * Campaigns Controller (F5-003)
 *
 * UZAPI Sender — envio em massa com controle de pastas, delays e status.
 * Capability requerida: ProviderCapability.CAMPAIGNS
 * Providers suportados: uazapi
 */

import { igniter } from '@/igniter';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { database } from '@/server/services/database';
import { z } from 'zod';
import { orchestrator } from '@/lib/providers';
import { ProviderCapability } from '@/lib/providers/core/provider.types';
import type { BrokerType } from '@/lib/providers/core/provider.types';
import { assertCapability } from '@/lib/providers/core/capability-helpers';
import type { ICampaignCapability } from '@/lib/providers/core/capabilities';
import type { Provider } from '@prisma/client';

// ==================== SCHEMAS ====================

const connectionIdBody = z.object({
  connectionId: z.string().min(1, 'connectionId é obrigatório'),
});

const sendSimpleSchema = connectionIdBody.extend({
  numbers: z.array(z.string().min(1)).min(1, 'Informe ao menos um número'),
  type: z.enum(['text', 'image', 'video', 'audio', 'document']),
  text: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  fileName: z.string().optional(),
  folder: z.string().min(1, 'folder é obrigatório'),
  delayMin: z.number().int().min(0),
  delayMax: z.number().int().min(0),
});

const sendAdvancedSchema = connectionIdBody.extend({
  messages: z
    .array(
      z.object({
        number: z.string().min(1),
        type: z.enum(['text', 'image', 'video', 'audio', 'document']),
        text: z.string().optional(),
        mediaUrl: z.string().url().optional(),
        fileName: z.string().optional(),
      }),
    )
    .min(1, 'Informe ao menos uma mensagem'),
  folder: z.string().min(1, 'folder é obrigatório'),
  delayMin: z.number().int().min(0),
  delayMax: z.number().int().min(0),
});

const connectionIdQuery = z.object({
  connectionId: z.string().min(1, 'connectionId é obrigatório'),
});

const listMessagesQuery = connectionIdQuery.extend({
  folder: z.string().min(1, 'folder é obrigatório'),
});

const editFolderSchema = connectionIdBody.extend({
  folder: z.string().min(1, 'folder é obrigatório'),
  action: z.enum(['stop', 'continue', 'delete']),
});

// ==================== HELPERS ====================

/**
 * Maps the Prisma Provider enum to the BrokerType expected by the orchestrator.
 */
function resolveBrokerType(provider: Provider): BrokerType {
  switch (provider) {
    case 'WHATSAPP_CLOUD_API':
    case 'WHATSAPP_BUSINESS_API':
      return 'cloudapi';
    case 'INSTAGRAM_META':
      return 'instagram';
    default:
      return 'uazapi';
  }
}

/**
 * Resolves the provider-level instanceId.
 * UAZAPI uses the token; CloudAPI/Instagram use the connection id.
 */
function resolveInstanceId(
  connection: { id: string; uazapiToken: string | null },
  brokerType: BrokerType,
): string {
  if (brokerType === 'uazapi') {
    return connection.uazapiToken ?? connection.id;
  }
  return connection.id;
}

// ==================== CONTROLLER ====================

export const campaignsController = igniter.controller({
  name: 'campaigns',
  path: '/campaigns',
  actions: {
    // ==================== SEND SIMPLE ====================
    sendSimple: igniter.mutation({
      name: 'SendSimpleCampaign',
      description: 'Disparar campanha simples (mesmo conteúdo para vários números)',
      path: '/send-simple',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: sendSimpleSchema,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, numbers, type, text, mediaUrl, fileName, folder, delayMin, delayMax } =
          request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Instância não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const campaignProvider = assertCapability<ICampaignCapability>(
            provider,
            ProviderCapability.CAMPAIGNS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);

          await campaignProvider.sendBulkSimple(instanceId, {
            numbers,
            type,
            text,
            mediaUrl,
            fileName,
            folder,
            delayMin,
            delayMax,
          });

          return response.success({ message: 'Campanha simples iniciada com sucesso', folder });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta campanhas em massa. Use uma instância UZAPI.`,
            );
          }
          console.error('[Campaigns] Erro ao iniciar campanha simples:', err);
          throw error;
        }
      },
    }),

    // ==================== SEND ADVANCED ====================
    sendAdvanced: igniter.mutation({
      name: 'SendAdvancedCampaign',
      description: 'Disparar campanha avançada (mensagens individualizadas por número)',
      path: '/send-advanced',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: sendAdvancedSchema,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, messages, folder, delayMin, delayMax } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Instância não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const campaignProvider = assertCapability<ICampaignCapability>(
            provider,
            ProviderCapability.CAMPAIGNS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);

          await campaignProvider.sendBulkAdvanced(instanceId, {
            messages,
            folder,
            delayMin,
            delayMax,
          });

          return response.success({ message: 'Campanha avançada iniciada com sucesso', folder });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta campanhas em massa. Use uma instância UZAPI.`,
            );
          }
          console.error('[Campaigns] Erro ao iniciar campanha avançada:', err);
          throw error;
        }
      },
    }),

    // ==================== LIST FOLDERS ====================
    listFolders: igniter.query({
      name: 'ListCampaignFolders',
      description: 'Listar pastas/campanhas ativas e históricas',
      path: '/folders',
      method: 'GET',
      use: [authProcedure({ required: true })],
      query: connectionIdQuery,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId } = request.query;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Instância não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const campaignProvider = assertCapability<ICampaignCapability>(
            provider,
            ProviderCapability.CAMPAIGNS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const folders = await campaignProvider.listCampaignFolders(instanceId);

          return response.success({ data: folders, total: folders.length });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta campanhas em massa. Use uma instância UZAPI.`,
            );
          }
          console.error('[Campaigns] Erro ao listar pastas:', err);
          throw error;
        }
      },
    }),

    // ==================== LIST MESSAGES ====================
    listMessages: igniter.query({
      name: 'ListCampaignMessages',
      description: 'Listar mensagens de uma pasta/campanha específica',
      path: '/messages',
      method: 'GET',
      use: [authProcedure({ required: true })],
      query: listMessagesQuery,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, folder } = request.query;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Instância não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const campaignProvider = assertCapability<ICampaignCapability>(
            provider,
            ProviderCapability.CAMPAIGNS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const messages = await campaignProvider.listCampaignMessages(instanceId, folder);

          return response.success({ data: messages, total: messages.length, folder });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta campanhas em massa. Use uma instância UZAPI.`,
            );
          }
          console.error('[Campaigns] Erro ao listar mensagens da pasta:', err);
          throw error;
        }
      },
    }),

    // ==================== EDIT FOLDER ====================
    editFolder: igniter.mutation({
      name: 'EditCampaignFolder',
      description: 'Pausar, continuar ou deletar uma pasta/campanha',
      path: '/folders/edit',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: editFolderSchema,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, folder, action } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Instância não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const campaignProvider = assertCapability<ICampaignCapability>(
            provider,
            ProviderCapability.CAMPAIGNS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          await campaignProvider.editCampaignFolder(instanceId, folder, action);

          return response.success({
            message: `Pasta "${folder}" atualizada: ${action}`,
            folder,
            action,
          });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta campanhas em massa. Use uma instância UZAPI.`,
            );
          }
          console.error('[Campaigns] Erro ao editar pasta:', err);
          throw error;
        }
      },
    }),

    // ==================== CLEAR COMPLETED ====================
    clearCompleted: igniter.mutation({
      name: 'ClearCompletedCampaigns',
      description: 'Limpar campanhas/pastas já concluídas',
      path: '/clear-completed',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: connectionIdBody,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Instância não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const campaignProvider = assertCapability<ICampaignCapability>(
            provider,
            ProviderCapability.CAMPAIGNS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          await campaignProvider.clearCompletedCampaigns(instanceId);

          return response.success({ message: 'Campanhas concluídas removidas com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta campanhas em massa. Use uma instância UZAPI.`,
            );
          }
          console.error('[Campaigns] Erro ao limpar campanhas concluídas:', err);
          throw error;
        }
      },
    }),

    // ==================== CLEAR ALL ====================
    clearAll: igniter.mutation({
      name: 'ClearAllCampaigns',
      description: 'Limpar todas as campanhas/pastas (incluindo ativas)',
      path: '/clear-all',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      body: connectionIdBody,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Instância não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const campaignProvider = assertCapability<ICampaignCapability>(
            provider,
            ProviderCapability.CAMPAIGNS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          await campaignProvider.clearAllCampaigns(instanceId);

          return response.success({ message: 'Todas as campanhas removidas com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta campanhas em massa. Use uma instância UZAPI.`,
            );
          }
          console.error('[Campaigns] Erro ao limpar todas as campanhas:', err);
          throw error;
        }
      },
    }),
  },
});
