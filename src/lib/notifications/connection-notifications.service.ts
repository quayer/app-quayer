/**
 * Connection Notifications Service
 *
 * Service for sending notifications related to WhatsApp connection status changes
 */

import { notificationsRepository } from '@/features/notifications/notifications.repository'
import { database } from '@/services/database'

export interface ConnectionNotificationContext {
  connectionId: string
  connectionName: string
  organizationId: string
  reason?: string
  previousStatus?: string
}

export const connectionNotificationsService = {
  /**
   * Send notification when a WhatsApp connection is lost
   */
  async notifyDisconnection(context: ConnectionNotificationContext) {
    try {
      // Get all users in the organization who should be notified
      const orgMembers = await database.userOrganization.findMany({
        where: {
          organizationId: context.organizationId,
          isActive: true,
          role: { in: ['master', 'manager'] }, // Only notify masters and managers
        },
        select: { userId: true },
      })

      // Create notification for the organization
      await notificationsRepository.create({
        type: 'CONNECTION',
        title: 'WhatsApp Desconectado',
        description: `A conexao "${context.connectionName}" foi desconectada${context.reason ? `: ${context.reason}` : '.'}`,
        actionUrl: `/integracoes/${context.connectionId}`,
        actionLabel: 'Reconectar',
        source: 'connection',
        sourceId: context.connectionId,
        metadata: {
          connectionId: context.connectionId,
          connectionName: context.connectionName,
          reason: context.reason,
          previousStatus: context.previousStatus,
          eventType: 'disconnection',
          timestamp: new Date().toISOString(),
        },
        organizationId: context.organizationId,
        isGlobal: false,
      })

      console.log('[ConnectionNotifications] Disconnection notification sent', {
        connectionId: context.connectionId,
        organizationId: context.organizationId,
        notifiedUsers: orgMembers.length,
      })
    } catch (error) {
      console.error('[ConnectionNotifications] Failed to send disconnection notification:', error)
      // Don't throw - notifications should not block the main operation
    }
  },

  /**
   * Send notification when connection is lost unexpectedly
   */
  async notifyConnectionLost(context: ConnectionNotificationContext) {
    try {
      await notificationsRepository.create({
        type: 'WARNING',
        title: 'Conexao WhatsApp Perdida',
        description: `A conexao "${context.connectionName}" foi perdida inesperadamente. Verifique seu dispositivo ou reconecte.`,
        actionUrl: `/integracoes/${context.connectionId}`,
        actionLabel: 'Verificar',
        source: 'connection',
        sourceId: context.connectionId,
        metadata: {
          connectionId: context.connectionId,
          connectionName: context.connectionName,
          reason: context.reason || 'connection_lost',
          previousStatus: context.previousStatus,
          eventType: 'connection_lost',
          timestamp: new Date().toISOString(),
        },
        organizationId: context.organizationId,
        isGlobal: false,
      })

      console.log('[ConnectionNotifications] Connection lost notification sent', {
        connectionId: context.connectionId,
      })
    } catch (error) {
      console.error('[ConnectionNotifications] Failed to send connection lost notification:', error)
    }
  },

  /**
   * Send notification when there's a connection error
   */
  async notifyConnectionError(context: ConnectionNotificationContext & { error?: string }) {
    try {
      await notificationsRepository.create({
        type: 'ERROR',
        title: 'Erro na Conexao WhatsApp',
        description: `Ocorreu um erro na conexao "${context.connectionName}": ${context.error || context.reason || 'Erro desconhecido'}`,
        actionUrl: `/integracoes/${context.connectionId}`,
        actionLabel: 'Ver Detalhes',
        source: 'connection',
        sourceId: context.connectionId,
        metadata: {
          connectionId: context.connectionId,
          connectionName: context.connectionName,
          error: context.error || context.reason,
          eventType: 'error',
          timestamp: new Date().toISOString(),
        },
        organizationId: context.organizationId,
        isGlobal: false,
      })

      console.log('[ConnectionNotifications] Connection error notification sent', {
        connectionId: context.connectionId,
      })
    } catch (error) {
      console.error('[ConnectionNotifications] Failed to send error notification:', error)
    }
  },

  /**
   * Send notification when QR Code expires multiple times
   */
  async notifyQRCodeTimeout(context: ConnectionNotificationContext & { attemptCount: number }) {
    try {
      if (context.attemptCount < 3) {
        return // Only notify after 3 failed attempts
      }

      await notificationsRepository.create({
        type: 'WARNING',
        title: 'QR Code Expirado',
        description: `O QR Code de "${context.connectionName}" expirou ${context.attemptCount} vezes. Por favor, escaneie o codigo para conectar.`,
        actionUrl: `/integracoes/${context.connectionId}`,
        actionLabel: 'Conectar Agora',
        source: 'connection',
        sourceId: context.connectionId,
        metadata: {
          connectionId: context.connectionId,
          connectionName: context.connectionName,
          attemptCount: context.attemptCount,
          eventType: 'qr_timeout',
          timestamp: new Date().toISOString(),
        },
        organizationId: context.organizationId,
        isGlobal: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Expire in 24h
      })

      console.log('[ConnectionNotifications] QR timeout notification sent', {
        connectionId: context.connectionId,
        attemptCount: context.attemptCount,
      })
    } catch (error) {
      console.error('[ConnectionNotifications] Failed to send QR timeout notification:', error)
    }
  },

  /**
   * Send success notification when connected
   */
  async notifyConnected(context: ConnectionNotificationContext) {
    try {
      await notificationsRepository.create({
        type: 'SUCCESS',
        title: 'WhatsApp Conectado',
        description: `A conexao "${context.connectionName}" foi estabelecida com sucesso!`,
        actionUrl: `/integracoes/${context.connectionId}`,
        actionLabel: 'Ver Canal',
        source: 'connection',
        sourceId: context.connectionId,
        metadata: {
          connectionId: context.connectionId,
          connectionName: context.connectionName,
          eventType: 'connected',
          timestamp: new Date().toISOString(),
        },
        organizationId: context.organizationId,
        isGlobal: false,
        expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(), // Expire in 1h
      })
    } catch (error) {
      console.error('[ConnectionNotifications] Failed to send connected notification:', error)
    }
  },
}
