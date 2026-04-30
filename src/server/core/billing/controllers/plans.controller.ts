/**
 * Plans Controller - CRUD for billing plans
 *
 * - list & getBySlug are PUBLIC (no auth required)
 * - create & update are ADMIN only
 */

import { igniter } from '@/igniter';
import { billingRepository } from '../billing.repository';
import {
  createPlanSchema,
  updatePlanSchema,
} from '../billing.schemas';
import { UserRole, isSystemAdmin } from '@/lib/auth/roles';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { csrfProcedure } from '@/server/core/auth/procedures/csrf.procedure';

export const plansController = igniter.controller({
  name: 'plans',
  path: '/plans',
  actions: {
    // LIST all active plans (PUBLIC)
    list: igniter.query({
      path: '/',
      method: 'GET',
      use: [authProcedure({ required: false })],
      handler: async ({ response }) => {
        const plans = await billingRepository.findAllPlans();
        return response.success({ plans });
      },
    }),

    // GET plan by slug (PUBLIC)
    getBySlug: igniter.query({
      path: '/:slug' as const,
      method: 'GET',
      use: [authProcedure({ required: false })],
      handler: async ({ request, response }) => {
        const { slug } = request.params as { slug: string };

        const plan = await billingRepository.findPlanBySlug(slug);
        if (!plan) {
          return response.notFound('Plano não encontrado');
        }

        return response.success({ plan });
      },
    }),

    // CREATE plan (Admin only)
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: createPlanSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user || !isSystemAdmin(user.role as UserRole)) {
          return response.forbidden('Apenas administradores podem criar planos');
        }

        // Check slug uniqueness
        const existing = await billingRepository.findPlanBySlug(request.body.slug);
        if (existing) {
          return response.badRequest('Já existe um plano com este slug');
        }

        const plan = await billingRepository.createPlan(request.body);
        return response.created({ message: 'Plano criado', plan });
      },
    }),

    // UPDATE plan (Admin only)
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      body: updatePlanSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user || !isSystemAdmin(user.role as UserRole)) {
          return response.forbidden('Apenas administradores podem atualizar planos');
        }

        const { id } = request.params as { id: string };

        const existing = await billingRepository.findPlanById(id);
        if (!existing) {
          return response.notFound('Plano não encontrado');
        }

        // If changing slug, check uniqueness
        if (request.body.slug && request.body.slug !== existing.slug) {
          const slugTaken = await billingRepository.findPlanBySlug(request.body.slug);
          if (slugTaken) {
            return response.badRequest('Já existe um plano com este slug');
          }
        }

        const plan = await billingRepository.updatePlan(id, request.body);
        return response.success({ message: 'Plano atualizado', plan });
      },
    }),
  },
});
