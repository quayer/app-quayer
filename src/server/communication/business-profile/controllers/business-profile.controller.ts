/**
 * Business Profile Controller (F5-006)
 *
 * Gerenciamento do perfil comercial WhatsApp e configurações de comércio.
 * - BUSINESS_PROFILE capability: UZAPI + CloudAPI
 * - CATALOG capability (commerce settings): UZAPI + CloudAPI
 */

import { igniter } from '@/igniter';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { database } from '@/server/services/database';
import { z } from 'zod';
import { orchestrator } from '@/lib/providers';
import { ProviderCapability } from '@/lib/providers/core/provider.types';
import type { BrokerType } from '@/lib/providers/core/provider.types';
import { assertCapability } from '@/lib/providers/core/capability-helpers';
import type { IBusinessCapability, ICatalogCapability } from '@/lib/providers/core/capabilities';
import type { Provider } from '@prisma/client';

// ==================== SCHEMAS ====================

const connectionIdQuery = z.object({
  connectionId: z.string().min(1, 'connectionId é obrigatório'),
});

const updateBusinessProfileSchema = z.object({
  connectionId: z.string().min(1, 'connectionId é obrigatório'),
  description: z.string().max(512).optional(),
  address: z.string().max(256).optional(),
  email: z.string().email('E-mail inválido').optional(),
  websites: z.array(z.string().url('URL inválida')).max(2).optional(),
  profilePictureUrl: z.string().url('URL inválida').optional(),
  vertical: z.string().optional(),
  about: z.string().max(139).optional(),
});

const updateCommerceSettingsSchema = z.object({
  connectionId: z.string().min(1, 'connectionId é obrigatório'),
  isCatalogVisible: z.boolean(),
  isCartEnabled: z.boolean(),
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

export const businessProfileController = igniter.controller({
  name: 'businessProfile',
  path: '/business-profile',
  actions: {
    // ==================== GET PROFILE ====================
    get: igniter.query({
      name: 'GetBusinessProfile',
      description: 'Obter perfil comercial da instância WhatsApp',
      path: '/',
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
        if (!connection) return response.notFound('Conexão não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const businessProvider = assertCapability<IBusinessCapability>(
            provider,
            ProviderCapability.BUSINESS_PROFILE,
          );

          const instanceId = resolveInstanceId(connection, brokerType);
          const profile = await businessProvider.getBusinessProfile(instanceId);

          return response.success({ data: profile });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta perfil comercial`,
            );
          }
          console.error('[BusinessProfile] Erro ao obter perfil:', err);
          throw error;
        }
      },
    }),

    // ==================== UPDATE PROFILE ====================
    update: igniter.mutation({
      name: 'UpdateBusinessProfile',
      description: 'Atualizar perfil comercial da instância WhatsApp',
      path: '/',
      method: 'PUT',
      use: [authProcedure({ required: true })],
      body: updateBusinessProfileSchema,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const {
          connectionId,
          description,
          address,
          email,
          websites,
          profilePictureUrl,
          vertical,
          about,
        } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Conexão não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const businessProvider = assertCapability<IBusinessCapability>(
            provider,
            ProviderCapability.BUSINESS_PROFILE,
          );

          const instanceId = resolveInstanceId(connection, brokerType);

          await businessProvider.updateBusinessProfile(instanceId, {
            description,
            address,
            email,
            websites,
            profilePictureUrl,
            vertical,
            about,
          });

          return response.success({ message: 'Perfil comercial atualizado com sucesso' });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta perfil comercial`,
            );
          }
          console.error('[BusinessProfile] Erro ao atualizar perfil:', err);
          throw error;
        }
      },
    }),

    // ==================== GET COMMERCE SETTINGS ====================
    getCommerceSettings: igniter.query({
      name: 'GetCommerceSettings',
      description: 'Obter configurações de comércio (catálogo e carrinho)',
      path: '/commerce',
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
        if (!connection) return response.notFound('Conexão não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const catalogProvider = assertCapability<ICatalogCapability>(
            provider,
            ProviderCapability.CATALOG,
          );

          if (typeof catalogProvider.getCommerceSettings !== 'function') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta configurações de comércio`,
            );
          }

          const instanceId = resolveInstanceId(connection, brokerType);
          const settings = await catalogProvider.getCommerceSettings(instanceId);

          return response.success({ data: settings });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta catálogo/comércio`,
            );
          }
          console.error('[BusinessProfile] Erro ao obter configurações de comércio:', err);
          throw error;
        }
      },
    }),

    // ==================== UPDATE COMMERCE SETTINGS ====================
    updateCommerceSettings: igniter.mutation({
      name: 'UpdateCommerceSettings',
      description: 'Atualizar configurações de comércio (visibilidade do catálogo e carrinho)',
      path: '/commerce',
      method: 'PUT',
      use: [authProcedure({ required: true })],
      body: updateCommerceSettingsSchema,
      handler: async ({ request, response, context }) => {
        const orgId = context.auth?.session?.user?.currentOrgId;
        if (!orgId) return response.unauthorized('Organização não identificada');

        const { connectionId, isCatalogVisible, isCartEnabled } = request.body;

        const connection = await database.connection.findFirst({
          where: { id: connectionId, organizationId: orgId },
        });
        if (!connection) return response.notFound('Conexão não encontrada');

        const brokerType = resolveBrokerType(connection.provider);

        try {
          const provider = orchestrator['providers'].get(brokerType);
          if (!provider) {
            return response.badRequest(`Provider "${brokerType}" não está disponível`);
          }

          const catalogProvider = assertCapability<ICatalogCapability>(
            provider,
            ProviderCapability.CATALOG,
          );

          if (typeof catalogProvider.updateCommerceSettings !== 'function') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta configurações de comércio`,
            );
          }

          const instanceId = resolveInstanceId(connection, brokerType);
          await catalogProvider.updateCommerceSettings(instanceId, {
            isCatalogVisible,
            isCartEnabled,
          });

          return response.success({
            message: 'Configurações de comércio atualizadas com sucesso',
            data: { isCatalogVisible, isCartEnabled },
          });
        } catch (error) {
          const err = error as Error;
          if (err.name === 'ProviderCapabilityError') {
            return response.badRequest(
              `O provider "${brokerType}" não suporta catálogo/comércio`,
            );
          }
          console.error('[BusinessProfile] Erro ao atualizar configurações de comércio:', err);
          throw error;
        }
      },
    }),
  },
});
