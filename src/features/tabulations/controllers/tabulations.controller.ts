/**
 * Tabulations Controller
 * ⭐ CRÍTICO - Inspirado em falecomigo.ai
 *
 * Gerenciamento de tabulações (tags/labels) para categorização
 * - CRUD de tabulações
 * - Vinculação com integrações
 * - Configurações de automação (webhooks)
 * - Integração com catálogos
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

export const tabulationsController = igniter.controller({
  name: 'tabulations',
  description: 'Gerenciamento de tabulações (tags/labels)',

  actions: {
    /**
     * GET /tabulations
     * Lista todas as tabulações da organização
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        includeIntegrations: z.coerce.boolean().default(false),
        includeSettings: z.coerce.boolean().default(false),
        includeCatalogInfo: z.coerce.boolean().default(true),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { currentOrgId } = context.user;
        const { includeIntegrations, includeSettings, includeCatalogInfo } = context.query;

        const tabulations = await database.tabulation.findMany({
          where: {
            organizationId: currentOrgId,
          },
          orderBy: { createdAt: 'desc' },
          include: {
            ...(includeIntegrations && {
              tabulationIntegrations: {
                include: {
                  instance: {
                    select: {
                      id: true,
                      name: true,
                      phoneNumber: true,
                      brokerType: true,
                    },
                  },
                },
              },
            }),
            ...(includeSettings && {
              tabulationSettings: true,
            }),
            sessionTabulations: {
              select: {
                sessionId: true,
              },
            },
          },
        });

        // Formatar resposta igual falecomigo.ai
        const formattedData = tabulations.map((tab) => ({
          id: tab.id,
          name: tab.name,
          description: tab.description,
          backgroundColor: tab.backgroundColor,
          labelId: tab.labelId || 'NaN',
          autoTabulation: tab.autoTabulation,
          createdAt: tab.createdAt,
          updatedAt: tab.updatedAt,
          organizationId: tab.organizationId,
          ...(includeIntegrations && {
            tabulationsIntegrations: tab.tabulationIntegrations?.map((ti) => ({
              id: ti.id,
              integrationId: ti.instanceId,
              tabulationId: ti.tabulationId,
              externalId: ti.externalId,
              createdAt: ti.createdAt,
              updatedAt: ti.updatedAt,
              integration: ti.instance
                ? {
                    id: ti.instance.id,
                    name: ti.instance.name,
                    settings: {
                      phoneNumber: ti.instance.phoneNumber,
                      integration: ti.instance.brokerType,
                    },
                  }
                : null,
            })),
          }),
          sessionsTabulations: tab.sessionTabulations || [],
          ...(includeSettings && {
            tabulationSettings: tab.tabulationSettings || [],
          }),
          ...(includeCatalogInfo && {
            catalogInfo: {
              isFromCatalog: false,
              catalogId: null,
              catalogName: null,
              catalogDescription: null,
              orderStatusId: null,
              orderStatusName: null,
              orderStatusColor: null,
            },
          }),
        }));

        return response.success(formattedData);
      },
    }),

    /**
     * GET /tabulations/:id
     * Buscar tabulação por ID com detalhes completos
     */
    getById: igniter.query({
      path: '/:id',
      params: z.object({
        id: z.string().uuid('ID da tabulação inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;

        const tabulation = await database.tabulation.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
          include: {
            tabulationIntegrations: {
              include: {
                instance: {
                  select: {
                    id: true,
                    name: true,
                    phoneNumber: true,
                    brokerType: true,
                  },
                },
              },
            },
            tabulationSettings: true,
            sessionTabulations: {
              select: {
                sessionId: true,
              },
            },
            _count: {
              select: {
                sessionTabulations: true,
                contactTabulations: true,
              },
            },
          },
        });

        if (!tabulation) {
          return response.notFound({
            message: 'Tabulação não encontrada',
          });
        }

        return response.success({
          id: tabulation.id,
          name: tabulation.name,
          description: tabulation.description,
          backgroundColor: tabulation.backgroundColor,
          labelId: tabulation.labelId || 'NaN',
          autoTabulation: tabulation.autoTabulation,
          createdAt: tabulation.createdAt,
          updatedAt: tabulation.updatedAt,
          organizationId: tabulation.organizationId,
          tabulationsIntegrations: tabulation.tabulationIntegrations,
          sessionsTabulations: tabulation.sessionTabulations,
          tabulationSettings: tabulation.tabulationSettings,
          usage: {
            sessions: tabulation._count.sessionTabulations,
            contacts: tabulation._count.contactTabulations,
          },
        });
      },
    }),

    /**
     * POST /tabulations
     * Criar nova tabulação
     */
    create: igniter.mutation({
      path: '/',
      body: z.object({
        name: z.string().min(1, 'Nome é obrigatório'),
        description: z.string().default(''),
        backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida').default('#ffffff'),
        labelId: z.string().optional(),
        autoTabulation: z.boolean().default(false),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { currentOrgId } = context.user;
        const data = context.body;

        // Verificar se já existe tabulação com mesmo nome
        const existing = await database.tabulation.findFirst({
          where: {
            name: data.name,
            organizationId: currentOrgId,
          },
        });

        if (existing) {
          return response.badRequest({
            message: 'Já existe uma tabulação com este nome',
          });
        }

        // Criar tabulação
        const tabulation = await database.tabulation.create({
          data: {
            name: data.name,
            description: data.description,
            backgroundColor: data.backgroundColor,
            labelId: data.labelId || 'NaN',
            autoTabulation: data.autoTabulation,
            organizationId: currentOrgId,
          },
        });

        return response.success({
          id: tabulation.id,
          name: tabulation.name,
          description: tabulation.description,
          backgroundColor: tabulation.backgroundColor,
          labelId: tabulation.labelId,
          autoTabulation: tabulation.autoTabulation,
          createdAt: tabulation.createdAt,
          updatedAt: tabulation.updatedAt,
          organizationId: tabulation.organizationId,
        });
      },
    }),

    /**
     * PATCH /tabulations/:id
     * Atualizar tabulação
     */
    update: igniter.mutation({
      path: '/:id',
      params: z.object({
        id: z.string().uuid('ID da tabulação inválido'),
      }),
      body: z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida').optional(),
        autoTabulation: z.boolean().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;
        const data = context.body;

        // Verificar se tabulação existe e pertence à organização
        const tabulation = await database.tabulation.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!tabulation) {
          return response.notFound({
            message: 'Tabulação não encontrada',
          });
        }

        // Se alterando nome, verificar duplicata
        if (data.name && data.name !== tabulation.name) {
          const existing = await database.tabulation.findFirst({
            where: {
              name: data.name,
              organizationId: currentOrgId,
              id: { not: id },
            },
          });

          if (existing) {
            return response.badRequest({
              message: 'Já existe uma tabulação com este nome',
            });
          }
        }

        // Atualizar
        const updated = await database.tabulation.update({
          where: { id },
          data,
        });

        return response.success({
          id: updated.id,
          name: updated.name,
          description: updated.description,
          backgroundColor: updated.backgroundColor,
          labelId: updated.labelId,
          autoTabulation: updated.autoTabulation,
          updatedAt: updated.updatedAt,
        });
      },
    }),

    /**
     * DELETE /tabulations/:id
     * Deletar tabulação
     */
    delete: igniter.mutation({
      path: '/:id',
      params: z.object({
        id: z.string().uuid('ID da tabulação inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { currentOrgId } = context.user;

        // Verificar se tabulação existe
        const tabulation = await database.tabulation.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
          include: {
            _count: {
              select: {
                sessionTabulations: true,
                contactTabulations: true,
              },
            },
          },
        });

        if (!tabulation) {
          return response.notFound({
            message: 'Tabulação não encontrada',
          });
        }

        // Verificar se está em uso
        const inUse = tabulation._count.sessionTabulations > 0 || tabulation._count.contactTabulations > 0;

        if (inUse) {
          return response.badRequest({
            message: `Não é possível deletar. Tabulação está em uso por ${tabulation._count.sessionTabulations} sessões e ${tabulation._count.contactTabulations} contatos`,
          });
        }

        // Deletar relacionamentos primeiro
        await database.$transaction([
          database.tabulationIntegration.deleteMany({
            where: { tabulationId: id },
          }),
          database.tabulationSetting.deleteMany({
            where: { tabulationId: id },
          }),
          database.tabulation.delete({
            where: { id },
          }),
        ]);

        return response.success({
          message: 'Tabulação deletada com sucesso',
        });
      },
    }),

    /**
     * POST /tabulations/:id/integrations
     * Vincular tabulação a integrações (instâncias WhatsApp)
     */
    attachIntegrations: igniter.mutation({
      path: '/:id/integrations',
      params: z.object({
        id: z.string().uuid('ID da tabulação inválido'),
      }),
      body: z.object({
        integrationIds: z.array(z.string().uuid()).min(1, 'Informe pelo menos uma integração'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { integrationIds } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se tabulação existe
        const tabulation = await database.tabulation.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!tabulation) {
          return response.notFound({
            message: 'Tabulação não encontrada',
          });
        }

        // Verificar se integrações existem e pertencem à organização
        const instances = await database.instance.findMany({
          where: {
            id: { in: integrationIds },
            organizationId: currentOrgId,
          },
        });

        if (instances.length !== integrationIds.length) {
          return response.badRequest({
            message: 'Uma ou mais integrações não foram encontradas',
          });
        }

        // Vincular integrações
        await database.tabulationIntegration.createMany({
          data: integrationIds.map((instanceId) => ({
            tabulationId: id,
            instanceId,
          })),
          skipDuplicates: true,
        });

        return response.success({
          message: 'Integrações vinculadas com sucesso',
        });
      },
    }),

    /**
     * DELETE /tabulations/:id/integrations
     * Desvincular integrações
     */
    detachIntegrations: igniter.mutation({
      path: '/:id/integrations',
      params: z.object({
        id: z.string().uuid('ID da tabulação inválido'),
      }),
      body: z.object({
        integrationIds: z.array(z.string().uuid()).min(1, 'Informe pelo menos uma integração'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { id } = context.params;
        const { integrationIds } = context.body;
        const { currentOrgId } = context.user;

        // Verificar se tabulação existe
        const tabulation = await database.tabulation.findFirst({
          where: {
            id,
            organizationId: currentOrgId,
          },
        });

        if (!tabulation) {
          return response.notFound({
            message: 'Tabulação não encontrada',
          });
        }

        // Desvincular
        await database.tabulationIntegration.deleteMany({
          where: {
            tabulationId: id,
            instanceId: { in: integrationIds },
          },
        });

        return response.success({
          message: 'Integrações desvinculadas com sucesso',
        });
      },
    }),
  },
});
