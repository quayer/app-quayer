/**
 * Chatwoot Controller
 * 
 * @description API endpoints for Chatwoot integration configuration.
 * Provides GET/PUT endpoints for managing Chatwoot settings per connection.
 * 
 * Endpoints:
 * - GET  /chatwoot/config/:connectionId - Get Chatwoot configuration
 * - PUT  /chatwoot/config/:connectionId - Update Chatwoot configuration
 * - POST /chatwoot/test/:connectionId   - Test Chatwoot connection
 * 
 * @version 1.0.0
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { chatwootProcedure } from '../procedures/chatwoot.procedure';
import { 
  UpdateChatwootConfigSchema, 
  type ChatwootConfigResponse,
  type ChatwootUpdateResponse,
} from '../chatwoot.interfaces';
import { ChatwootClient } from '../services/chatwoot.client';

/**
 * Generate base URL for webhooks
 */
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 
         process.env.NEXTAUTH_URL || 
         'https://app.quayer.com.br';
}

export const chatwootController = igniter.controller({
  name: 'chatwoot',
  path: '/chatwoot',
  description: 'Chatwoot integration configuration endpoints',
  actions: {
    // =========================================================================
    // GET /chatwoot/config/:connectionId
    // =========================================================================
    getConfig: igniter.query({
      name: 'GetConfig',
      description: 'Get Chatwoot configuration for a connection',
      path: '/config/:connectionId' as const,
      use: [authProcedure({ required: true }), chatwootProcedure()],
      handler: async ({ request, response, context }) => {
        // Observation: Extract connectionId from path params
        const { connectionId } = request.params;
        
        // Business Rule: Get user's organization ID
        const organizationId = context.auth?.session?.user?.currentOrgId;
        if (!organizationId) {
          return response.unauthorized('Organização não encontrada');
        }

        // Business Rule: Verify user has access to this connection
        const connection = await context.services.database.connection.findFirst({
          where: {
            id: connectionId,
            organizationId,
          },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        // Business Logic: Get Chatwoot configuration
        const config = await context.features.chatwoot.repository.getConfig(
          connectionId,
          organizationId
        );

        // Response: Build response object
        const webhookUrl = context.features.chatwoot.repository.generateWebhookUrl(
          getBaseUrl(),
          connectionId
        );

        const configResponse: ChatwootConfigResponse = {
          chatwoot_enabled: config?.enabled ?? false,
          chatwoot_url: config?.url,
          chatwoot_account_id: config?.accountId,
          chatwoot_inbox_id: config?.inboxId,
          chatwoot_access_token: config?.accessToken ? '***' : undefined, // Mask token
          chatwoot_ignore_groups: config?.ignoreGroups ?? false,
          chatwoot_sign_messages: config?.signMessages ?? true,
          chatwoot_create_new_conversation: config?.createNewConversation ?? false,
          chatwoot_typing_indicator: config?.typingIndicator ?? true,
          chatwoot_typing_delay_ms: config?.typingDelayMs ?? 1500,
          chatwoot_inbox_webhook_url: webhookUrl,
        };

        return response.success(configResponse);
      },
    }),

    // =========================================================================
    // PUT /chatwoot/config/:connectionId
    // =========================================================================
    updateConfig: igniter.mutation({
      name: 'UpdateConfig',
      description: 'Update Chatwoot configuration for a connection',
      path: '/config/:connectionId' as const,
      method: 'PUT',
      use: [authProcedure({ required: true }), chatwootProcedure()],
      body: UpdateChatwootConfigSchema,
      handler: async ({ request, response, context }) => {
        // Observation: Extract connectionId and body
        const { connectionId } = request.params;
        const updateData = request.body;

        // Business Rule: Get user's organization ID
        const organizationId = context.auth?.session?.user?.currentOrgId;
        if (!organizationId) {
          return response.unauthorized('Organização não encontrada');
        }

        // Business Rule: Verify user has access to this connection
        const connection = await context.services.database.connection.findFirst({
          where: {
            id: connectionId,
            organizationId,
          },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        // Business Rule: If enabling, validate required fields
        if (updateData.enabled) {
          if (!updateData.url && !updateData.accessToken) {
            // Get existing config to check if we have required fields
            const existing = await context.features.chatwoot.repository.getConfig(
              connectionId,
              organizationId
            );

            if (!existing || !existing.url || !existing.accessToken) {
              return response.badRequest(
                'URL e Token de acesso são obrigatórios para habilitar a integração'
              );
            }
          }
        }

        // Business Logic: Update configuration
        const updatedConfig = await context.features.chatwoot.repository.upsertConfig(
          connectionId,
          organizationId,
          updateData
        );

        // Response: Build response with webhook URL
        const webhookUrl = context.features.chatwoot.repository.generateWebhookUrl(
          getBaseUrl(),
          connectionId
        );

        const updateResponse: ChatwootUpdateResponse = {
          message: updateData.enabled 
            ? 'Chatwoot config updated successfully, put this URL in Chatwoot inbox webhook settings:'
            : 'Chatwoot integration disabled',
          chatwoot_inbox_webhook_url: webhookUrl,
          config: {
            chatwoot_enabled: updatedConfig.enabled,
            chatwoot_url: updatedConfig.url,
            chatwoot_account_id: updatedConfig.accountId,
            chatwoot_inbox_id: updatedConfig.inboxId,
            chatwoot_access_token: '***', // Always mask
            chatwoot_ignore_groups: updatedConfig.ignoreGroups,
            chatwoot_sign_messages: updatedConfig.signMessages,
            chatwoot_create_new_conversation: updatedConfig.createNewConversation,
            chatwoot_typing_indicator: updatedConfig.typingIndicator,
            chatwoot_typing_delay_ms: updatedConfig.typingDelayMs,
            chatwoot_inbox_webhook_url: webhookUrl,
          },
        };

        console.log(`[Chatwoot] Config updated for connection ${connectionId}:`, {
          enabled: updatedConfig.enabled,
          url: updatedConfig.url,
        });

        return response.success(updateResponse);
      },
    }),

    // =========================================================================
    // POST /chatwoot/test/:connectionId
    // =========================================================================
    testConnection: igniter.mutation({
      name: 'TestConnection',
      description: 'Test Chatwoot connection with provided credentials',
      path: '/test/:connectionId' as const,
      method: 'POST',
      use: [authProcedure({ required: true }), chatwootProcedure()],
      body: z.object({
        url: z.string().url('URL inválida'),
        accessToken: z.string().min(1, 'Token é obrigatório'),
        accountId: z.number().int().positive('Account ID inválido'),
        inboxId: z.number().int().positive('Inbox ID inválido').optional(),
      }),
      handler: async ({ request, response, context }) => {
        // Observation: Extract test credentials from body
        const { url, accessToken, accountId, inboxId } = request.body;
        const { connectionId } = request.params;

        // Business Rule: Get user's organization ID
        const organizationId = context.auth?.session?.user?.currentOrgId;
        if (!organizationId) {
          return response.unauthorized('Organização não encontrada');
        }

        // Business Rule: Verify user has access to this connection
        const connection = await context.services.database.connection.findFirst({
          where: {
            id: connectionId,
            organizationId,
          },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        // Business Logic: Create temporary client to test connection
        const client = new ChatwootClient({
          url,
          accessToken,
          accountId,
          inboxId,
        });

        try {
          const result = await client.testConnection();

          if (result.success) {
            // Business Rule: Also try to list inboxes to validate permissions
            const inboxes = await client.listInboxes();

            return response.success({
              success: true,
              message: 'Conexão com Chatwoot estabelecida com sucesso!',
              account: result.account,
              inboxes: inboxes.map(inbox => ({
                id: inbox.id,
                name: inbox.name,
                channel_type: inbox.channel_type,
              })),
            });
          } else {
            return response.badRequest(result.error || 'Falha ao conectar com Chatwoot');
          }
        } catch (error: any) {
          console.error('[Chatwoot] Test connection error:', error);
          return response.badRequest(`Erro ao conectar: ${error.message}`);
        }
      },
    }),

    // =========================================================================
    // DELETE /chatwoot/config/:connectionId
    // =========================================================================
    deleteConfig: igniter.mutation({
      name: 'DeleteConfig',
      description: 'Delete Chatwoot configuration for a connection',
      path: '/config/:connectionId' as const,
      method: 'DELETE',
      use: [authProcedure({ required: true }), chatwootProcedure()],
      handler: async ({ request, response, context }) => {
        // Observation: Extract connectionId
        const { connectionId } = request.params;

        // Business Rule: Get user's organization ID
        const organizationId = context.auth?.session?.user?.currentOrgId;
        if (!organizationId) {
          return response.unauthorized('Organização não encontrada');
        }

        // Business Rule: Verify user has access to this connection
        const connection = await context.services.database.connection.findFirst({
          where: {
            id: connectionId,
            organizationId,
          },
        });

        if (!connection) {
          return response.notFound('Conexão não encontrada');
        }

        // Business Logic: Delete configuration
        const deleted = await context.features.chatwoot.repository.deleteConfig(
          connectionId,
          organizationId
        );

        if (!deleted) {
          return response.notFound('Configuração não encontrada');
        }

        return response.success({
          message: 'Configuração do Chatwoot removida com sucesso',
        });
      },
    }),

    // =========================================================================
    // GET /chatwoot/list
    // =========================================================================
    listConfigs: igniter.query({
      name: 'ListConfigs',
      description: 'List all Chatwoot configurations for the organization',
      path: '/list',
      use: [authProcedure({ required: true }), chatwootProcedure()],
      handler: async ({ response, context }) => {
        // Business Rule: Get user's organization ID
        const organizationId = context.auth?.session?.user?.currentOrgId;
        if (!organizationId) {
          return response.unauthorized('Organização não encontrada');
        }

        // Business Logic: Get all configurations
        const configs = await context.features.chatwoot.repository.listConfigs(organizationId);

        // Response: Map to response format
        const baseUrl = getBaseUrl();
        const responseConfigs = configs.map(({ connectionId, config }) => ({
          connectionId,
          chatwoot_enabled: config.enabled,
          chatwoot_url: config.url,
          chatwoot_account_id: config.accountId,
          chatwoot_inbox_id: config.inboxId,
          chatwoot_inbox_webhook_url: context.features.chatwoot.repository.generateWebhookUrl(
            baseUrl,
            connectionId
          ),
        }));

        return response.success({
          configs: responseConfigs,
          total: responseConfigs.length,
        });
      },
    }),
  },
});
