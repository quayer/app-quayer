/**
 * Notifications Controller
 *
 * API endpoints for notification management
 */

import { igniter } from '@/igniter'
import { notificationsRepository } from '../notifications.repository'
import {
  createNotificationSchema,
  updateNotificationSchema,
  listNotificationsQuerySchema,
} from '../notifications.schemas'
import { authProcedure, adminProcedure } from '@/features/auth/procedures/auth.procedure'

export const notificationsController = igniter.controller({
  name: 'notifications',
  path: '/notifications',
  description: 'Notification management for users and admins',
  actions: {
    // ==========================================
    // LIST ALL NOTIFICATIONS (Admin only)
    // ==========================================
    list: igniter.query({
      name: 'List All Notifications',
      description: 'List all notifications (admin only)',
      path: '/',
      method: 'GET',
      use: [adminProcedure()],
      query: listNotificationsQuerySchema,
      handler: async ({ request, context, response }) => {
        // Admin authentication enforced by adminProcedure
        const query = request.query as {
          page?: number
          limit?: number
          type?: string
          source?: string
          isActive?: boolean
          isGlobal?: boolean
        }

        const result = await notificationsRepository.list({
          page: query.page || 1,
          limit: query.limit || 20,
          type: query.type as any,
          source: query.source,
          isActive: query.isActive,
          isGlobal: query.isGlobal,
        })

        return response.success({
          data: result.data,
          pagination: result.pagination,
        })
      },
    }),

    // ==========================================
    // GET MY NOTIFICATIONS
    // ==========================================
    my: igniter.query({
      name: 'Get My Notifications',
      description: 'Get notifications for the current user',
      path: '/my',
      method: 'GET',
      use: [authProcedure({ required: true })],
      query: listNotificationsQuerySchema,
      handler: async ({ request, context, response }) => {
        // Authentication enforced by authProcedure
        const user = context.auth?.session?.user
        if (!user) {
          return response.unauthorized('Usuário não autenticado')
        }

        const query = request.query as {
          page?: number
          limit?: number
          type?: string
          unreadOnly?: boolean
        }

        const result = await notificationsRepository.getForUser(
          user.id,
          (user as any)?.organizationId || null,
          user.role,
          {
            page: query.page || 1,
            limit: query.limit || 20,
            type: query.type as any,
            unreadOnly: query.unreadOnly,
          }
        )

        return response.success({
          data: result.data,
          pagination: result.pagination,
        })
      },
    }),

    // ==========================================
    // GET UNREAD COUNT
    // ==========================================
    unreadCount: igniter.query({
      name: 'Get Unread Count',
      description: 'Get unread notification count for the current user',
      path: '/unread-count',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        // Authentication enforced by authProcedure
        const user = context.auth?.session?.user
        if (!user) {
          return response.unauthorized('Usuário não autenticado')
        }

        const count = await notificationsRepository.getUnreadCount(
          user.id,
          (user as any)?.organizationId || null,
          user.role
        )

        return response.success({
          data: { count },
        })
      },
    }),

    // ==========================================
    // GET NOTIFICATION BY ID
    // ==========================================
    getById: igniter.query({
      name: 'Get Notification By ID',
      description: 'Get a single notification by ID',
      path: '/:id',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        // Authentication enforced by authProcedure
        const user = context.auth?.session?.user
        if (!user) {
          return response.unauthorized('Usuário não autenticado')
        }

        const { id } = request.params as { id: string }
        const notification = await notificationsRepository.findById(id)

        if (!notification) {
          return response.notFound('Notificação não encontrada')
        }

        // Check access
        const canAccess =
          user.role === 'admin' ||
          notification.isGlobal ||
          notification.userId === user.id ||
          notification.organizationId === (user as any)?.organizationId ||
          notification.role === user.role

        if (!canAccess) {
          return response.forbidden('Acesso negado')
        }

        return response.success({
          data: notification,
        })
      },
    }),

    // ==========================================
    // CREATE NOTIFICATION (Admin only)
    // ==========================================
    create: igniter.mutation({
      name: 'Create Notification',
      description: 'Create a new notification (admin only)',
      path: '/',
      method: 'POST',
      use: [adminProcedure()],
      body: createNotificationSchema,
      handler: async ({ request, context, response }) => {
        // Admin authentication enforced by adminProcedure
        const data = request.body

        // Validate that at least one target is specified
        if (!data.userId && !data.organizationId && !data.role && !data.isGlobal) {
          return response.badRequest('Especifique pelo menos um destinatário')
        }

        try {
          const notification = await notificationsRepository.create({
            ...data,
            isGlobal: data.isGlobal ?? false,
          })
          return response.success({
            data: notification,
            message: 'Notificação criada com sucesso',
          })
        } catch (error: any) {
          console.error('Error creating notification:', error)
          return (response as any).error('Erro ao criar notificação')
        }
      },
    }),

    // ==========================================
    // UPDATE NOTIFICATION (Admin only)
    // ==========================================
    update: igniter.mutation({
      name: 'Update Notification',
      description: 'Update a notification (admin only)',
      path: '/:id',
      method: 'PUT',
      use: [adminProcedure()],
      body: updateNotificationSchema,
      handler: async ({ request, context, response }) => {
        // Admin authentication enforced by adminProcedure
        const { id } = request.params as { id: string }

        try {
          const notification = await notificationsRepository.update(id, request.body)
          return response.success({
            data: notification,
            message: 'Notificação atualizada com sucesso',
          })
        } catch (error: any) {
          console.error('Error updating notification:', error)
          return (response as any).error('Erro ao atualizar notificação')
        }
      },
    }),

    // ==========================================
    // DELETE NOTIFICATION (Admin only)
    // ==========================================
    delete: igniter.mutation({
      name: 'Delete Notification',
      description: 'Delete a notification (admin only)',
      path: '/:id',
      method: 'DELETE',
      use: [adminProcedure()],
      handler: async ({ request, context, response }) => {
        // Admin authentication enforced by adminProcedure
        const { id } = request.params as { id: string }

        try {
          await notificationsRepository.delete(id)
          return response.noContent()
        } catch (error: any) {
          console.error('Error deleting notification:', error)
          return (response as any).error('Erro ao excluir notificação')
        }
      },
    }),

    // ==========================================
    // MARK AS READ
    // ==========================================
    markAsRead: igniter.mutation({
      name: 'Mark As Read',
      description: 'Mark a notification as read',
      path: '/:id/read',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        // Authentication enforced by authProcedure
        const user = context.auth?.session?.user
        if (!user) {
          return response.unauthorized('Usuário não autenticado')
        }

        const { id } = request.params as { id: string }

        try {
          await notificationsRepository.markAsRead(id, user.id)
          return response.success({
            message: 'Notificação marcada como lida',
          })
        } catch (error: any) {
          console.error('Error marking notification as read:', error)
          return (response as any).error('Erro ao marcar notificação como lida')
        }
      },
    }),

    // ==========================================
    // MARK ALL AS READ
    // ==========================================
    markAllAsRead: igniter.mutation({
      name: 'Mark All As Read',
      description: 'Mark all notifications as read for the current user',
      path: '/mark-all-read',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        // Authentication enforced by authProcedure
        const user = context.auth?.session?.user
        if (!user) {
          return response.unauthorized('Usuário não autenticado')
        }

        try {
          const result = await notificationsRepository.markAllAsRead(
            user.id,
            (user as any)?.organizationId || null,
            user.role
          )
          return response.success({
            data: result,
            message: 'Todas as notificações foram marcadas como lidas',
          })
        } catch (error: any) {
          console.error('Error marking all notifications as read:', error)
          return (response as any).error('Erro ao marcar notificações como lidas')
        }
      },
    }),

    // ==========================================
    // GET NOTIFICATION TYPES
    // ==========================================
    getTypes: igniter.query({
      name: 'Get Notification Types',
      description: 'Get available notification types',
      path: '/types',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ context, response }) => {
        // Authentication enforced by authProcedure
        const types = notificationsRepository.getTypes()
        return response.success({
          data: types,
        })
      },
    }),

    // ==========================================
    // CLEANUP EXPIRED (Admin only)
    // ==========================================
    cleanup: igniter.mutation({
      name: 'Cleanup Expired',
      description: 'Clean up expired notifications (admin only)',
      path: '/cleanup',
      method: 'POST',
      use: [adminProcedure()],
      handler: async ({ context, response }) => {
        // Admin authentication enforced by adminProcedure
        try {
          const result = await notificationsRepository.deleteExpired()
          return response.success({
            data: { deleted: result.count },
            message: `${result.count} notificações expiradas foram removidas`,
          })
        } catch (error: any) {
          console.error('Error cleaning up notifications:', error)
          return (response as any).error('Erro ao limpar notificações')
        }
      },
    }),
  },
})
