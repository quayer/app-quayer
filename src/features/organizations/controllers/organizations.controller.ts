/**
 * Organizations Controller - CRUD + Members Management
 *
 * Simplified version compatible with Igniter.js
 */

import { igniter } from '@/igniter';
import { organizationsRepository } from '../organizations.repository';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  listOrganizationsSchema,
  addMemberSchema,
  updateMemberSchema,
} from '../organizations.schemas';
import { UserRole, isSystemAdmin } from '@/lib/auth/roles';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

export const organizationsController = igniter.controller({
  name: 'organizations',
  path: '/organizations',
  actions: {
    // CREATE (During onboarding or Admin only)
    create: igniter.mutation({
      path: '/',
      method: 'POST', // ✅ CORREÇÃO BRUTAL: Especificar método explicitamente
      body: createOrganizationSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Authentication required');
        }

        const userId = user.id;
        const userRole = user.role as UserRole;

        // Permitir criação se:
        // 1. É admin (sistema)
        // 2. OU usuário não completou onboarding E não tem organização
        const isAdmin = isSystemAdmin(userRole);

        if (!isAdmin) {
          // Verificar se está no onboarding
          const userData = await db.user.findUnique({
            where: { id: userId },
            include: {
              organizations: true,
            },
          });

          if (!userData) {
            return response.notFound('User not found');
          }

          // Permitir apenas se não completou onboarding E não tem organização
          if (userData.onboardingCompleted || userData.organizations.length > 0) {
            return response.forbidden(
              'Apenas administradores podem criar novas organizações. Você já possui uma organização.'
            );
          }
        }

        const existing = await organizationsRepository.findByDocument(request.body.document);
        if (existing) {
          return response.badRequest('Já existe uma organização com este CPF/CNPJ');
        }

        const organization = await organizationsRepository.create(request.body);

        // ✅ CORREÇÃO BRUTAL: SEMPRE criar relação User-Organization (inclusive para admin)
        // Durante onboarding, admin também precisa ter uma organização vinculada
        await db.userOrganization.create({
          data: {
            userId,
            organizationId: organization.id,
            role: 'master', // Criador da org é master
            isActive: true,
          },
        });

        // ✅ CORREÇÃO BRUTAL: SEMPRE atualizar currentOrgId do usuário
        await db.user.update({
          where: { id: userId },
          data: {
            currentOrgId: organization.id,
          },
        });

        return response.created({ message: 'Organização criada', organization });
      },
    }),

    // LIST (Admin only)
    list: igniter.query({
      path: '/',
      query: listOrganizationsSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user || !isSystemAdmin(user.role as UserRole)) {
          return response.forbidden('Apenas administradores podem listar organizações');
        }

        const result = await organizationsRepository.list(request.query);
        return response.success(result);
      },
    }),

    // GET BY ID
    get: igniter.query({
      path: '/:id' as const,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const isAdmin = isSystemAdmin(userRole as UserRole);
        const isMember = await organizationsRepository.isMember(id, userId);

        if (!isAdmin && !isMember) {
          return response.forbidden('Sem permissão para visualizar esta organização');
        }

        const organization = await organizationsRepository.findById(id, true);
        if (!organization) {
          return response.notFound('Organização não encontrada');
        }

        return response.success({ organization });
      },
    }),

    // GET CURRENT (Organização atual do usuário)
    getCurrent: igniter.query({
      path: '/current',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ response, context }) => {
        const user = context.auth?.session?.user;

        if (!user || !user.currentOrgId) {
          return response.notFound('Usuário não possui organização atual');
        }

        const organization = await organizationsRepository.findById(user.currentOrgId, true);
        
        if (!organization) {
          return response.notFound('Organização não encontrada');
        }

        return response.success(organization);
      },
    }),

    // UPDATE
    update: igniter.mutation({
      path: '/:id',
      params: z.object({ id: z.string() }),
      body: updateOrganizationSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(id, userId);

        if (!isAdmin && orgRole !== 'master') {
          return response.forbidden('Apenas admins ou masters podem atualizar');
        }

        const existing = await organizationsRepository.findById(id);
        if (!existing) {
          return response.notFound('Organização não encontrada');
        }

        const updated = await organizationsRepository.update(id, request.body);
        return response.success({ message: 'Organização atualizada', organization: updated });
      },
    }),

    // DELETE (Admin only, soft delete)
    delete: igniter.mutation({
      path: '/:id',
      params: z.object({ id: z.string() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole || !isSystemAdmin(userRole as UserRole)) {
          return response.forbidden('Apenas administradores podem deletar organizações');
        }

        const { id } = request.params as { id: string };

        const existing = await organizationsRepository.findById(id);
        if (!existing) {
          return response.notFound('Organização não encontrada');
        }

        await organizationsRepository.softDelete(id);
        return response.success({ message: 'Organização desativada' });
      },
    }),

    // LIST MEMBERS
    listMembers: igniter.query({
      path: '/:id/members',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const isAdmin = isSystemAdmin(userRole as UserRole);
        const isMember = await organizationsRepository.isMember(id, userId);

        if (!isAdmin && !isMember) {
          return response.forbidden('Sem permissão para visualizar membros');
        }

        const members = await organizationsRepository.listMembers(id);
        return response.success({ members });
      },
    }),

    // ADD MEMBER
    addMember: igniter.mutation({
      path: '/:id/members',
      body: addMemberSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response }) => {
        const requestUserId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!requestUserId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };
        const { userId, role } = request.body;

        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(id, requestUserId);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para adicionar membros');
        }

        const organization = await organizationsRepository.findById(id);
        if (!organization) {
          return response.notFound('Organização não encontrada');
        }

        const existingMember = await organizationsRepository.getMember(id, userId);
        if (existingMember) {
          return response.badRequest('Usuário já é membro');
        }

        const hasReachedLimit = await organizationsRepository.hasReachedUserLimit(id);
        if (hasReachedLimit) {
          return response.badRequest(`Limite atingido (${organization.maxUsers})`);
        }

        const member = await organizationsRepository.addMember(id, { userId, role });
        return response.created({ message: 'Membro adicionado', member });
      },
    }),

    // UPDATE MEMBER
    updateMember: igniter.mutation({
      path: '/:id/members/:userId',
      method: 'PATCH',
      params: z.object({
        id: z.string().uuid(),
        userId: z.string().uuid(),
      }),
      body: updateMemberSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const requestUserId = context.auth?.session?.user?.id;
        const userRole = context.auth?.session?.user?.role;

        if (!requestUserId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id, userId } = request.params as { id: string; userId: string };
        const { role } = request.body;

        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(id, requestUserId);

        // Apenas admin ou master podem atualizar roles
        if (!isAdmin && orgRole !== 'master') {
          return response.forbidden('Apenas administradores ou masters podem atualizar membros');
        }

        const organization = await organizationsRepository.findById(id);
        if (!organization) {
          return response.notFound('Organização não encontrada');
        }

        const existingMember = await organizationsRepository.getMember(id, userId);
        if (!existingMember) {
          return response.notFound('Membro não encontrado');
        }

        // Não permitir que o último master seja rebaixado
        if (existingMember.role === 'master' && role !== 'master') {
          const masterCount = await db.userOrganization.count({
            where: {
              organizationId: id,
              role: 'master',
              isActive: true,
            },
          });

          if (masterCount <= 1) {
            return response.badRequest('Não é possível rebaixar o último master da organização');
          }
        }

        // Não permitir que um membro mude seu próprio role
        if (requestUserId === userId && !isAdmin) {
          return response.forbidden('Você não pode alterar seu próprio cargo');
        }

        const updatedMember = await db.userOrganization.update({
          where: {
            userId_organizationId: {
              userId,
              organizationId: id,
            },
          },
          data: { role },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        return response.success({
          message: 'Cargo do membro atualizado com sucesso',
          member: updatedMember,
        });
      },
    }),

    // REMOVE MEMBER
    removeMember: igniter.mutation({
      path: '/:id/members/:userId',
      method: 'DELETE',
      params: z.object({
        id: z.string().uuid(),
        userId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const requestUserId = context.auth?.session?.user?.id;
        const userRole = context.auth?.session?.user?.role;

        if (!requestUserId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id, userId } = request.params as { id: string; userId: string };

        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(id, requestUserId);

        // Apenas admin ou master podem remover membros
        if (!isAdmin && orgRole !== 'master') {
          return response.forbidden('Apenas administradores ou masters podem remover membros');
        }

        const organization = await organizationsRepository.findById(id);
        if (!organization) {
          return response.notFound('Organização não encontrada');
        }

        const existingMember = await organizationsRepository.getMember(id, userId);
        if (!existingMember) {
          return response.notFound('Membro não encontrado');
        }

        // Não permitir que o último master seja removido
        if (existingMember.role === 'master') {
          const masterCount = await db.userOrganization.count({
            where: {
              organizationId: id,
              role: 'master',
              isActive: true,
            },
          });

          if (masterCount <= 1) {
            return response.badRequest('Não é possível remover o último master da organização');
          }
        }

        // Não permitir que um membro remova a si mesmo (use leave endpoint para isso)
        if (requestUserId === userId) {
          return response.forbidden('Use o endpoint /leave para sair da organização');
        }

        // Soft delete - marcar como inativo
        await db.userOrganization.update({
          where: {
            userId_organizationId: {
              userId,
              organizationId: id,
            },
          },
          data: { isActive: false },
        });

        // Se o usuário removido tinha esta org como current, limpar currentOrgId
        const user = await db.user.findUnique({
          where: { id: userId },
        });

        if (user && user.currentOrgId === id) {
          await db.user.update({
            where: { id: userId },
            data: { currentOrgId: null },
          });
        }

        return response.success({
          message: 'Membro removido com sucesso',
        });
      },
    }),
  },
});
