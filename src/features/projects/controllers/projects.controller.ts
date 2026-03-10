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
  linkInstanceSchema,
} from '../projects.schemas';
import { UserRole, isSystemAdmin } from '@/lib/auth/roles';

export const projectsController = igniter.controller({
  name: 'projects',
  path: '/projects',
  actions: {
    // CREATE
    create: igniter.mutation({
      path: '/',
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

    // LINK INSTANCE TO PROJECT
    linkInstance: igniter.mutation({
      path: '/:id/instances',
      body: linkInstanceSchema,
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id } = request.params as { id: string };
        const { instanceId } = request.body;

        const project = await projectsRepository.findById(id);
        if (!project) {
          return response.notFound('Projeto não encontrado');
        }

        // Check permission
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(project.organizationId, userId);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para vincular instâncias');
        }

        await projectsRepository.linkInstance(id, instanceId);
        return response.success({ message: 'Instância vinculada ao projeto' });
      },
    }),

    // UNLINK INSTANCE FROM PROJECT
    unlinkInstance: igniter.mutation({
      path: '/:id/instances/:instanceId',
      handler: async ({ request, response }) => {
        const userId = request.headers.get('x-user-id');
        const userRole = request.headers.get('x-user-role');

        if (!userId || !userRole) {
          return response.unauthorized('Autenticação necessária');
        }

        const { id, instanceId } = request.params as { id: string; instanceId: string };

        const project = await projectsRepository.findById(id);
        if (!project) {
          return response.notFound('Projeto não encontrado');
        }

        // Check permission
        const isAdmin = isSystemAdmin(userRole as UserRole);
        const orgRole = await organizationsRepository.getUserRole(project.organizationId, userId);

        if (!isAdmin && orgRole !== 'master' && orgRole !== 'manager') {
          return response.forbidden('Sem permissão para desvincular instâncias');
        }

        await projectsRepository.unlinkInstance(instanceId);
        return response.success({ message: 'Instância desvinculada do projeto' });
      },
    }),

    // LIST PROJECT INSTANCES
    listInstances: igniter.query({
      path: '/:id/instances',
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
          return response.forbidden('Você não tem permissão para visualizar as instâncias');
        }

        const instances = await projectsRepository.listInstances(id);
        return response.success({ instances });
      },
    }),
  },
});
