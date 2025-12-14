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
      query: listNotificationsQuerySchema,
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        // Only admins can see all notifications
        if (context.user.role !== 'admin') {
          return response.status(403).json({ error: 'Acesso negado' })
        }

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

        return response.json({
          success: true,
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
      query: listNotificationsQuerySchema,
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const query = request.query as {
          page?: number
          limit?: number
          type?: string
          unreadOnly?: boolean
        }

        const result = await notificationsRepository.getForUser(
          context.user.id,
          context.user.organizationId || null,
          context.user.role,
          {
            page: query.page || 1,
            limit: query.limit || 20,
            type: query.type as any,
            unreadOnly: query.unreadOnly,
          }
        )

        return response.json({
          success: true,
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
      handler: async ({ context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const count = await notificationsRepository.getUnreadCount(
          context.user.id,
          context.user.organizationId || null,
          context.user.role
        )

        return response.json({
          success: true,
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
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const { id } = request.params as { id: string }
        const notification = await notificationsRepository.findById(id)

        if (!notification) {
          return response.status(404).json({ error: 'Notificação não encontrada' })
        }

        // Check access
        const canAccess =
          context.user.role === 'admin' ||
          notification.isGlobal ||
          notification.userId === context.user.id ||
          notification.organizationId === context.user.organizationId ||
          notification.role === context.user.role

        if (!canAccess) {
          return response.status(403).json({ error: 'Acesso negado' })
        }

        return response.json({
          success: true,
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
      body: createNotificationSchema,
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        // Only admins can create notifications
        if (context.user.role !== 'admin') {
          return response.status(403).json({ error: 'Apenas administradores podem criar notificações' })
        }

        const data = request.body

        // Validate that at least one target is specified
        if (!data.userId && !data.organizationId && !data.role && !data.isGlobal) {
          return response.status(400).json({ error: 'Especifique pelo menos um destinatário' })
        }

        try {
          const notification = await notificationsRepository.create(data)
          return response.json({
            success: true,
            data: notification,
            message: 'Notificação criada com sucesso',
          })
        } catch (error: any) {
          console.error('Error creating notification:', error)
          return response.status(500).json({ error: 'Erro ao criar notificação' })
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
      body: updateNotificationSchema,
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        if (context.user.role !== 'admin') {
          return response.status(403).json({ error: 'Apenas administradores podem editar notificações' })
        }

        const { id } = request.params as { id: string }

        try {
          const notification = await notificationsRepository.update(id, request.body)
          return response.json({
            success: true,
            data: notification,
            message: 'Notificação atualizada com sucesso',
          })
        } catch (error: any) {
          console.error('Error updating notification:', error)
          return response.status(500).json({ error: 'Erro ao atualizar notificação' })
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
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        if (context.user.role !== 'admin') {
          return response.status(403).json({ error: 'Apenas administradores podem excluir notificações' })
        }

        const { id } = request.params as { id: string }

        try {
          await notificationsRepository.delete(id)
          return response.json({
            success: true,
            message: 'Notificação excluída com sucesso',
          })
        } catch (error: any) {
          console.error('Error deleting notification:', error)
          return response.status(500).json({ error: 'Erro ao excluir notificação' })
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
      handler: async ({ request, context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const { id } = request.params as { id: string }

        try {
          await notificationsRepository.markAsRead(id, context.user.id)
          return response.json({
            success: true,
            message: 'Notificação marcada como lida',
          })
        } catch (error: any) {
          console.error('Error marking notification as read:', error)
          return response.status(500).json({ error: 'Erro ao marcar notificação como lida' })
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
      handler: async ({ context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        try {
          const result = await notificationsRepository.markAllAsRead(
            context.user.id,
            context.user.organizationId || null,
            context.user.role
          )
          return response.json({
            success: true,
            data: result,
            message: 'Todas as notificações foram marcadas como lidas',
          })
        } catch (error: any) {
          console.error('Error marking all notifications as read:', error)
          return response.status(500).json({ error: 'Erro ao marcar notificações como lidas' })
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
      handler: async ({ context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        const types = notificationsRepository.getTypes()
        return response.json({
          success: true,
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
      handler: async ({ context, response }) => {
        if (!context.user) {
          return response.status(401).json({ error: 'Não autenticado' })
        }

        if (context.user.role !== 'admin') {
          return response.status(403).json({ error: 'Acesso negado' })
        }

        try {
          const result = await notificationsRepository.deleteExpired()
          return response.json({
            success: true,
            data: { deleted: result.count },
            message: `${result.count} notificações expiradas foram removidas`,
          })
        } catch (error: any) {
          console.error('Error cleaning up notifications:', error)
          return response.status(500).json({ error: 'Erro ao limpar notificações' })
        }
      },
    }),
  },
})
