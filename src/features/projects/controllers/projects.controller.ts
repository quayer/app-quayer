/**
 * Projects Controller - CRUD + Instance Linking
 */

import { igniter } from '@/igniter';
import { projectsRepository } from '../projects.repository';
import { organizationsRepository } from '@/features/organizations/organizations.repository';
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsSchema,
  linkConnectionSchema,
} from '../projects.schemas';
import { UserRole, isSystemAdmin } from '@/lib/auth/roles';

export const projectsController = igniter.controller({
  name: 'projects',
  path: '/projects',
  actions: {
    // CREATE
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: createProjectSchema,
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { name, description, organizationId } = request.body;

        // Check if user has permission in organization
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(organizationId, userId);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para criar projetos nesta organização');
        }

        // Check if project name already exists in organization
        const existing = await projectsRepository.findByName(name, organizationId);
        if (existing) {
          return response.badRequest('Já existe um projeto com este nome nesta organização');
        }

        const project = await projectsRepository.create({ name, description, organizationId });
        return response.created({ message: 'Projeto criado', project });
      },
    }),

    // LIST
    list: igniter.query({
      path: '/',
      query: listProjectsSchema,
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { organizationId, ...filters } = request.query;

        // System admin can see all projects
        if (isSystemAdmin(userRole as UserRole)) {
          const result = await projectsRepository.list({ ...filters, organizationId });
          return response.success(result);
        }

        // Regular users can only see projects from their organization
        if (!organizationId) {
          return response.badRequest('organizationId é obrigatório para usuários não-admin');
        }

        // Check if user is member of organization
        const isMember = await organizationsRepository.isMember(organizationId, userId);
        if (!isMember) {
          return response.forbidden('Você não tem acesso a projetos desta organização');
        }

        const result = await projectsRepository.list({ ...filters, organizationId });
        return response.success(result);
      },
    }),

    // GET BY ID
    get: igniter.query({
      path: '/:id',
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const project = await projectsRepository.findById(id, true);
        if (!project) {
          return response.notFound('Projeto não encontrado');
        }

        // Check permission
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const isMember = await organizationsRepository.isMember(project.organizationId, userId);

        if (!isAdmin && !isMember) {
          return response.forbidden('Você não tem permissão para visualizar este projeto');
        }

        return response.success({ project });
      },
    }),

    // UPDATE
    update: igniter.mutation({
      path: '/:id',
      method: 'PUT',
      body: updateProjectSchema,
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const project = await projectsRepository.findById(id);
        if (!project) {
          return response.notFound('Projeto não encontrado');
        }

        // Check permission
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(project.organizationId, userId);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Apenas admins, masters ou managers podem atualizar projetos');
        }

        const updated = await projectsRepository.update(id, request.body);
        return response.success({ message: 'Projeto atualizado', project: updated });
      },
    }),

    // DELETE
    delete: igniter.mutation({
      path: '/:id',
      method: 'DELETE',
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const project = await projectsRepository.findById(id);
        if (!project) {
          return response.notFound('Projeto não encontrado');
        }

        // Check permission
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(project.organizationId, userId);

        if (!isAdmin && orgRole !== 'master') {
          return response.forbidden('Apenas admins ou masters podem deletar projetos');
        }

        await projectsRepository.softDelete(id);
        return response.success({ message: 'Projeto desativado' });
      },
    }),

    // LINK CONNECTION TO PROJECT
    linkConnection: igniter.mutation({
      path: '/:id/connections',
      method: 'POST',
      body: linkConnectionSchema,
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };
        const { connectionId } = request.body;

        const project = await projectsRepository.findById(id);
        if (!project) {
          return response.notFound('Projeto não encontrado');
        }

        // Check permission
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(project.organizationId, userId);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para vincular conexões');
        }

        await projectsRepository.linkConnection(id, connectionId);
        return response.success({ message: 'Conexão vinculada ao projeto' });
      },
    }),

    // UNLINK CONNECTION FROM PROJECT
    unlinkConnection: igniter.mutation({
      path: '/:id/connections/:connectionId',
      method: 'DELETE',
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id, connectionId } = request.params as { id: string; connectionId: string };

        const project = await projectsRepository.findById(id);
        if (!project) {
          return response.notFound('Projeto não encontrado');
        }

        // Check permission
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(project.organizationId, userId);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para desvincular conexões');
        }

        await projectsRepository.unlinkConnection(connectionId);
        return response.success({ message: 'Conexão desvinculada do projeto' });
      },
    }),

    // LIST PROJECT CONNECTIONS
    listConnections: igniter.query({
      path: '/:id/connections',
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };

        const project = await projectsRepository.findById(id);
        if (!project) {
          return response.notFound('Projeto não encontrado');
        }

        // Check permission
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const isMember = await organizationsRepository.isMember(project.organizationId, userId);

        if (!isAdmin && !isMember) {
          return response.forbidden('Você não tem permissão para visualizar as conexões');
        }

        const connections = await projectsRepository.listConnections(id);
        return response.success({ connections });
      },
    }),
  },
});
