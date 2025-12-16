/**
 * API Keys Controller
 *
 * Manages API keys for programmatic access to the platform
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { apiKeysRepository } from '../api-keys.repository'
import {
  createApiKeySchema,
  updateApiKeySchema,
  EXPIRATION_OPTIONS,
  API_KEY_SCOPES,
} from '../api-keys.schemas'

export const apiKeysController = igniter.controller({
  name: 'apiKeys',
  path: '/api-keys',
  description: 'API Keys management for programmatic access',
  actions: {
    // ==========================================
    // LIST API KEYS
    // ==========================================
    list: igniter.query({
      name: 'List API Keys',
      description: 'List all API keys for the current organization',
      path: '/',
      method: 'GET',
      handler: async ({ context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        // Admin sees all keys
        if (context.user.role === 'admin') {
          const keys = await apiKeysRepository.listAll()
          return response.json({ success: true, data: keys })
        }

        // Regular users see their org's keys
        if (!context.user.organizationId) {
          return response.status(400).json({ error: 'Organização não selecionada' })
        }

        const keys = await apiKeysRepository.listByOrganization(context.user.organizationId)
        return response.json({ success: true, data: keys })
      },
    }),

    // ==========================================
    // CREATE API KEY
    // ==========================================
    create: igniter.mutation({
      name: 'Create API Key',
      description: 'Create a new API key',
      path: '/',
      method: 'POST',
      body: createApiKeySchema,
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const { name, scopes, expiration, organizationId } = request.body

        // Determine organization
        let targetOrgId = organizationId
        if (context.user.role !== 'admin') {
          // Non-admins can only create for their current org
          if (!context.user.organizationId) {
            return response.status(400).json({ error: 'Organização não selecionada' })
          }
          targetOrgId = context.user.organizationId
        } else if (!targetOrgId) {
          // Admin must specify org or have one selected
          if (!context.user.organizationId) {
            return response.status(400).json({ error: 'Especifique organizationId ou selecione uma organização' })
          }
          targetOrgId = context.user.organizationId
        }

        // Calculate expiration date
        let expiresAt: Date | null = null
        if (expiration !== 'never') {
          const option = EXPIRATION_OPTIONS.find(o => o.value === expiration)
          if (option?.days) {
            expiresAt = new Date()
            expiresAt.setDate(expiresAt.getDate() + option.days)
          }
        }

        try {
          const apiKey = await apiKeysRepository.create({
            name,
            organizationId: targetOrgId!,
            userId: context.user.id,
            scopes,
            expiresAt,
          })

          return response.json({
            success: true,
            data: apiKey,
            message: 'API Key criada com sucesso. Copie a chave agora - ela não será mostrada novamente.',
          })
        } catch (error: any) {
          console.error('Error creating API key:', error)
          return response.status(500).json({ error: 'Erro ao criar API Key' })
        }
      },
    }),

    // ==========================================
    // UPDATE API KEY
    // ==========================================
    update: igniter.mutation({
      name: 'Update API Key',
      description: 'Update an API key name or scopes',
      path: '/:id',
      method: 'PUT',
      body: updateApiKeySchema,
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const { id } = request.params as { id: string }

        // Check permission
        const canManage = await apiKeysRepository.canManageKey(
          id,
          context.user.id,
          context.user.role,
          context.user.organizationId || undefined
        )

        if (!canManage) {
          return response.status(403).json({ error: 'Sem permissão para gerenciar esta chave' })
        }

        try {
          const updated = await apiKeysRepository.update(id, request.body)
          return response.json({
            success: true,
            data: updated,
            message: 'API Key atualizada',
          })
        } catch (error: any) {
          console.error('Error updating API key:', error)
          return response.status(500).json({ error: 'Erro ao atualizar API Key' })
        }
      },
    }),

    // ==========================================
    // REVOKE API KEY
    // ==========================================
    revoke: igniter.mutation({
      name: 'Revoke API Key',
      description: 'Revoke an API key (cannot be undone)',
      path: '/:id/revoke',
      method: 'POST',
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const { id } = request.params as { id: string }

        // Check permission
        const canManage = await apiKeysRepository.canManageKey(
          id,
          context.user.id,
          context.user.role,
          context.user.organizationId || undefined
        )

        if (!canManage) {
          return response.status(403).json({ error: 'Sem permissão para revogar esta chave' })
        }

        try {
          await apiKeysRepository.revoke(id, context.user.id)
          return response.json({
            success: true,
            message: 'API Key revogada com sucesso',
          })
        } catch (error: any) {
          console.error('Error revoking API key:', error)
          return response.status(500).json({ error: 'Erro ao revogar API Key' })
        }
      },
    }),

    // ==========================================
    // DELETE API KEY
    // ==========================================
    delete: igniter.mutation({
      name: 'Delete API Key',
      description: 'Permanently delete an API key',
      path: '/:id',
      method: 'DELETE',
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const { id } = request.params as { id: string }

        // Check permission
        const canManage = await apiKeysRepository.canManageKey(
          id,
          context.user.id,
          context.user.role,
          context.user.organizationId || undefined
        )

        if (!canManage) {
          return response.status(403).json({ error: 'Sem permissão para deletar esta chave' })
        }

        try {
          await apiKeysRepository.delete(id)
          return response.noContent()
        } catch (error: any) {
          console.error('Error deleting API key:', error)
          return response.status(500).json({ error: 'Erro ao deletar API Key' })
        }
      },
    }),

    // ==========================================
    // GET AVAILABLE SCOPES
    // ==========================================
    getScopes: igniter.query({
      name: 'Get Available Scopes',
      description: 'Get list of available API key scopes',
      path: '/scopes',
      method: 'GET',
      handler: async ({ response }) => {
        const scopeDescriptions: Record<string, string> = {
          'read': 'Acesso de leitura geral',
          'write': 'Acesso de escrita geral',
          'delete': 'Permissão para deletar recursos',
          'admin': 'Acesso administrativo completo',
          'instances:read': 'Listar e visualizar instâncias',
          'instances:write': 'Criar e gerenciar instâncias',
          'messages:read': 'Ler mensagens',
          'messages:write': 'Enviar mensagens',
          'contacts:read': 'Listar e visualizar contatos',
          'contacts:write': 'Criar e editar contatos',
          'webhooks:manage': 'Gerenciar webhooks',
          'sessions:read': 'Visualizar sessões de chat',
          'sessions:write': 'Gerenciar sessões de chat',
        }

        const scopes = API_KEY_SCOPES.map(scope => ({
          value: scope,
          label: scope,
          description: scopeDescriptions[scope] || scope,
        }))

        return response.json({ success: true, data: scopes })
      },
    }),

    // ==========================================
    // GET EXPIRATION OPTIONS
    // ==========================================
    getExpirationOptions: igniter.query({
      name: 'Get Expiration Options',
      description: 'Get list of available expiration options',
      path: '/expiration-options',
      method: 'GET',
      handler: async ({ response }) => {
        return response.json({ success: true, data: EXPIRATION_OPTIONS })
      },
    }),
  },
})
