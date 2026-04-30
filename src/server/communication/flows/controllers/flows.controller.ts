/**
 * Flows Controller (F5-002)
 *
 * Gerenciamento de WhatsApp Flows via provider (CloudAPI / Meta).
 * Suporta criação, edição, publicação, depreciação, exclusão e envio de flows.
 *
 * Capability requerida: ProviderCapability.FLOWS
 * Providers suportados: cloudapi
 */

import { igniter } from '@/igniter';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { database } from '@/server/services/database';
import { z } from 'zod';
import { orchestrator } from '@/lib/providers';
import { ProviderCapability } from '@/lib/providers/core/provider.types';
import type { BrokerType } from '@/lib/providers/core/provider.types';
import { assertCapability } from '@/lib/providers/core/capability-helpers';
import type { IFlowCapability } from '@/lib/providers/core/capabilities';
import type { Provider } from '@prisma/client';

// ===== HELPERS =====

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

// ===== CONTROLLER =====

export const flowsController = igniter.controller({
  name: 'flows',
  path: '/flows',
  actions: {
    /**
     * GET /flows
     * Listar flows da instância
     */
    list: igniter.query({
      path: '/',
      method: 'GET',
      use: [authProcedure({ required: true })],
      query: z.object({
        connectionId: z.string().min(1),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId } = request.query;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const flows = await flowCapability.listFlows(instanceId);

          return response.success({ data: flows, total: flows.length });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de flows`,
            );
          }
          console.error('[Flows] Erro ao listar flows:', err);
          throw error;
        }
      },
    }),

    /**
     * GET /flows/:id
     * Obter flow por ID
     */
    getById: igniter.query({
      path: '/:id',
      method: 'GET',
      use: [authProcedure({ required: true })],
      query: z.object({
        connectionId: z.string().min(1),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { id: flowId } = request.params as { id: string };
        const { connectionId } = request.query;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const flow = await flowCapability.getFlow(instanceId, flowId);

          return response.success({ data: flow });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de flows`,
            );
          }
          console.error('[Flows] Erro ao obter flow:', err);
          throw error;
        }
      },
    }),

    /**
     * POST /flows
     * Criar novo flow
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
        name: z.string().min(1).max(255),
        categories: z.array(z.string()).min(1),
        endpointUri: z.string().url().optional(),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, name, categories, endpointUri } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const flow = await flowCapability.createFlow(instanceId, {
            name,
            categories,
            endpointUri,
          });

          return response.success({ data: flow, message: 'Flow criado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de flows`,
            );
          }
          console.error('[Flows] Erro ao criar flow:', err);
          throw error;
        }
      },
    }),

    /**
     * PUT /flows/:id
     * Atualizar metadados de um flow
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
        name: z.string().min(1).max(255).optional(),
        categories: z.array(z.string()).optional(),
        endpointUri: z.string().url().optional(),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { id: flowId } = request.params as { id: string };
        const { connectionId, ...updateInput } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const flow = await flowCapability.updateFlow(instanceId, flowId, updateInput);

          return response.success({ data: flow, message: 'Flow atualizado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de flows`,
            );
          }
          console.error('[Flows] Erro ao atualizar flow:', err);
          throw error;
        }
      },
    }),

    /**
     * POST /flows/:id/json
     * Atualizar o JSON de um flow (conteúdo / telas)
     */
    updateJSON: igniter.mutation({
      path: '/:id/json',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
        jsonContent: z.union([z.string().min(1), z.record(z.string(), z.unknown())]),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { id: flowId } = request.params as { id: string };
        const { connectionId, jsonContent } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          await flowCapability.updateFlowJSON(instanceId, flowId, jsonContent);

          return response.success({ message: 'JSON do flow atualizado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de flows`,
            );
          }
          console.error('[Flows] Erro ao atualizar JSON do flow:', err);
          throw error;
        }
      },
    }),

    /**
     * POST /flows/:id/publish
     * Publicar um flow (draft -> published)
     */
    publish: igniter.mutation({
      path: '/:id/publish',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { id: flowId } = request.params as { id: string };
        const { connectionId } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          await flowCapability.publishFlow(instanceId, flowId);

          return response.success({ message: 'Flow publicado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de flows`,
            );
          }
          console.error('[Flows] Erro ao publicar flow:', err);
          throw error;
        }
      },
    }),

    /**
     * POST /flows/:id/deprecate
     * Deprecar um flow publicado
     */
    deprecate: igniter.mutation({
      path: '/:id/deprecate',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { id: flowId } = request.params as { id: string };
        const { connectionId } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          await flowCapability.deprecateFlow(instanceId, flowId);

          return response.success({ message: 'Flow depreciado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de flows`,
            );
          }
          console.error('[Flows] Erro ao deprecar flow:', err);
          throw error;
        }
      },
    }),

    /**
     * DELETE /flows/:id
     * Deletar flow
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { id: flowId } = request.params as { id: string };
        const { connectionId } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          await flowCapability.deleteFlow(instanceId, flowId);

          return response.success({ message: 'Flow deletado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de flows`,
            );
          }
          console.error('[Flows] Erro ao deletar flow:', err);
          throw error;
        }
      },
    }),

    /**
     * POST /flows/send
     * Enviar mensagem interativa de flow para um contato
     */
    send: igniter.mutation({
      path: '/send',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
        to: z.string().min(10),
        flowId: z.string().min(1),
        flowCta: z.string().min(1),
        mode: z.enum(['draft', 'published']),
        flowActionPayload: z.record(z.string(), z.unknown()).optional(),
        headerText: z.string().optional(),
        bodyText: z.string().optional(),
        footerText: z.string().optional(),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const {
          connectionId,
          to,
          flowId,
          flowCta,
          mode,
          flowActionPayload,
          headerText,
          bodyText,
          footerText,
        } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        const brokerType = resolveBrokerType(connection.provider);

        const provider = orchestrator['providers'].get(brokerType);
        if (!provider) {
          return response.badRequest(`Provider "${brokerType}" não está disponível`);
        }

        try {
          const flowCapability = assertCapability<IFlowCapability>(
            provider,
            ProviderCapability.FLOWS,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const result = await flowCapability.sendFlowMessage(instanceId, {
            to,
            flowId,
            flowCta,
            mode,
            flowActionPayload,
            headerText,
            bodyText,
            footerText,
          });

          return response.success({ data: result, message: 'Flow enviado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta envio de flows`,
            );
          }
          console.error('[Flows] Erro ao enviar flow:', err);
          throw error;
        }
      },
    }),
  },
});
