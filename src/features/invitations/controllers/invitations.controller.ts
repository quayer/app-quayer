/**
 * Invitations Controller
 * Gerenciamento de convites para organizações
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { invitationsRepository } from '../invitations.repository';
import { organizationsRepository } from '@/features/organizations/organizations.repository';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { OrganizationRole } from '@/lib/auth/roles';
import { Resource, Action, hasPermission } from '@/lib/auth/permissions';
import { emailService } from '@/lib/email/email.service';
import { invitationTemplate } from '@/lib/email/templates';
import bcrypt from 'bcryptjs';
import {
  createInvitationSchema,
  acceptInvitationExistingUserSchema,
  acceptInvitationNewUserSchema,
  listInvitationsSchema,
  deleteInvitationSchema,
  resendInvitationSchema,
} from '../invitations.schemas';

export const invitationsController = igniter.controller({
  name: 'invitations',
  path: '/invitations',
  actions: {
    /**
     * POST /api/v1/invitations/create
     * Criar convite para organização
     */
    create: igniter.mutation({
    path: '/create',
    method: 'POST',
    use: [authProcedure({ required: true })],
    handler: async ({ request, response, context }) => {
      const userId = context.auth?.session?.user?.id!;
      const body = createInvitationSchema.parse(request.body);

      // Verificar se usuário tem permissão para criar convites
      const member = await organizationsRepository.getMember(body.organizationId, userId);

      if (!member) {
        return response.forbidden('Você não é membro desta organização');
      }

      const userRole = member.role as OrganizationRole;

      // Verificar permissão baseada em RBAC
      if (!hasPermission(userRole, Resource.INVITATION, Action.CREATE)) {
        return response.forbidden('Você não tem permissão para criar convites');
      }

      // Se role do convite é master, apenas MASTER pode convidar
      if (body.role === 'master' && userRole !== OrganizationRole.MASTER) {
        return response.forbidden('Apenas o proprietário pode convidar outros proprietários');
      }

      // Verificar se email já é membro da organização
      const existingUser = await database.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        const isMember = await organizationsRepository.isMember(
          body.organizationId,
          existingUser.id
        );

        if (isMember) {
          return response.badRequest('Este email já é membro da organização');
        }
      }

      // Verificar se já existe convite pendente
      const hasPending = await invitationsRepository.hasPendingInvitation(
        body.email,
        body.organizationId
      );

      if (hasPending) {
        return response.badRequest('Já existe um convite pendente para este email');
      }

      // Verificar limite de usuários da organização
      const hasReachedLimit = await organizationsRepository.hasReachedUserLimit(
        body.organizationId
      );

      if (hasReachedLimit) {
        return response.forbidden('Organização atingiu o limite de usuários');
      }

      // Criar convite
      const invitation = await invitationsRepository.create({
        email: body.email,
        role: body.role,
        organizationId: body.organizationId,
        invitedById: userId,
        expiresInDays: body.expiresInDays,
      });

      // Buscar informações para o email
      const organization = await organizationsRepository.findById(body.organizationId);
      const inviterUser = await database.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      // Gerar URL do convite
      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/connect?token=${invitation.token}`;

      // Enviar email
      try {
        const html = invitationTemplate({
          inviterName: inviterUser?.name || 'Um membro',
          organizationName: organization?.name || 'uma organização',
          invitationUrl: inviteUrl,
          role: body.role,
        });

        await emailService.send({
          to: body.email,
          subject: `Você foi convidado para ${organization?.name || 'uma organização'} - Quayer`,
          html,
        });
      } catch (emailError) {
        console.error('Erro ao enviar email de convite:', emailError);
        // Não falha a criação do convite se o email falhar
      }

      return response.created({
        message: 'Convite criado com sucesso',
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          token: invitation.token,
        },
        inviteUrl,
      });
    },
  }),

  /**
   * POST /api/v1/invitations/accept
   * Aceitar convite (usuário existente)
   */
  acceptExisting: igniter.mutation({
    path: '/accept',
    method: 'POST',
    use: [authProcedure({ required: true })],
    handler: async ({ request, response, context }) => {
      const userId = context.auth?.session?.user?.id!;
      const body = acceptInvitationExistingUserSchema.parse(request.body);

      // Buscar convite
      const invitation = await invitationsRepository.findByToken(body.token);

      if (!invitation) {
        return response.notFound('Convite não encontrado');
      }

      // Verificar se convite já foi usado
      if (invitation.usedAt) {
        return response.badRequest('Este convite já foi utilizado');
      }

      // Verificar se convite expirou
      if (new Date() > invitation.expiresAt) {
        return response.badRequest('Este convite expirou');
      }

      // Verificar se email do convite corresponde ao usuário logado
      const user = await database.user.findUnique({
        where: { id: userId },
      });

      if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        return response.forbidden('Este convite não é para o seu email');
      }

      // Verificar se já é membro
      const isMember = await organizationsRepository.isMember(
        invitation.organizationId,
        userId
      );

      if (isMember) {
        return response.badRequest('Você já é membro desta organização');
      }

      // Adicionar usuário à organização
      await organizationsRepository.addMember(invitation.organizationId, {
        userId,
        role: invitation.role as 'master' | 'manager' | 'user',
      });

      // Atualizar organização atual do usuário se não tiver nenhuma
      if (!user.currentOrgId) {
        await database.user.update({
          where: { id: userId },
          data: { currentOrgId: invitation.organizationId },
        });
      }

      // Marcar convite como usado
      await invitationsRepository.markAsUsed(body.token);

      const organization = await organizationsRepository.findById(invitation.organizationId);

      return response.success({
        message: 'Convite aceito com sucesso',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        organizationId: invitation.organizationId,
        organizationName: organization?.name,
        role: invitation.role,
        isNewUser: false,
      });
    },
  }),

  /**
   * POST /api/v1/invitations/accept/new
   * Aceitar convite e criar nova conta
   */
  acceptNew: igniter.mutation({
    path: '/accept/new',
    method: 'POST',
    handler: async ({ request, response }) => {
      const body = acceptInvitationNewUserSchema.parse(request.body);

      // Buscar convite
      const invitation = await invitationsRepository.findByToken(body.token);

      if (!invitation) {
        return response.notFound('Convite não encontrado');
      }

      // Verificar se convite já foi usado
      if (invitation.usedAt) {
        return response.badRequest('Este convite já foi utilizado');
      }

      // Verificar se convite expirou
      if (new Date() > invitation.expiresAt) {
        return response.badRequest('Este convite expirou');
      }

      // Verificar se email já existe
      const existingUser = await database.user.findUnique({
        where: { email: invitation.email },
      });

      if (existingUser) {
        return response.badRequest(
          'Já existe uma conta com este email. Faça login para aceitar o convite.'
        );
      }

      // Criar nova conta
      const hashedPassword = await bcrypt.hash(body.password, 10);

      const newUser = await database.user.create({
        data: {
          email: invitation.email,
          name: body.name,
          password: hashedPassword,
          emailVerified: new Date(), // Email verificado automaticamente via convite
          currentOrgId: invitation.organizationId,
          onboardingCompleted: true, // Skip onboarding pois já tem organização
        },
      });

      // Adicionar usuário à organização
      await organizationsRepository.addMember(invitation.organizationId, {
        userId: newUser.id,
        role: invitation.role as 'master' | 'manager' | 'user',
      });

      // Marcar convite como usado
      await invitationsRepository.markAsUsed(body.token);

      const organization = await organizationsRepository.findById(invitation.organizationId);

      return response.created({
        message: 'Conta criada e convite aceito com sucesso',
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
        },
        organizationId: invitation.organizationId,
        organizationName: organization?.name,
        role: invitation.role,
        isNewUser: true,
      });
    },
  }),

  /**
   * GET /api/v1/invitations/list
   * Listar convites da organização
   */
  list: igniter.query({
    path: '/list',
    method: 'GET',
    use: [authProcedure({ required: true })],
    handler: async ({ request, response, context }) => {
      const userId = context.auth?.session?.user?.id!;
      const query = listInvitationsSchema.parse(request.query);

      // Se não especificou organizationId, usar a organização atual do usuário
      const organizationId = query.organizationId || context.auth?.session?.user?.currentOrgId;

      if (!organizationId) {
        return response.badRequest('OrganizationId é obrigatório');
      }

      // Verificar se usuário é membro da organização
      const member = await organizationsRepository.getMember(organizationId, userId);

      if (!member) {
        return response.forbidden('Você não é membro desta organização');
      }

      const userRole = member.role as OrganizationRole;

      // Verificar permissão para listar convites
      if (!hasPermission(userRole, Resource.INVITATION, Action.LIST)) {
        return response.forbidden('Você não tem permissão para ver convites');
      }

      // Listar convites
      const result = await invitationsRepository.list({
        ...query,
        organizationId,
      });

      return response.success({
        data: result.data,
        pagination: result.pagination,
      });
    },
  }),

  /**
   * DELETE /api/v1/invitations/:invitationId
   * Cancelar/deletar convite
   */
  delete: igniter.mutation({
    path: '/:invitationId',
    method: 'DELETE',
    use: [authProcedure({ required: true })],
    handler: async ({ request, response, context }) => {
      const userId = context.auth?.session?.user?.id!;
      const { invitationId } = request.params as { invitationId: string };

      // Buscar convite
      const invitation = await invitationsRepository.findById(invitationId);

      if (!invitation) {
        return response.notFound('Convite não encontrado');
      }

      // Verificar se usuário é membro da organização
      const member = await organizationsRepository.getMember(
        invitation.organizationId,
        userId
      );

      if (!member) {
        return response.forbidden('Você não é membro desta organização');
      }

      const userRole = member.role as OrganizationRole;

      // Verificar permissão para deletar convites
      if (!hasPermission(userRole, Resource.INVITATION, Action.DELETE)) {
        return response.forbidden('Você não tem permissão para cancelar convites');
      }

      // Deletar convite
      await invitationsRepository.delete(invitationId);

      return response.success({
        message: 'Convite cancelado com sucesso',
      });
    },
  }),

  /**
   * POST /api/v1/invitations/:invitationId/resend
   * Reenviar convite (atualiza expiração e reenvia email)
   */
  resend: igniter.mutation({
    path: '/:invitationId/resend',
    method: 'POST',
    use: [authProcedure({ required: true })],
    handler: async ({ request, response, context }) => {
      const userId = context.auth?.session?.user?.id!;
      const { invitationId } = request.params as { invitationId: string };
      const body = resendInvitationSchema.parse(request.body);

      // Buscar convite
      const invitation = await invitationsRepository.findById(invitationId);

      if (!invitation) {
        return response.notFound('Convite não encontrado');
      }

      // Verificar se convite já foi usado
      if (invitation.usedAt) {
        return response.badRequest('Este convite já foi utilizado e não pode ser reenviado');
      }

      // Verificar se usuário é membro da organização
      const member = await organizationsRepository.getMember(
        invitation.organizationId,
        userId
      );

      if (!member) {
        return response.forbidden('Você não é membro desta organização');
      }

      const userRole = member.role as OrganizationRole;

      // Verificar permissão
      if (!hasPermission(userRole, Resource.INVITATION, Action.CREATE)) {
        return response.forbidden('Você não tem permissão para reenviar convites');
      }

      // Atualizar expiração
      const updatedInvitation = await invitationsRepository.updateExpiration(
        invitationId,
        body.expiresInDays
      );

      // Buscar informações para o email
      const organization = await organizationsRepository.findById(invitation.organizationId);
      const inviterUser = await database.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      // Gerar URL do convite
      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/connect?token=${invitation.token}`;

      // Reenviar email
      try {
        const html = invitationTemplate({
          inviterName: inviterUser?.name || 'Um membro',
          organizationName: organization?.name || 'uma organização',
          invitationUrl: inviteUrl,
          role: invitation.role,
        });

        await emailService.send({
          to: invitation.email,
          subject: `[REENVIO] Você foi convidado para ${organization?.name || 'uma organização'} - Quayer`,
          html,
        });
      } catch (emailError) {
        console.error('Erro ao reenviar email de convite:', emailError);
        return response.badRequest('Erro ao enviar email');
      }

      return response.success({
        message: 'Convite reenviado com sucesso',
        invitation: {
          id: updatedInvitation.id,
          email: updatedInvitation.email,
          role: updatedInvitation.role,
          expiresAt: updatedInvitation.expiresAt,
        },
        inviteUrl,
      });
    },
  }),

  /**
   * GET /api/v1/invitations/validate/:token
   * Validar token de convite (antes de aceitar)
   */
  validate: igniter.query({
    path: '/validate/:token',
    method: 'GET',
    handler: async ({ request, response }) => {
      const { token } = request.params as { token: string };

      const invitation = await invitationsRepository.findByToken(token);

      if (!invitation) {
        return response.notFound('Convite não encontrado');
      }

      if (invitation.usedAt) {
        return response.badRequest('Este convite já foi utilizado');
      }

      if (new Date() > invitation.expiresAt) {
        return response.badRequest('Este convite expirou');
      }

      const organization = await organizationsRepository.findById(invitation.organizationId);

      // Verificar se email já tem conta
      const existingUser = await database.user.findUnique({
        where: { email: invitation.email },
      });

      return response.success({
        valid: true,
        invitation: {
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          organizationName: organization?.name,
        },
        hasAccount: !!existingUser,
      });
    },
  }),
  },
});
