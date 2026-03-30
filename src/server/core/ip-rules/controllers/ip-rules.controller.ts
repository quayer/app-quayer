/**
 * IP Rules Controller
 *
 * CRUD + check for IP allow/block rules.
 * All actions require admin authentication.
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure, adminProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { csrfProcedure } from '@/server/core/auth/procedures/csrf.procedure';
import { database } from '@/server/services/database';

const ipv4Regex = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

const createIpRuleSchema = z.object({
  ipAddress: z.string().regex(ipv4Regex, 'Formato de IPv4 inválido'),
  type: z.enum(['ALLOW', 'BLOCK']),
  description: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  expiresAt: z.coerce.date().optional(),
});

const updateIpRuleSchema = z.object({
  isActive: z.boolean().optional(),
  description: z.string().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const ipRulesController = igniter.controller({
  name: 'ipRules',
  path: '/ip-rules',
  description: 'CRUD and check for IP allow/block rules (admin only)',

  actions: {
    /**
     * GET /api/v1/ip-rules
     * List IP rules with optional filtering by type and organizationId
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        type: z.enum(['ALLOW', 'BLOCK']).optional(),
        organizationId: z.string().uuid().optional(),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
      }),
      use: [authProcedure({ required: true }), adminProcedure()],
      handler: async ({ request, response }) => {
        const { type, organizationId } = request.query;
        const page = request.query.page ?? 1;
        const limit = request.query.limit ?? 50;

        const where: Record<string, unknown> = {};
        if (type) where.type = type;
        if (organizationId) where.organizationId = organizationId;

        const [rules, total] = await Promise.all([
          database.ipRule.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: {
              organization: {
                select: { id: true, name: true },
              },
              createdBy: {
                select: { id: true, name: true, email: true },
              },
            },
          }),
          database.ipRule.count({ where }),
        ]);

        return response.success({
          data: rules,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      },
    }),

    /**
     * POST /api/v1/ip-rules
     * Create a new IP rule
     */
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: createIpRuleSchema,
      use: [authProcedure({ required: true }), adminProcedure(), csrfProcedure()],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id;
        if (!userId) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { ipAddress, type, description, organizationId, expiresAt } = request.body;

        const rule = await database.ipRule.create({
          data: {
            ipAddress,
            type,
            description,
            organizationId,
            expiresAt,
            createdById: userId,
          },
          include: {
            organization: {
              select: { id: true, name: true },
            },
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        return response.created({ message: 'Regra de IP criada', rule });
      },
    }),

    /**
     * PUT /api/v1/ip-rules/:id
     * Update an existing IP rule (isActive, description, expiresAt)
     */
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      body: updateIpRuleSchema,
      use: [authProcedure({ required: true }), adminProcedure(), csrfProcedure()],
      handler: async ({ request, response }) => {
        const { id } = request.params as { id: string };

        const existing = await database.ipRule.findUnique({ where: { id } });
        if (!existing) {
          return response.notFound('Regra de IP não encontrada');
        }

        const rule = await database.ipRule.update({
          where: { id },
          data: request.body,
          include: {
            organization: {
              select: { id: true, name: true },
            },
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        return response.success({ message: 'Regra de IP atualizada', rule });
      },
    }),

    /**
     * DELETE /api/v1/ip-rules/:id
     * Delete an IP rule by id
     */
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      use: [authProcedure({ required: true }), adminProcedure(), csrfProcedure()],
      handler: async ({ request, response }) => {
        const { id } = request.params as { id: string };

        const existing = await database.ipRule.findUnique({ where: { id } });
        if (!existing) {
          return response.notFound('Regra de IP não encontrada');
        }

        await database.ipRule.delete({ where: { id } });

        return response.success({ message: 'Regra de IP removida' });
      },
    }),

    /**
     * GET /api/v1/ip-rules/check/:ipAddress
     * Check if an IP is blocked or allowed
     */
    check: igniter.query({
      path: '/check/:ipAddress',
      use: [authProcedure({ required: true }), adminProcedure()],
      handler: async ({ request, response }) => {
        const { ipAddress } = request.params as { ipAddress: string };

        if (!ipv4Regex.test(ipAddress)) {
          return response.badRequest('Formato de IPv4 inválido');
        }

        const now = new Date();

        const rules = await database.ipRule.findMany({
          where: {
            ipAddress,
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        const blockRule = rules.find(r => r.type === 'BLOCK');
        const allowRule = rules.find(r => r.type === 'ALLOW');

        let status: 'BLOCKED' | 'ALLOWED' | 'NO_RULE' = 'NO_RULE';
        if (blockRule) {
          status = 'BLOCKED';
        } else if (allowRule) {
          status = 'ALLOWED';
        }

        return response.success({
          ipAddress,
          status,
          rules: rules.map(r => ({
            id: r.id,
            type: r.type,
            isActive: r.isActive,
            expiresAt: r.expiresAt,
            description: r.description,
          })),
        });
      },
    }),
  },
});
