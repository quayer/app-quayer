/**
 * Webhooks Controller - CRUD + Delivery Management
 *
 * Corrigido para usar authProcedure padrão
 */

import { igniter } from '@/igniter';
import { webhooksRepository } from '../webhooks.repository';
import { webhooksService } from '../webhooks.service';
import { organizationsRepository } from '@/features/organizations/organizations.repository';
import {
  createWebhookSchema,
  updateWebhookSchema,
  listWebhooksSchema,
  listDeliveriesSchema,
} from '../webhooks.schemas';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';

export const webhooksController = igniter.controller({
  name: 'webhooks',
  path: '/webhooks',
  actions: {
    // CREATE
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: createWebhookSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { organizationId, ...webhookData } = request.body;

        // Check permission
        const isAdmin = user.role === 'admin';
        const orgRole = await organizationsRepository.getUserRole(organizationId, user.id);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para criar webhooks');
        }

        const webhook = await webhooksRepository.create({ ...webhookData, organizationId });
        return response.created({ message: 'Webhook criado', webhook });
      },
    }),

    // LIST
    list: igniter.query({
      path: '/',
      query: listWebhooksSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { organizationId, ...filters } = request.query;

        // Admin can see all
        if (user.role === 'admin') {
          const result = await webhooksRepository.list({ ...filters, organizationId });
          return response.success(result);
        }

        // Regular users need organizationId
        const targetOrgId = organizationId || user.currentOrgId;
        if (!targetOrgId) {
          return response.badRequest('organizationId é obrigatório');
        }

        // Check membership
        const isMember = await organizationsRepository.isMember(targetOrgId, user.id);
        if (!isMember) {
          return response.forbidden('Sem acesso aos webhooks desta organização');
        }

        const result = await webhooksRepository.list({ ...filters, organizationId: targetOrgId });
        return response.success(result);
      },
    }),

    // GET BY ID
    get: igniter.query({
      path: '/:id',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const webhook = await webhooksRepository.findById(id, true);
        if (!webhook) {
          return response.notFound('Webhook não encontrado');
        }

        // Check permission
        const isAdmin = user.role === 'admin';
        const isMember = await organizationsRepository.isMember(webhook.organizationId!, user.id);

        if (!isAdmin && !isMember) {
          return response.forbidden('Sem permissão para visualizar este webhook');
        }

        // Calculate success rate
        const successRate = await webhooksRepository.getSuccessRate(id);

        return response.success({
          webhook: {
            ...webhook,
            stats: {
              deliveriesCount: webhook._count?.deliveries || 0,
              successRate,
            },
          },
        });
      },
    }),

    // UPDATE
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      body: updateWebhookSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const webhook = await webhooksRepository.findById(id);
        if (!webhook) {
          return response.notFound('Webhook não encontrado');
        }

        // Check permission
        const isAdmin = user.role === 'admin';
        const orgRole = await organizationsRepository.getUserRole(webhook.organizationId!, user.id);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para atualizar webhooks');
        }

        const updated = await webhooksRepository.update(id, request.body);
        return response.success({ message: 'Webhook atualizado', webhook: updated });
      },
    }),

    // DELETE
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const webhook = await webhooksRepository.findById(id);
        if (!webhook) {
          return response.notFound('Webhook não encontrado');
        }

        // Check permission
        const isAdmin = user.role === 'admin';
        const orgRole = await organizationsRepository.getUserRole(webhook.organizationId!, user.id);

        if (!isAdmin && orgRole !== 'master') {
          return response.forbidden('Apenas admins ou masters podem deletar webhooks');
        }

        await webhooksRepository.softDelete(id);
        return response.success({ message: 'Webhook desativado' });
      },
    }),

    // LIST DELIVERIES
    listDeliveries: igniter.query({
      path: '/:id/deliveries',
      query: listDeliveriesSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const webhook = await webhooksRepository.findById(id);
        if (!webhook) {
          return response.notFound('Webhook não encontrado');
        }

        // Check permission
        const isAdmin = user.role === 'admin';
        const isMember = await organizationsRepository.isMember(webhook.organizationId!, user.id);

        if (!isAdmin && !isMember) {
          return response.forbidden('Sem permissão');
        }

        const result = await webhooksRepository.listDeliveries({
          ...request.query,
          webhookId: id,
        });

        return response.success(result);
      },
    }),

    // RETRY DELIVERY
    retryDelivery: igniter.mutation({
      path: '/deliveries/:deliveryId/retry',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { deliveryId } = request.params as { deliveryId: string };

        const delivery = await webhooksRepository.getDeliveryById(deliveryId);
        if (!delivery || !delivery.webhook) {
          return response.notFound('Delivery não encontrado');
        }

        // Check permission
        const isAdmin = user.role === 'admin';
        const orgRole = await organizationsRepository.getUserRole(
          delivery.webhook.organizationId!,
          user.id
        );

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para retentar deliveries');
        }

        const success = await webhooksService.retry(deliveryId);

        if (success) {
          return response.success({ message: 'Delivery retentado com sucesso' });
        } else {
          return response.badRequest('Falha ao retentar delivery');
        }
      },
    }),
  },
});
