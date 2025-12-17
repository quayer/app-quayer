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
import { UserRole, OrganizationRole, isSystemAdmin } from '@/lib/auth/roles';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { signAccessToken } from '@/lib/auth/jwt';

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
        // 1. É admin (sistema) - pode criar sempre
        // 2. Usuário no onboarding (não tem organização ainda)
        // 3. Usuário é master em pelo menos uma organização (multi-empresa)
        const isAdmin = isSystemAdmin(userRole);

        if (!isAdmin) {
          // Verificar permissões do usuário
          const userData = await db.user.findUnique({
            where: { id: userId },
            include: {
              organizations: {
                include: {
                  organization: true,
                },
              },
            },
          });

          if (!userData) {
            return response.notFound('User not found');
          }

          // Cenário 1: Usuário no onboarding (sem organização) - permitir criar primeira org
          const hasNoOrganizations = userData.organizations.length === 0;

          // Cenário 2: Usuário é master em alguma organização - permitir criar novas orgs
          const isMasterInAnyOrg = userData.organizations.some(
            (orgUser) => orgUser.role === 'master'
          );

          // Bloquear se não está em nenhum dos cenários permitidos
          if (!hasNoOrganizations && !isMasterInAnyOrg) {
            return response.forbidden(
              'Apenas masters de organizações podem criar novas organizações.'
            );
          }
        }

        const { adminEmail, adminName, ...orgData } = request.body;

        const existing = await organizationsRepository.findByDocument(orgData.document);
        if (existing) {
          return response.badRequest('Já existe uma organização com este CPF/CNPJ');
        }

        // 1. Criar Organização
        const organization = await organizationsRepository.create(orgData);

        // 2. Vincular Usuário (Criador ou Novo Admin)
        let targetUserId = userId;

        // Se foi passado email de admin específico (caso de criação por Super Admin)
        if (isAdmin && adminEmail) {
          // Verificar se usuário já existe
          let adminUser = await db.user.findUnique({
            where: { email: adminEmail },
          });

          // Se não existe, criar usuário
          if (!adminUser) {
            // Gerar senha temporária segura (8 caracteres alfanuméricos)
            const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
            const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

            adminUser = await db.user.create({
              data: {
                email: adminEmail,
                name: adminName || 'Admin',
                password: tempPasswordHash,
                role: 'user', // Role no sistema (não na org)
                onboardingCompleted: true, // Já entra aprovado
              },
            });

            // TODO: Enviar email com senha temporária para o novo admin
            console.log(`[Organizations] Novo usuário criado: ${adminEmail} com senha temporária: ${tempPassword}`);
          }

          targetUserId = adminUser.id;
        }

        // 3. Criar vínculo User-Organization
        await db.userOrganization.create({
          data: {
            userId: targetUserId,
            organizationId: organization.id,
            role: 'master', // Criador/Admin é master
            isActive: true,
          },
        });

        // 4. Atualizar currentOrgId do usuário alvo E marcar onboarding como completo
        const updatedUser = await db.user.update({
          where: { id: targetUserId },
          data: {
            currentOrgId: organization.id,
            onboardingCompleted: true, // ✅ CORREÇÃO BRUTAL: Marcar onboarding como completo
            lastOrganizationId: organization.id,
          },
        });

        // 5. Gerar novo access token com needsOnboarding: false
        const accessToken = signAccessToken({
          userId: targetUserId,
          email: updatedUser.email,
          role: updatedUser.role as UserRole,
          currentOrgId: organization.id,
          organizationRole: OrganizationRole.MASTER,
          needsOnboarding: false, // ✅ CRÍTICO: Token com onboarding completo
        });

        return response.created({
          message: 'Organização criada com sucesso',
          organization,
          accessToken, // ✅ CORREÇÃO BRUTAL: Retornar novo token
        });
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
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const userId = user.id;
        const userRole = user.role as UserRole;
        const { id } = request.params as { id: string };

        const isAdmin = isSystemAdmin(userRole);
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
      method: 'PUT',
      body: updateOrganizationSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const userId = user.id;
        const userRole = user.role as UserRole;
        const { id } = request.params as { id: string };

        const isAdmin = isSystemAdmin(userRole);
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
      method: 'DELETE',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user || !isSystemAdmin(user.role as UserRole)) {
          return response.forbidden('Apenas administradores podem deletar organizações');
        }

        const { id } = request.params as { id: string };

        const existing = await organizationsRepository.findById(id);
        if (!existing) {
          return response.notFound('Organização não encontrada');
        }

        await organizationsRepository.softDelete(id);
        return response.noContent();
      },
    }),

    // LIST MEMBERS
    listMembers: igniter.query({
      path: '/:id/members',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const userId = user.id;
        const userRole = user.role as UserRole;
        const { id } = request.params as { id: string };

        const isAdmin = isSystemAdmin(userRole);
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
      method: 'POST',
      body: addMemberSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const requestUserId = user.id;
        const userRole = user.role as UserRole;
        const { id } = request.params as { id: string };
        const { userId, role } = request.body;

        const isAdmin = isSystemAdmin(userRole);
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

        return response.noContent();
      },
    }),
  },
});
