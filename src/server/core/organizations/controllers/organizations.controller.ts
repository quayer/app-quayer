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
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { csrfProcedure } from '@/server/core/auth/procedures/csrf.procedure';
import { database as db } from '@/server/services/database';

export const organizationsController = igniter.controller({
  name: 'organizations',
  path: '/organizations',
  actions: {
    // CREATE (During onboarding or Admin only)
    create: igniter.mutation({
      path: '/',
      method: 'POST', // ✅ CORREÇÃO BRUTAL: Especificar método explicitamente
      body: createOrganizationSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
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

        if (request.body.document) {
          const existing = await organizationsRepository.findByDocument(request.body.document);
          if (existing) {
            return response.badRequest('Já existe uma organização com este CPF/CNPJ');
          }
        }

        const organization = await db.$transaction(async (tx) => {
          const data = request.body;
          const slug = await organizationsRepository.generateUniqueSlug(data.name);

          const org = await tx.organization.create({
            data: {
              ...data,
              slug,
              maxInstances: data.maxInstances ?? (data.type === 'pf' ? 1 : 5),
              maxUsers: data.maxUsers ?? (data.type === 'pf' ? 1 : 3),
              billingType: data.billingType ?? 'free',
            },
            include: {
              _count: {
                select: { users: true, connections: true },
              },
            },
          });

          await tx.userOrganization.create({
            data: {
              userId,
              organizationId: org.id,
              role: 'master',
              isActive: true,
            },
          });

          await tx.user.update({
            where: { id: userId },
            data: { currentOrgId: org.id },
          });

          return org;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (igniter.mutation as any)({
      path: '/:id',
      body: updateOrganizationSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response }: any) => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete: (igniter.mutation as any)({
      path: '/:id',
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response }: any) => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addMember: (igniter.mutation as any)({
      path: '/:id/members',
      body: addMemberSchema,
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response }: any) => {
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

    // UPDATE MEMBER (change role)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateMember: (igniter.mutation as any)({
      path: '/:id/members/:userId',
      method: 'PATCH',
      body: z.object({
        role: z.enum(['user', 'manager', 'master'], {
          errorMap: () => ({ message: 'Role deve ser "user", "manager" ou "master"' }),
        }),
      }),
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }: any) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id, userId } = request.params as { id: string; userId: string };
        const { role: newRole } = request.body as { role: 'user' | 'manager' | 'master' };

        const isAdmin = isSystemAdmin(user.role as UserRole);
        const actorRole = await organizationsRepository.getUserRole(id, user.id);

        if (!isAdmin && actorRole !== 'master' && actorRole !== 'manager') {
          return response.forbidden('Sem permissão para alterar membros');
        }

        const target = await organizationsRepository.getMember(id, userId);
        if (!target) {
          return response.notFound('Membro não encontrado');
        }

        const currentRole = target.role as 'user' | 'manager' | 'master';

        // Manager só pode mover entre user <-> manager
        if (!isAdmin && actorRole === 'manager') {
          if (currentRole === 'master' || newRole === 'master') {
            return response.forbidden(
              'Apenas masters podem promover ou rebaixar masters'
            );
          }
        }

        // Impedir rebaixar o último master
        if (currentRole === 'master' && newRole !== 'master') {
          const mastersCount = await organizationsRepository.countMasters(id);
          if (mastersCount <= 1) {
            return response.badRequest('Não é possível rebaixar o último master');
          }
        }

        const member = await organizationsRepository.updateMember(id, userId, {
          role: newRole,
        });
        return response.success({ message: 'Membro atualizado', member });
      },
    }),

    // REMOVE MEMBER
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeMember: (igniter.mutation as any)({
      path: '/:id/members/:userId',
      method: 'DELETE',
      use: [authProcedure({ required: true }), csrfProcedure()],
      handler: async ({ request, response, context }: any) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id, userId } = request.params as { id: string; userId: string };

        const isAdmin = isSystemAdmin(user.role as UserRole);
        const actorRole = await organizationsRepository.getUserRole(id, user.id);

        if (!isAdmin && actorRole !== 'master' && actorRole !== 'manager') {
          return response.forbidden('Sem permissão para remover membros');
        }

        if (user.id === userId) {
          return response.badRequest('Você não pode remover a si mesmo');
        }

        const target = await organizationsRepository.getMember(id, userId);
        if (!target) {
          return response.notFound('Membro não encontrado');
        }

        const targetRole = target.role as 'user' | 'manager' | 'master';

        // Manager não pode remover master
        if (!isAdmin && actorRole === 'manager' && targetRole === 'master') {
          return response.forbidden('Apenas masters podem remover outros masters');
        }

        // Impedir remover o último master
        if (targetRole === 'master') {
          const mastersCount = await organizationsRepository.countMasters(id);
          if (mastersCount <= 1) {
            return response.badRequest('Não é possível remover o último master');
          }
        }

        await organizationsRepository.removeMember(id, userId);
        return response.success({ success: true });
      },
    }),
  },
});
