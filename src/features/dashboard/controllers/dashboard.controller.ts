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
     */
    getMetrics: igniter.query({
      name: 'GetDashboardMetrics',
      description: 'Obter métricas do dashboard',
      path: '/metrics',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id;
        const organizationId = context.auth?.session?.user?.currentOrgId;

        if (!organizationId) {
          return response.badRequest('Nenhuma organização selecionada');
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

          // Obter métricas agregadas
          const metrics = await dashboardService.getAggregatedMetrics(connections);

          return response.success({
            data: metrics,
            instances: {
              total: connections.length,
              connected: connections.filter((i) => i.status === 'CONNECTED').length,
              disconnected: connections.filter((i) => i.status === 'DISCONNECTED').length,
            },
          });
        } catch (error: any) {
          console.error('Error fetching dashboard metrics:', error);
          return response.error(error.message || 'Erro ao buscar métricas');
        }
      },
    }),

    /**
     * GET /api/v1/dashboard/overview
     * Visão geral do sistema (sessões, mensagens, conversões)
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

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);

        const whereDate = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

        // Buscar estatísticas gerais
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

        return response.success({
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
        });
      },
    }),

    /**
     * GET /api/v1/dashboard/attendance
     * Métricas de atendimento (tempo de resposta, tempo médio, etc)
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

        return response.success({
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
        });
      },
    }),

    /**
     * GET /api/v1/dashboard/performance
     * Performance dos agentes/departamentos
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

        return response.success({
          data: {
            groupBy,
            items: performanceData,
            period: {
              startDate: startDate || 'all-time',
              endDate: endDate || 'now',
            },
          },
        });
      },
    }),

    /**
     * GET /api/v1/dashboard/conversations
     * Estatísticas de conversas (distribuição, tipos, etc)
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

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);

        const whereDate = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

        // Distribuição por status
        const sessionsByStatus = await database.chatSession.groupBy({
          by: ['status'],
          where: {
            organizationId: currentOrgId,
            ...whereDate,
          },
          _count: true,
        });

        // Distribuição por startedBy
        const sessionsByStarter = await database.chatSession.groupBy({
          by: ['startedBy'],
          where: {
            organizationId: currentOrgId,
            ...whereDate,
          },
          _count: true,
        });

        // Mensagens por tipo
        const messagesByType = await database.message.groupBy({
          by: ['type'],
          where: {
            connection: { organizationId: currentOrgId },
            ...whereDate,
          },
          _count: true,
        });

        // Mensagens por direction
        const messagesByDirection = await database.message.groupBy({
          by: ['direction'],
          where: {
            connection: { organizationId: currentOrgId },
            ...whereDate,
          },
          _count: true,
        });

        return response.success({
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
        });
      },
    }),
  },
});
