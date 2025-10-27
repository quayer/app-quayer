/**
 * Groups Controller
 *
 * Gerencia grupos WhatsApp (criar, listar, adicionar membros, etc)
 * Integração com UAZ API via uazService
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { uazService } from '@/lib/uaz/uaz.service';
import { database } from '@/services/database';

/**
 * Validação: número de telefone WhatsApp
 */
const phoneNumberSchema = z
  .string()
  .min(10, 'Número de telefone inválido')
  .regex(/^\d+$/, 'Número deve conter apenas dígitos')
  .transform((phone) => {
    // Normalizar para formato WhatsApp JID
    return phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  });

/**
 * Validação: grupo JID
 */
const groupJidSchema = z
  .string()
  .min(1, 'Group JID é obrigatório')
  .refine((jid) => jid.includes('@g.us') || jid.includes('@s.whatsapp.net'), {
    message: 'JID de grupo inválido',
  });

/**
 * Groups Controller
 */
export const groupsController = igniter.controller({
  name: 'groups',
  actions: {
    /**
     * GET /groups
     * Lista todos os grupos de uma instância
     */
    list: igniter.query({
      path: '/',
      query: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
        search: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(50).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { instanceId, search, limit } = context.query;
        const { currentOrgId } = context.user;

        // 1. Verificar se instância pertence à organização
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        if (!instance.uazToken) {
          return response.badRequest({
            message: 'Instância não possui token UAZ configurado',
          });
        }

        // 2. Buscar grupos na UAZ API
        try {
          const groups = await uazService.listGroups(instance.uazToken);

          // 3. Filtrar por busca se fornecido
          let filteredGroups = groups;
          if (search) {
            const searchLower = search.toLowerCase();
            filteredGroups = groups.filter(
              (group) =>
                group.subject?.toLowerCase().includes(searchLower) ||
                group.id?.includes(search)
            );
          }

          // 4. Limitar resultados
          if (limit) {
            filteredGroups = filteredGroups.slice(0, limit);
          }

          return response.success({
            groups: filteredGroups,
            total: filteredGroups.length,
            instanceId: instance.id,
            instanceName: instance.name,
          });
        } catch (error) {
          console.error('[GroupsController] Erro ao listar grupos:', error);
          return response.error('Erro ao buscar grupos na UAZ API', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * POST /groups
     * Cria novo grupo WhatsApp
     */
    create: igniter.mutation({
      path: '/',
      body: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
        subject: z.string().min(1, 'Nome do grupo é obrigatório').max(100),
        description: z.string().max(500).optional(),
        participants: z
          .array(phoneNumberSchema)
          .min(1, 'Pelo menos 1 participante é necessário')
          .max(256, 'Máximo 256 participantes'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { instanceId, subject, description, participants } = context.body;
        const { currentOrgId } = context.user;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada ou sem token UAZ',
          });
        }

        // 2. Criar grupo na UAZ API
        try {
          const group = await uazService.createGroup(instance.uazToken, {
            subject,
            participants,
            description,
          });

          return response.success({
            message: 'Grupo criado com sucesso',
            group,
          });
        } catch (error) {
          console.error('[GroupsController] Erro ao criar grupo:', error);
          return response.error('Erro ao criar grupo', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * GET /groups/:groupJid
     * Busca informações detalhadas do grupo
     */
    getById: igniter.query({
      path: '/:groupJid',
      params: z.object({
        groupJid: groupJidSchema,
      }),
      query: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid } = context.params;
        const { instanceId } = context.query;
        const { currentOrgId } = context.user;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Buscar info do grupo
        try {
          const groupInfo = await uazService.getGroupInfo(
            instance.uazToken,
            groupJid
          );

          return response.success(groupInfo);
        } catch (error) {
          console.error('[GroupsController] Erro ao buscar grupo:', error);
          return response.error('Erro ao buscar informações do grupo', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * POST /groups/:groupJid/participants
     * Adiciona participantes ao grupo
     */
    addParticipants: igniter.mutation({
      path: '/:groupJid/participants',
      params: z.object({
        groupJid: groupJidSchema,
      }),
      body: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
        participants: z
          .array(phoneNumberSchema)
          .min(1, 'Pelo menos 1 participante é necessário')
          .max(50, 'Máximo 50 participantes por vez'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid } = context.params;
        const { instanceId, participants } = context.body;
        const { currentOrgId } = context.user;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Adicionar participantes
        try {
          const result = await uazService.updateGroupParticipants(
            instance.uazToken,
            groupJid,
            {
              action: 'add',
              participants,
            }
          );

          return response.success({
            message: 'Participantes adicionados com sucesso',
            result,
          });
        } catch (error) {
          console.error(
            '[GroupsController] Erro ao adicionar participantes:',
            error
          );
          return response.error('Erro ao adicionar participantes', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * DELETE /groups/:groupJid/participants/:participantPhone
     * Remove participante do grupo
     */
    removeParticipant: igniter.mutation({
      path: '/:groupJid/participants/:participantPhone',
      params: z.object({
        groupJid: groupJidSchema,
        participantPhone: z.string().min(10, 'Telefone inválido'),
      }),
      query: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid, participantPhone } = context.params;
        const { instanceId } = context.query;
        const { currentOrgId } = context.user;

        // Normalizar telefone
        const participantJid = participantPhone.includes('@')
          ? participantPhone
          : `${participantPhone}@s.whatsapp.net`;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Remover participante
        try {
          const result = await uazService.updateGroupParticipants(
            instance.uazToken,
            groupJid,
            {
              action: 'remove',
              participants: [participantJid],
            }
          );

          return response.success({
            message: 'Participante removido com sucesso',
            result,
          });
        } catch (error) {
          console.error(
            '[GroupsController] Erro ao remover participante:',
            error
          );
          return response.error('Erro ao remover participante', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * PATCH /groups/:groupJid/participants/:participantPhone/promote
     * Promover participante a admin
     */
    promoteParticipant: igniter.mutation({
      path: '/:groupJid/participants/:participantPhone/promote',
      params: z.object({
        groupJid: groupJidSchema,
        participantPhone: z.string().min(10, 'Telefone inválido'),
      }),
      query: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid, participantPhone } = context.params;
        const { instanceId } = context.query;
        const { currentOrgId } = context.user;

        // Normalizar telefone
        const participantJid = participantPhone.includes('@')
          ? participantPhone
          : `${participantPhone}@s.whatsapp.net`;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Promover participante
        try {
          const result = await uazService.updateGroupParticipants(
            instance.uazToken,
            groupJid,
            {
              action: 'promote',
              participants: [participantJid],
            }
          );

          return response.success({
            message: 'Participante promovido a admin',
            result,
          });
        } catch (error) {
          console.error(
            '[GroupsController] Erro ao promover participante:',
            error
          );
          return response.error('Erro ao promover participante', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * PATCH /groups/:groupJid/participants/:participantPhone/demote
     * Remover admin de participante
     */
    demoteParticipant: igniter.mutation({
      path: '/:groupJid/participants/:participantPhone/demote',
      params: z.object({
        groupJid: groupJidSchema,
        participantPhone: z.string().min(10, 'Telefone inválido'),
      }),
      query: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid, participantPhone } = context.params;
        const { instanceId } = context.query;
        const { currentOrgId } = context.user;

        // Normalizar telefone
        const participantJid = participantPhone.includes('@')
          ? participantPhone
          : `${participantPhone}@s.whatsapp.net`;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Remover admin
        try {
          const result = await uazService.updateGroupParticipants(
            instance.uazToken,
            groupJid,
            {
              action: 'demote',
              participants: [participantJid],
            }
          );

          return response.success({
            message: 'Admin removido do participante',
            result,
          });
        } catch (error) {
          console.error('[GroupsController] Erro ao remover admin:', error);
          return response.error('Erro ao remover admin', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * PUT /groups/:groupJid
     * Atualiza informações do grupo (nome, descrição, foto)
     */
    update: igniter.mutation({
      path: '/:groupJid',
      params: z.object({
        groupJid: groupJidSchema,
      }),
      body: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
        subject: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        imageUrl: z.string().url().optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid } = context.params;
        const { instanceId, subject, description, imageUrl } = context.body;
        const { currentOrgId } = context.user;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Atualizar informações
        try {
          const results: any = {};

          // Atualizar nome
          if (subject) {
            results.name = await uazService.updateGroupName(
              instance.uazToken,
              groupJid,
              subject
            );
          }

          // Atualizar descrição
          if (description) {
            results.description = await uazService.updateGroupDescription(
              instance.uazToken,
              groupJid,
              description
            );
          }

          // Atualizar foto
          if (imageUrl) {
            results.image = await uazService.updateGroupImage(
              instance.uazToken,
              groupJid,
              imageUrl
            );
          }

          return response.success({
            message: 'Grupo atualizado com sucesso',
            updated: results,
          });
        } catch (error) {
          console.error('[GroupsController] Erro ao atualizar grupo:', error);
          return response.error('Erro ao atualizar grupo', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * POST /groups/:groupJid/leave
     * Sair do grupo
     */
    leave: igniter.mutation({
      path: '/:groupJid/leave',
      params: z.object({
        groupJid: groupJidSchema,
      }),
      body: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid } = context.params;
        const { instanceId } = context.body;
        const { currentOrgId } = context.user;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Sair do grupo
        try {
          await uazService.leaveGroup(instance.uazToken, groupJid);

          return response.success({
            message: 'Saiu do grupo com sucesso',
          });
        } catch (error) {
          console.error('[GroupsController] Erro ao sair do grupo:', error);
          return response.error('Erro ao sair do grupo', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * GET /groups/:groupJid/invite-link
     * Obter link de convite do grupo
     */
    getInviteLink: igniter.query({
      path: '/:groupJid/invite-link',
      params: z.object({
        groupJid: groupJidSchema,
      }),
      query: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid } = context.params;
        const { instanceId } = context.query;
        const { currentOrgId } = context.user;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Obter link de convite
        try {
          const inviteLink = await uazService.getGroupInviteLink(
            instance.uazToken,
            groupJid
          );

          return response.success({
            inviteLink,
            groupJid,
          });
        } catch (error) {
          console.error(
            '[GroupsController] Erro ao obter link de convite:',
            error
          );
          return response.error('Erro ao obter link de convite', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * POST /groups/:groupJid/invite-link/reset
     * Resetar link de convite (gerar novo)
     */
    resetInviteLink: igniter.mutation({
      path: '/:groupJid/invite-link/reset',
      params: z.object({
        groupJid: groupJidSchema,
      }),
      body: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const { groupJid } = context.params;
        const { instanceId } = context.body;
        const { currentOrgId } = context.user;

        // 1. Verificar instância
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organizationId: currentOrgId,
          },
        });

        if (!instance || !instance.uazToken) {
          return response.notFound({
            message: 'Instância não encontrada',
          });
        }

        // 2. Resetar link
        try {
          const newInviteCode = await uazService.resetGroupInviteCode(
            instance.uazToken,
            groupJid
          );

          return response.success({
            message: 'Link de convite resetado com sucesso',
            newInviteCode,
          });
        } catch (error) {
          console.error(
            '[GroupsController] Erro ao resetar link de convite:',
            error
          );
          return response.error('Erro ao resetar link de convite', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),
  },
});
