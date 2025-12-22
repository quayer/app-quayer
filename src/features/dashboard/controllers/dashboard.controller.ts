/**
 * Dashboard Controller
 * API endpoints para métricas e analytics do dashboard
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { dashboardService } from '@/lib/api/dashboard.service';
import { database } from '@/services/database';

export const dashboardController = igniter.controller({
  name: 'dashboard',
  path: '/dashboard',
  description: 'Métricas e estatísticas do dashboard',
  actions: {
    /**
     * GET /api/v1/dashboard/metrics
     * Obter métricas agregadas de todas as instâncias da organização
     * Cache: 60 segundos por organização e período
     *
     * Query params:
     * - period: 'today' | 'week' | 'month' | 'all' (default: 'today')
     *
     * Response includes comparison with previous period:
     * - today vs yesterday
     * - week vs previous week
     * - month vs previous month
     */
    getMetrics: igniter.query({
      name: 'GetDashboardMetrics',
      description: 'Obter métricas do dashboard com filtro de período e comparativo',
      path: '/metrics',
      method: 'GET',
      query: z.object({
        period: z.enum(['today', 'week', 'month', 'all']).default('today'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id;
        const organizationId = context.auth?.session?.user?.currentOrgId;
        const { period } = request.query;

        if (!organizationId) {
          return response.badRequest('Nenhuma organização selecionada');
        }

        // Calculate date range based on period
        const now = new Date();
        let startDate: Date | undefined;
        let endDate: Date = now;
        let prevStartDate: Date | undefined;
        let prevEndDate: Date | undefined;

        switch (period) {
          case 'today':
            // Current: today (00:00 to now)
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            // Previous: yesterday (00:00 to 23:59:59)
            prevEndDate = new Date(startDate.getTime() - 1); // End of yesterday
            prevStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
            break;
          case 'week':
            // Current: last 7 days
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            // Previous: 7 days before that
            prevEndDate = new Date(startDate.getTime() - 1);
            prevStartDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            // Current: last 30 days
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            // Previous: 30 days before that
            prevEndDate = new Date(startDate.getTime() - 1);
            prevStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
            break;
          case 'all':
            startDate = undefined;
            // No comparison for "all time"
            prevStartDate = undefined;
            prevEndDate = undefined;
            break;
        }

        // 🚀 Cache: Check cache before expensive queries
        const cacheKey = `dashboard:metrics:${organizationId}:${period}:v2`;
        try {
          const cached = await igniter.store.get<any>(cacheKey);
          if (cached) {
            return response.success({ ...cached, source: 'cache' });
          }
        } catch (e) {
          // Cache miss - continue
        }

        try {
          // Buscar todas as conexões da organização
          const connections = await database.connection.findMany({
            where: {
              organizationId: organizationId,
            },
            select: {
              id: true,
              uazapiToken: true,
              status: true,
            },
          });

          // Fetch current and previous period metrics in parallel
          const [currentMetrics, previousMetrics] = await Promise.all([
            dashboardService.getAggregatedMetrics(connections, startDate, endDate),
            // Only fetch previous period if not "all"
            prevStartDate && prevEndDate
              ? dashboardService.getAggregatedMetrics(connections, prevStartDate, prevEndDate)
              : null,
          ]);

          // Calculate percentage changes
          const calculateChange = (current: number, previous: number | null): number | null => {
            if (previous === null || previous === 0) return current > 0 ? 100 : null;
            return Math.round(((current - previous) / previous) * 100);
          };

          const comparison = previousMetrics ? {
            // Conversations
            totalContacts: calculateChange(currentMetrics.conversations.total, previousMetrics.conversations.total),
            openChats: calculateChange(currentMetrics.conversations.inProgress, previousMetrics.conversations.inProgress),
            aiControlled: calculateChange(currentMetrics.conversations.aiControlled, previousMetrics.conversations.aiControlled),
            humanControlled: calculateChange(currentMetrics.conversations.humanControlled, previousMetrics.conversations.humanControlled),
            // Messages
            totalMessages: calculateChange(currentMetrics.messages.sent + currentMetrics.messages.delivered, previousMetrics.messages.sent + previousMetrics.messages.delivered),
            sentMessages: calculateChange(currentMetrics.messages.sent, previousMetrics.messages.sent),
            receivedMessages: calculateChange(currentMetrics.messages.delivered, previousMetrics.messages.delivered),
            deliveryRate: calculateChange(
              currentMetrics.messages.deliveryRate || 0,
              previousMetrics.messages.deliveryRate || 0
            ),
            previousPeriod: {
              startDate: prevStartDate?.toISOString(),
              endDate: prevEndDate?.toISOString(),
              data: {
                totalContacts: previousMetrics.conversations.total,
                openChats: previousMetrics.conversations.inProgress,
                totalMessages: previousMetrics.messages.sent + previousMetrics.messages.delivered,
                sentMessages: previousMetrics.messages.sent,
                aiControlled: previousMetrics.conversations.aiControlled,
                humanControlled: previousMetrics.conversations.humanControlled,
              },
            },
          } : null;

          const responseData = {
            data: currentMetrics,
            comparison,
            instances: {
              total: connections.length,
              connected: connections.filter((i) => i.status === 'CONNECTED').length,
              disconnected: connections.filter((i) => i.status === 'DISCONNECTED').length,
            },
            period: {
              type: period,
              startDate: startDate?.toISOString() || 'all-time',
              endDate: endDate.toISOString(),
            },
          };

          // 🚀 Cache: Store result with 60s TTL
          try {
            await igniter.store.set(cacheKey, responseData, { ttl: 60 });
          } catch (e) {
            // Cache error - not critical
          }

          return response.success(responseData);
        } catch (error: any) {
          console.error('Error fetching dashboard metrics:', error);
          return (response as any).error(error.message || 'Erro ao buscar métricas');
        }
      },
    }),

    /**
     * GET /api/v1/dashboard/overview
     * Visão geral do sistema (sessões, mensagens, conversões)
     * Cache: 60 segundos por organização e período
     */
    getOverview: igniter.query({
      path: '/overview',
      query: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { startDate, endDate } = request.query;
        const user = context.auth?.session?.user;
        const currentOrgId = user?.currentOrgId;

        if (!currentOrgId) {
          return response.badRequest('Nenhuma organização selecionada');
        }

        // 🚀 Cache: Check cache before expensive queries
        const cacheKey = `dashboard:overview:${currentOrgId}:${startDate || 'all'}:${endDate || 'now'}`;
        try {
          const cached = await igniter.store.get<any>(cacheKey);
          if (cached) {
            return response.success({ ...cached, source: 'cache' });
          }
        } catch (e) {
          // Cache miss - continue
        }

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);

        const whereDate = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

        // Buscar estatísticas gerais (já usa Promise.all)
        const [
          totalSessions,
          activeSessions,
          totalMessages,
          totalContacts,
          avgResponseTime,
        ] = await Promise.all([
          database.chatSession.count({
            where: { organizationId: currentOrgId, ...whereDate },
          }),
          database.chatSession.count({
            where: { organizationId: currentOrgId, status: { in: ['ACTIVE', 'QUEUED'] } },
          }),
          database.message.count({
            where: {
              connection: { organizationId: currentOrgId },
              ...whereDate,
            },
          }),
          database.contact.count({
            where: { organizationId: currentOrgId, ...whereDate },
          }),
          database.message.aggregate({
            where: {
              connection: { organizationId: currentOrgId },
              direction: 'OUTBOUND',
              sentAt: { not: null },
              ...whereDate,
            },
            _avg: {
              mediaSize: true,
            },
          }),
        ]);

        // Conversões (sessões fechadas)
        const closedSessions = await database.chatSession.count({
          where: {
            organizationId: currentOrgId,
            status: 'CLOSED',
            ...whereDate,
          },
        });

        const conversionRate = totalSessions > 0 ? (closedSessions / totalSessions) * 100 : 0;

        const responseData = {
          data: {
            sessions: {
              total: totalSessions,
              active: activeSessions,
              closed: closedSessions,
              conversionRate: conversionRate.toFixed(2) + '%',
            },
            messages: {
              total: totalMessages,
              averagePerSession: totalSessions > 0 ? (totalMessages / totalSessions).toFixed(1) : '0',
            },
            contacts: {
              total: totalContacts,
            },
            period: {
              startDate: startDate || 'all-time',
              endDate: endDate || 'now',
            },
          },
        };

        // 🚀 Cache: Store result with 60s TTL
        try {
          await igniter.store.set(cacheKey, responseData, { ttl: 60 });
        } catch (e) {
          // Cache error - not critical
        }

        return response.success(responseData);
      },
    }),

    /**
     * GET /api/v1/dashboard/attendance
     * Métricas de atendimento (tempo de resposta, tempo médio, etc)
     * Cache: 60 segundos por organização, período e departamento
     */
    getAttendance: igniter.query({
      path: '/attendance',
      query: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        departmentId: z.string().uuid().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { startDate, endDate, departmentId } = request.query;
        const user = context.auth?.session?.user;
        const currentOrgId = user?.currentOrgId;

        if (!currentOrgId) {
          return response.badRequest('Nenhuma organização selecionada');
        }

        // 🚀 Cache: Check cache before expensive queries
        const cacheKey = `dashboard:attendance:${currentOrgId}:${startDate || 'all'}:${endDate || 'now'}:${departmentId || 'all'}`;
        try {
          const cached = await igniter.store.get<any>(cacheKey);
          if (cached) {
            return response.success({ ...cached, source: 'cache' });
          }
        } catch (e) {
          // Cache miss - continue
        }

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);

        const whereDate = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
        const whereSession: any = { organizationId: currentOrgId, ...whereDate };

        if (departmentId) {
          whereSession.assignedDepartmentId = departmentId;
        }

        // Buscar sessões do período
        const sessions = await database.chatSession.findMany({
          where: whereSession,
          select: {
            id: true,
            status: true,
            createdAt: true,
            closedAt: true,
            messages: {
              select: {
                direction: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'asc' },
              take: 2,
            },
          },
        });

        // Calcular tempo médio de primeira resposta
        let totalFirstResponseTime = 0;
        let firstResponseCount = 0;

        sessions.forEach(session => {
          if (session.messages.length >= 2) {
            const firstInbound = session.messages.find(m => m.direction === 'INBOUND');
            const firstOutbound = session.messages.find(m => m.direction === 'OUTBOUND');

            if (firstInbound && firstOutbound) {
              const diff = firstOutbound.createdAt.getTime() - firstInbound.createdAt.getTime();
              totalFirstResponseTime += diff;
              firstResponseCount++;
            }
          }
        });

        const avgFirstResponse = firstResponseCount > 0
          ? Math.round(totalFirstResponseTime / firstResponseCount / 1000) // segundos
          : 0;

        // Calcular tempo médio de sessão
        const closedSessions = sessions.filter(s => s.closedAt);
        let totalSessionTime = 0;

        closedSessions.forEach(session => {
          if (session.closedAt) {
            const diff = session.closedAt.getTime() - session.createdAt.getTime();
            totalSessionTime += diff;
          }
        });

        const avgSessionTime = closedSessions.length > 0
          ? Math.round(totalSessionTime / closedSessions.length / 1000 / 60) // minutos
          : 0;

        const responseData = {
          data: {
            metrics: {
              totalSessions: sessions.length,
              activeSessions: sessions.filter(s => s.status === 'ACTIVE').length,
              queuedSessions: sessions.filter(s => s.status === 'QUEUED').length,
              closedSessions: closedSessions.length,
              averageFirstResponseTime: `${avgFirstResponse}s`,
              averageSessionDuration: `${avgSessionTime}min`,
            },
            period: {
              startDate: startDate || 'all-time',
              endDate: endDate || 'now',
            },
          },
        };

        // 🚀 Cache: Store result with 60s TTL
        try {
          await igniter.store.set(cacheKey, responseData, { ttl: 60 });
        } catch (e) {
          // Cache error - not critical
        }

        return response.success(responseData);
      },
    }),

    /**
     * GET /api/v1/dashboard/performance
     * Performance dos agentes/departamentos
     * Cache: 60 segundos por organização, período e agrupamento
     */
    getPerformance: igniter.query({
      path: '/performance',
      query: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        groupBy: z.enum(['department', 'agent', 'instance']).default('department'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { startDate, endDate, groupBy } = request.query;
        const user = context.auth?.session?.user;
        const currentOrgId = user?.currentOrgId;

        if (!currentOrgId) {
          return response.badRequest('Nenhuma organização selecionada');
        }

        // 🚀 Cache: Check cache before expensive queries
        const cacheKey = `dashboard:performance:${currentOrgId}:${startDate || 'all'}:${endDate || 'now'}:${groupBy}`;
        try {
          const cached = await igniter.store.get<any>(cacheKey);
          if (cached) {
            return response.success({ ...cached, source: 'cache' });
          }
        } catch (e) {
          // Cache miss - continue
        }

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);

        const whereDate = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

        let performanceData: any[] = [];

        if (groupBy === 'department') {
          // Performance por departamento
          const departments = await database.department.findMany({
            where: { organizationId: currentOrgId, isActive: true },
            include: {
              _count: {
                select: {
                  chatSessions: {
                    where: whereDate,
                  },
                },
              },
              chatSessions: {
                where: {
                  ...whereDate,
                  status: 'CLOSED',
                },
                select: {
                  id: true,
                  createdAt: true,
                  closedAt: true,
                },
              },
            },
          });

          performanceData = departments.map(dept => {
            const closedCount = dept.chatSessions.length;
            let totalTime = 0;

            dept.chatSessions.forEach(session => {
              if (session.closedAt) {
                totalTime += session.closedAt.getTime() - session.createdAt.getTime();
              }
            });

            const avgTime = closedCount > 0 ? Math.round(totalTime / closedCount / 1000 / 60) : 0;

            return {
              id: dept.id,
              name: dept.name,
              type: dept.type,
              totalSessions: dept._count.chatSessions,
              closedSessions: closedCount,
              averageResolutionTime: `${avgTime}min`,
            };
          });
        } else if (groupBy === 'instance') {
          // Performance por conexão
          const connections = await database.connection.findMany({
            where: { organizationId: currentOrgId },
            include: {
              _count: {
                select: {
                  chatSessions: {
                    where: whereDate,
                  },
                  messages: {
                    where: whereDate,
                  },
                },
              },
            },
          });

          performanceData = connections.map(conn => ({
            id: conn.id,
            name: conn.name,
            phoneNumber: conn.phoneNumber,
            status: conn.status,
            totalSessions: conn._count.chatSessions,
            totalMessages: conn._count.messages,
          }));
        }

        const responseData = {
          data: {
            groupBy,
            items: performanceData,
            period: {
              startDate: startDate || 'all-time',
              endDate: endDate || 'now',
            },
          },
        };

        // 🚀 Cache: Store result with 60s TTL
        try {
          await igniter.store.set(cacheKey, responseData, { ttl: 60 });
        } catch (e) {
          // Cache error - not critical
        }

        return response.success(responseData);
      },
    }),

    /**
     * GET /api/v1/dashboard/conversations
     * Estatísticas de conversas (distribuição, tipos, etc)
     * Cache: 60 segundos por organização e período
     */
    getConversations: igniter.query({
      path: '/conversations',
      query: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { startDate, endDate } = request.query;
        const user = context.auth?.session?.user;
        const currentOrgId = user?.currentOrgId;

        if (!currentOrgId) {
          return response.badRequest('Nenhuma organização selecionada');
        }

        // 🚀 Cache: Check cache before expensive queries
        const cacheKey = `dashboard:conversations:${currentOrgId}:${startDate || 'all'}:${endDate || 'now'}`;
        try {
          const cached = await igniter.store.get<any>(cacheKey);
          if (cached) {
            return response.success({ ...cached, source: 'cache' });
          }
        } catch (e) {
          // Cache miss - continue
        }

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);

        const whereDate = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

        // Execute all queries in parallel with Promise.all
        const [
          sessionsByStatus,
          sessionsByStarter,
          messagesByType,
          messagesByDirection,
        ] = await Promise.all([
          // Distribuição por status
          database.chatSession.groupBy({
            by: ['status'],
            where: {
              organizationId: currentOrgId,
              ...whereDate,
            },
            _count: true,
          }),
          // Distribuição por startedBy
          database.chatSession.groupBy({
            by: ['startedBy'],
            where: {
              organizationId: currentOrgId,
              ...whereDate,
            },
            _count: true,
          }),
          // Mensagens por tipo
          database.message.groupBy({
            by: ['type'],
            where: {
              connection: { organizationId: currentOrgId },
              ...whereDate,
            },
            _count: true,
          }),
          // Mensagens por direction
          database.message.groupBy({
            by: ['direction'],
            where: {
              connection: { organizationId: currentOrgId },
              ...whereDate,
            },
            _count: true,
          }),
        ]);

        const responseData = {
          data: {
            sessionsByStatus: sessionsByStatus.map(s => ({
              status: s.status,
              count: s._count,
            })),
            sessionsByStarter: sessionsByStarter.map(s => ({
              startedBy: s.startedBy,
              count: s._count,
            })),
            messagesByType: messagesByType.map(m => ({
              type: m.type,
              count: m._count,
            })),
            messagesByDirection: messagesByDirection.map(m => ({
              direction: m.direction,
              count: m._count,
            })),
            period: {
              startDate: startDate || 'all-time',
              endDate: endDate || 'now',
            },
          },
        };

        // 🚀 Cache: Store result with 60s TTL
        try {
          await igniter.store.set(cacheKey, responseData, { ttl: 60 });
        } catch (e) {
          // Cache error - not critical
        }

        return response.success(responseData);
      },
    }),
  },
});
