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
import crypto from 'crypto';
import { signAccessToken } from '@/lib/auth/jwt';
import { emailService } from '@/lib/email/email.service';
import { auditLog } from '@/lib/audit';

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

        // Verificar permissões do usuário
        const isAdmin = isSystemAdmin(userRole);

        const userData = await db.user.findUnique({
          where: { id: userId },
          include: {
            organizations: {
              where: { isActive: true },
              include: {
                organization: true,
              },
            },
          },
        });

        if (!userData) {
          return response.notFound('User not found');
        }

        // ✅ VALIDAÇÃO 1:1: Usuários comuns só podem ter UMA organização
        // Apenas admins do sistema podem criar múltiplas organizações
        if (!isAdmin) {
          const hasActiveOrganization = userData.organizations.length > 0;

          // Se usuário já tem organização ativa, bloquear criação de nova
          if (hasActiveOrganization) {
            return response.forbidden(
              'Você já possui uma organização vinculada ao seu e-mail. Cada usuário pode ter apenas uma organização.'
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
            // Gerar hash aleatório para password (nunca será usado - login é via OTP)
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const passwordHash = await bcrypt.hash(randomPassword, 10);

            adminUser = await db.user.create({
              data: {
                email: adminEmail,
                name: adminName || 'Admin',
                password: passwordHash, // Satisfaz schema, nunca usado (login via OTP)
                role: 'user', // Role no sistema (não na org)
                onboardingCompleted: true, // Já entra aprovado
              },
            });

            // Enviar email de boas-vindas com instruções para login via OTP
            try {
              await emailService.sendOrganizationWelcomeEmail(
                adminEmail,
                adminName || 'Admin',
                orgData.name
              );
              console.log(`[Organizations] Email de boas-vindas enviado para: ${adminEmail}`);
            } catch (emailError) {
              console.error(`[Organizations] Erro ao enviar email para ${adminEmail}:`, emailError);
              // Não bloqueia a criação, apenas loga o erro
            }
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

        // ✅ AUDIT LOG: Registrar criação de organização
        await auditLog.logCrud('create', 'organization', organization.id, userId, organization.id, {
          organizationName: organization.name,
          createdByAdmin: isAdmin,
          adminEmail: adminEmail || null,
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

        // ✅ AUDIT LOG: Registrar atualização de organização
        await auditLog.logCrud('update', 'organization', id, userId, id, {
          changes: Object.keys(request.body),
        });

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

        // ✅ AUDIT LOG: Registrar exclusão de organização
        await auditLog.logCrud('delete', 'organization', id, user.id, id, {
          organizationName: existing.name,
        });

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

        // ✅ AUDIT LOG: Registrar adição de membro
        await auditLog.logCrud('create', 'user', userId, requestUserId, id, {
          action: 'add_member',
          memberRole: role,
          organizationId: id,
        });

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

        // ✅ AUDIT LOG: Registrar atualização de role de membro
        await auditLog.logCrud('update', 'user', userId, requestUserId, id, {
          action: 'update_member_role',
          previousRole: existingMember.role,
          newRole: role,
          organizationId: id,
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

        // ✅ AUDIT LOG: Registrar remoção de membro
        await auditLog.logCrud('delete', 'user', userId, requestUserId, id, {
          action: 'remove_member',
          removedMemberEmail: user?.email,
          removedMemberRole: existingMember.role,
          organizationId: id,
        });

        return response.noContent();
      },
    }),
  },
});
