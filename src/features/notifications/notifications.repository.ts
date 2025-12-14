/**
 * Notifications Repository
 *
 * Data access layer for notifications
 */

import { database } from '@/services/database'
import { NotificationType, Prisma } from '@prisma/client'
import type { CreateNotificationInput, UpdateNotificationInput, ListNotificationsQuery } from './notifications.schemas'

export const notificationsRepository = {
    /**
     * Create a new notification
     */
    async create(data: CreateNotificationInput) {
      return database.notification.create({
        data: {
          type: data.type as NotificationType,
          title: data.title,
          description: data.description,
          actionUrl: data.actionUrl,
          actionLabel: data.actionLabel,
          source: data.source,
          sourceId: data.sourceId,
          metadata: data.metadata as Prisma.JsonObject | undefined,
          userId: data.userId,
          organizationId: data.organizationId,
          role: data.role,
          isGlobal: data.isGlobal,
          scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        },
      })
    },

    /**
     * Get notification by ID
     */
    async findById(id: string) {
      return database.notification.findUnique({
        where: { id },
        include: {
          reads: true,
        },
      })
    },

    /**
     * Update notification
     */
    async update(id: string, data: UpdateNotificationInput) {
      return database.notification.update({
        where: { id },
        data: {
          ...(data.title && { title: data.title }),
          ...(data.description && { description: data.description }),
          ...(data.actionUrl !== undefined && { actionUrl: data.actionUrl }),
          ...(data.actionLabel !== undefined && { actionLabel: data.actionLabel }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          ...(data.scheduledFor !== undefined && {
            scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null
          }),
          ...(data.expiresAt !== undefined && {
            expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
          }),
        },
      })
    },

    /**
     * Delete notification
     */
    async delete(id: string) {
      return database.notification.delete({
        where: { id },
      })
    },

    /**
     * List notifications (admin view)
     */
    async list(query: ListNotificationsQuery) {
      const { page, limit, type, source, isActive, isGlobal } = query
      const skip = (page - 1) * limit

      const where: Prisma.NotificationWhereInput = {
        ...(type && { type: type as NotificationType }),
        ...(source && { source }),
        ...(isActive !== undefined && { isActive }),
        ...(isGlobal !== undefined && { isGlobal }),
      }

      const [data, total] = await Promise.all([
        database.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            _count: {
              select: { reads: true },
            },
          },
        }),
        database.notification.count({ where }),
      ])

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    },

    /**
     * Get notifications for a specific user
     */
    async getForUser(userId: string, organizationId: string | null, role: string, query: ListNotificationsQuery) {
      const { page, limit, type, unreadOnly } = query
      const skip = (page - 1) * limit
      const now = new Date()

      // Build where clause for notifications targeting this user
      const where: Prisma.NotificationWhereInput = {
        isActive: true,
        OR: [
          // Global notifications
          { isGlobal: true },
          // User-specific notifications
          { userId },
          // Organization-wide notifications
          ...(organizationId ? [{ organizationId }] : []),
          // Role-based notifications
          { role },
        ],
        AND: [
          // Filter by scheduled time
          {
            OR: [
              { scheduledFor: null },
              { scheduledFor: { lte: now } },
            ],
          },
          // Filter by expiration
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        ],
        ...(type && { type: type as NotificationType }),
      }

      const notifications = await database.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reads: {
            where: { userId },
          },
        },
      })

      // Map to include read status
      let result = notifications.map((n) => ({
        ...n,
        read: n.reads.length > 0,
        reads: undefined, // Remove reads array from response
      }))

      // Filter unread only if requested
      if (unreadOnly) {
        result = result.filter((n) => !n.read)
      }

      const total = await database.notification.count({ where })

      return {
        data: result,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    },

    /**
     * Get unread count for a user
     */
    async getUnreadCount(userId: string, organizationId: string | null, role: string) {
      const now = new Date()

      const notifications = await database.notification.findMany({
        where: {
          isActive: true,
          OR: [
            { isGlobal: true },
            { userId },
            ...(organizationId ? [{ organizationId }] : []),
            { role },
          ],
          AND: [
            {
              OR: [
                { scheduledFor: null },
                { scheduledFor: { lte: now } },
              ],
            },
            {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } },
              ],
            },
          ],
        },
        select: {
          id: true,
          reads: {
            where: { userId },
            select: { id: true },
          },
        },
      })

      return notifications.filter((n) => n.reads.length === 0).length
    },

    /**
     * Mark notification as read
     */
    async markAsRead(notificationId: string, userId: string) {
      return database.notificationRead.upsert({
        where: {
          notificationId_userId: {
            notificationId,
            userId,
          },
        },
        create: {
          notificationId,
          userId,
        },
        update: {
          readAt: new Date(),
        },
      })
    },

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId: string, organizationId: string | null, role: string) {
      const now = new Date()

      const notifications = await database.notification.findMany({
        where: {
          isActive: true,
          OR: [
            { isGlobal: true },
            { userId },
            ...(organizationId ? [{ organizationId }] : []),
            { role },
          ],
          AND: [
            {
              OR: [
                { scheduledFor: null },
                { scheduledFor: { lte: now } },
              ],
            },
            {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } },
              ],
            },
          ],
        },
        select: { id: true },
      })

      const createData = notifications.map((n) => ({
        notificationId: n.id,
        userId,
      }))

      // Use createMany with skipDuplicates
      await database.notificationRead.createMany({
        data: createData,
        skipDuplicates: true,
      })

      return { count: notifications.length }
    },

    /**
     * Delete old notifications
     */
    async deleteExpired() {
      const now = new Date()
      return database.notification.deleteMany({
        where: {
          expiresAt: { lt: now },
        },
      })
    },

    /**
     * Get notification types for dropdown
     */
    getTypes() {
      return [
        { value: 'MESSAGE', label: 'Mensagem', icon: 'MessageCircle', color: 'blue' },
        { value: 'USER', label: 'Usuario', icon: 'Users', color: 'purple' },
        { value: 'WARNING', label: 'Aviso', icon: 'AlertTriangle', color: 'yellow' },
        { value: 'INFO', label: 'Informativo', icon: 'Info', color: 'sky' },
        { value: 'SUCCESS', label: 'Sucesso', icon: 'Check', color: 'green' },
        { value: 'ERROR', label: 'Erro', icon: 'XCircle', color: 'red' },
        { value: 'SYSTEM', label: 'Sistema', icon: 'Settings', color: 'gray' },
        { value: 'CONNECTION', label: 'Conexao', icon: 'Wifi', color: 'emerald' },
      ]
    },
}
