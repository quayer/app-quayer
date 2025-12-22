/**
 * Audit Controller
 *
 * Provides admin access to audit logs for compliance and security monitoring.
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure, adminProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

export const auditController = igniter.controller({
  name: 'audit',
  path: '/audit',
  description: 'Admin audit logs for compliance and security monitoring',

  actions: {
    /**
     * GET /api/audit
     * List audit logs with filtering (Admin only)
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
        action: z.string().optional(),
        resource: z.string().optional(),
        userId: z.string().uuid().optional(),
        organizationId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      use: [authProcedure({ required: true }), adminProcedure()],
      handler: async ({ request, response }) => {
        const { action, resource, userId, organizationId, startDate, endDate } = request.query;
        const page = request.query.page ?? 1;
        const limit = request.query.limit ?? 50;

        const where: any = {};

        if (action) where.action = action;
        if (resource) where.resource = resource;
        if (userId) where.userId = userId;
        if (organizationId) where.organizationId = organizationId;

        if (startDate || endDate) {
          where.createdAt = {};
          if (startDate) where.createdAt.gte = new Date(startDate);
          if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [logs, total] = await Promise.all([
          database.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              organization: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          }),
          database.auditLog.count({ where }),
        ]);

        return response.success({
          data: logs,
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
     * GET /api/audit/stats
     * Get audit log statistics (Admin only)
     */
    stats: igniter.query({
      path: '/stats',
      query: z.object({
        days: z.coerce.number().min(1).max(90).default(7),
      }),
      use: [authProcedure({ required: true }), adminProcedure()],
      handler: async ({ request, response }) => {
        const days = request.query.days ?? 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [totalLogs, byAction, byResource, byUser] = await Promise.all([
          database.auditLog.count({
            where: { createdAt: { gte: startDate } },
          }),
          database.auditLog.groupBy({
            by: ['action'],
            where: { createdAt: { gte: startDate } },
            _count: { action: true },
            orderBy: { _count: { action: 'desc' } },
            take: 10,
          }),
          database.auditLog.groupBy({
            by: ['resource'],
            where: { createdAt: { gte: startDate } },
            _count: { resource: true },
            orderBy: { _count: { resource: 'desc' } },
            take: 10,
          }),
          database.auditLog.groupBy({
            by: ['userId'],
            where: { createdAt: { gte: startDate } },
            _count: { userId: true },
            orderBy: { _count: { userId: 'desc' } },
            take: 5,
          }),
        ]);

        // Get user details for top users
        const userIds = byUser.map(u => u.userId);
        const users = await database.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        });

        const usersMap = new Map(users.map(u => [u.id, u]));

        return response.success({
          period: `${days} days`,
          total: totalLogs,
          byAction: byAction.map(a => ({
            action: a.action,
            count: a._count.action,
          })),
          byResource: byResource.map(r => ({
            resource: r.resource,
            count: r._count.resource,
          })),
          topUsers: byUser.map(u => ({
            user: usersMap.get(u.userId) || { id: u.userId, name: 'Unknown', email: '' },
            count: u._count.userId,
          })),
        });
      },
    }),

    /**
     * GET /api/audit/actions
     * Get list of unique actions (for filtering)
     */
    actions: igniter.query({
      path: '/actions',
      use: [authProcedure({ required: true }), adminProcedure()],
      handler: async ({ response }) => {
        const actions = await database.auditLog.findMany({
          select: { action: true },
          distinct: ['action'],
          orderBy: { action: 'asc' },
        });

        return response.success({
          data: actions.map(a => a.action),
        });
      },
    }),

    /**
     * GET /api/audit/resources
     * Get list of unique resources (for filtering)
     */
    resources: igniter.query({
      path: '/resources',
      use: [authProcedure({ required: true }), adminProcedure()],
      handler: async ({ response }) => {
        const resources = await database.auditLog.findMany({
          select: { resource: true },
          distinct: ['resource'],
          orderBy: { resource: 'asc' },
        });

        return response.success({
          data: resources.map(r => r.resource),
        });
      },
    }),
  },
});
