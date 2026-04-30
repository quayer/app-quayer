/**
 * Templates Controller (F5-001)
 *
 * Gerenciamento de templates de mensagens via provider (CloudAPI / Meta).
 * Suporta listagem, criação, edição, exclusão e envio de templates.
 *
 * Capability requerida: ProviderCapability.TEMPLATES
 * Providers suportados: cloudapi, instagram
 */

import { igniter } from '@/igniter';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { database } from '@/server/services/database';
import { z } from 'zod';
import { orchestrator } from '@/lib/providers';
import { ProviderCapability } from '@/lib/providers/core/provider.types';
import type { BrokerType } from '@/lib/providers/core/provider.types';
import { assertCapability } from '@/lib/providers/core/capability-helpers';
import type { ITemplateCapability } from '@/lib/providers/core/capabilities';
import type { Provider } from '@prisma/client';

// ===== SCHEMAS =====

const templateComponentSchema = z.object({
  type: z.enum(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']),
  format: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
  text: z.string().optional(),
  buttons: z
    .array(
      z.object({
        type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
        text: z.string(),
        url: z.string().optional(),
        phone_number: z.string().optional(),
      }),
    )
    .optional(),
});

const sendTemplateComponentSchema = z.record(z.string(), z.unknown());

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

export const templatesController = igniter.controller({
  name: 'templates',
  path: '/templates',
  actions: {
    /**
     * GET /templates
     * Listar templates da instância
     */
    list: igniter.query({
      path: '/',
      method: 'GET',
      use: [authProcedure({ required: true })],
      query: z.object({
        connectionId: z.string().min(1),
        limit: z.coerce.number().min(1).max(200).optional(),
        offset: z.coerce.number().min(0).optional(),
        status: z.string().optional(),
        category: z.string().optional(),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, limit, offset, status, category } = request.query;

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
          const templateCapability = assertCapability<ITemplateCapability>(
            provider,
            ProviderCapability.TEMPLATES,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const templates = await templateCapability.listTemplates(instanceId, {
            limit,
            offset,
            status,
            category,
          });

          return response.success({ data: templates, total: templates.length });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de templates`,
            );
          }
          console.error('[Templates] Erro ao listar templates:', err);
          throw error;
        }
      },
    }),

    /**
     * GET /templates/:id
     * Obter template por ID
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

        const { id: templateId } = request.params as { id: string };
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
          const templateCapability = assertCapability<ITemplateCapability>(
            provider,
            ProviderCapability.TEMPLATES,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const template = await templateCapability.getTemplate(instanceId, templateId);

          return response.success({ data: template });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de templates`,
            );
          }
          console.error('[Templates] Erro ao obter template:', err);
          throw error;
        }
      },
    }),

    /**
     * POST /templates
     * Criar novo template
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
        name: z.string().min(1).max(512),
        language: z.string().min(2).max(10),
        category: z.string().min(1),
        components: z.array(templateComponentSchema).min(1),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, name, language, category, components } = request.body;

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
          const templateCapability = assertCapability<ITemplateCapability>(
            provider,
            ProviderCapability.TEMPLATES,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const template = await templateCapability.createTemplate(instanceId, {
            name,
            language,
            category,
            components,
          });

          return response.success({ data: template, message: 'Template criado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de templates`,
            );
          }
          console.error('[Templates] Erro ao criar template:', err);
          throw error;
        }
      },
    }),

    /**
     * PUT /templates/:id
     * Editar template existente
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
        name: z.string().min(1).max(512).optional(),
        language: z.string().min(2).max(10).optional(),
        category: z.string().min(1).optional(),
        components: z.array(templateComponentSchema).optional(),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { id: templateId } = request.params as { id: string };
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
          const templateCapability = assertCapability<ITemplateCapability>(
            provider,
            ProviderCapability.TEMPLATES,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const template = await templateCapability.editTemplate(
            instanceId,
            templateId,
            updateInput,
          );

          return response.success({ data: template, message: 'Template atualizado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de templates`,
            );
          }
          console.error('[Templates] Erro ao atualizar template:', err);
          throw error;
        }
      },
    }),

    /**
     * DELETE /templates/:id
     * Deletar template
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

        const { id: templateId } = request.params as { id: string };
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
          const templateCapability = assertCapability<ITemplateCapability>(
            provider,
            ProviderCapability.TEMPLATES,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          await templateCapability.deleteTemplate(instanceId, templateId);

          return response.success({ message: 'Template deletado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta gerenciamento de templates`,
            );
          }
          console.error('[Templates] Erro ao deletar template:', err);
          throw error;
        }
      },
    }),

    /**
     * POST /templates/send
     * Enviar mensagem usando template
     */
    send: igniter.mutation({
      path: '/send',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: z.object({
        connectionId: z.string().min(1),
        to: z.string().min(10),
        templateName: z.string().min(1),
        language: z.string().min(2).max(10),
        components: z.array(sendTemplateComponentSchema).optional(),
      }),
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, to, templateName, language, components } = request.body;

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
          const templateCapability = assertCapability<ITemplateCapability>(
            provider,
            ProviderCapability.TEMPLATES,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const result = await templateCapability.sendTemplate(instanceId, {
            to,
            templateName,
            language,
            components,
          });

          return response.success({ data: result, message: 'Template enviado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta envio de templates`,
            );
          }
          console.error('[Templates] Erro ao enviar template:', err);
          throw error;
        }
      },
    }),
  },
});
