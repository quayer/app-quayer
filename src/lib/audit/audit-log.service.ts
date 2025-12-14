/**
 * AuditLog Service
 *
 * Persists audit logs to the database for tracking all system operations.
 * Integrates with the enhanced logger for console output.
 */

import { database } from '@/services/database'
import { enhancedLogger } from '@/lib/logging/enhanced-logger'
import { loggerService } from '@/lib/logs/logger.service'
import { LogLevel } from '@prisma/client'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'register'
  | 'connect'
  | 'disconnect'
  | 'view'
  | 'export'
  | 'import'
  | 'send_message'
  | 'receive_message'
  | 'webhook_received'
  | 'webhook_error'
  | 'api_error'
  | 'permission_denied'
  | 'rate_limited'
  | 'validation_error'
  | 'external_api_error'
  | 'system_error'

export type AuditResource =
  | 'user'
  | 'organization'
  | 'instance'
  | 'connection'
  | 'project'
  | 'message'
  | 'session'
  | 'webhook'
  | 'department'
  | 'label'
  | 'invitation'
  | 'auth'
  | 'api'
  | 'system'

export type AuditLevel = 'info' | 'warn' | 'error'

export interface AuditLogInput {
  action: AuditAction
  resource: AuditResource
  resourceId?: string
  userId: string
  organizationId?: string | null
  metadata?: Record<string, unknown>
  ipAddress?: string
  level?: AuditLevel
  errorMessage?: string
  errorStack?: string
}

export interface AuditLogError {
  action: AuditAction
  resource: AuditResource
  resourceId?: string
  userId?: string
  organizationId?: string | null
  error: Error
  metadata?: Record<string, unknown>
  ipAddress?: string
}

class AuditLogService {
  private static instance: AuditLogService

  private constructor() {}

  static getInstance(): AuditLogService {
    if (!AuditLogService.instance) {
      AuditLogService.instance = new AuditLogService()
    }
    return AuditLogService.instance
  }

  /**
   * Map AuditLevel to LogLevel for LogEntry persistence
   */
  private mapToLogLevel(level: AuditLevel): LogLevel {
    switch (level) {
      case 'error':
        return 'ERROR'
      case 'warn':
        return 'WARN'
      default:
        return 'INFO'
    }
  }

  /**
   * Log an operation (info level)
   *
   * BRIDGE: Also persists to LogEntry table for unified Logs UI
   */
  async log(input: AuditLogInput): Promise<void> {
    const { level = 'info', ...data } = input

    try {
      // Persist to AuditLog database (original behavior)
      await database.auditLog.create({
        data: {
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId || null,
          userId: data.userId,
          organizationId: data.organizationId || null,
          metadata: {
            ...(data.metadata || {}),
            level,
            errorMessage: data.errorMessage,
            errorStack: data.errorStack,
          },
          ipAddress: data.ipAddress || null,
        },
      })

      // BRIDGE: Also persist to LogEntry for unified Logs UI
      const message = `[AUDIT] ${data.action.toUpperCase()} ${data.resource}${data.resourceId ? `:${data.resourceId}` : ''}`

      await loggerService.log(this.mapToLogLevel(level), message, {
        source: 'audit',
        action: data.action,
        context: {
          userId: data.userId,
          organizationId: data.organizationId || undefined,
          ipAddress: data.ipAddress,
        },
        metadata: {
          resource: data.resource,
          resourceId: data.resourceId,
          ...data.metadata,
        },
        stackTrace: data.errorStack,
        details: data.errorMessage,
        tags: ['audit', data.resource, data.action],
      }).catch((err) => {
        // Non-blocking: if LogEntry fails, AuditLog still persisted
        console.warn('[AUDIT SERVICE] Bridge to LogEntry failed:', err.message)
      })

      // Also log to console via enhanced logger
      if (level === 'error') {
        enhancedLogger.error(new Error(data.errorMessage || message), {
          userId: data.userId,
          organizationId: data.organizationId || undefined,
          feature: 'audit',
          action: data.action,
          metadata: data.metadata,
        })
      } else if (level === 'warn') {
        enhancedLogger.warn(message, {
          userId: data.userId,
          organizationId: data.organizationId || undefined,
          feature: 'audit',
          action: data.action,
          metadata: data.metadata,
        })
      } else {
        enhancedLogger.info(message, {
          userId: data.userId,
          organizationId: data.organizationId || undefined,
          feature: 'audit',
          action: data.action,
          metadata: data.metadata,
        })
      }
    } catch (dbError) {
      // If database fails, at least log to console
      console.error('[AUDIT SERVICE] Failed to persist audit log:', dbError)
      console.error('[AUDIT DATA]', input)
    }
  }

  /**
   * Log an error with full stack trace
   */
  async logError(input: AuditLogError): Promise<void> {
    const errorMessage = input.error.message
    const errorStack = input.error.stack

    await this.log({
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      userId: input.userId || 'system',
      organizationId: input.organizationId,
      metadata: {
        ...input.metadata,
        errorName: input.error.name,
      },
      ipAddress: input.ipAddress,
      level: 'error',
      errorMessage,
      errorStack,
    })
  }

  /**
   * Log authentication events
   */
  async logAuth(
    action: 'login' | 'logout' | 'login_failed' | 'register',
    userId: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      action,
      resource: 'auth',
      userId,
      metadata,
      ipAddress,
      level: action === 'login_failed' ? 'warn' : 'info',
    })
  }

  /**
   * Log CRUD operations
   */
  async logCrud(
    action: 'create' | 'update' | 'delete' | 'view',
    resource: AuditResource,
    resourceId: string,
    userId: string,
    organizationId?: string | null,
    metadata?: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      action,
      resource,
      resourceId,
      userId,
      organizationId,
      metadata,
      ipAddress,
    })
  }

  /**
   * Log API errors
   */
  async logApiError(
    error: Error,
    endpoint: string,
    method: string,
    userId?: string,
    organizationId?: string | null,
    metadata?: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    await this.logError({
      action: 'api_error',
      resource: 'api',
      userId,
      organizationId,
      error,
      metadata: {
        ...metadata,
        endpoint,
        method,
      },
      ipAddress,
    })
  }

  /**
   * Log webhook events
   */
  async logWebhook(
    action: 'webhook_received' | 'webhook_error',
    provider: string,
    webhookId?: string,
    organizationId?: string | null,
    metadata?: Record<string, unknown>,
    error?: Error
  ): Promise<void> {
    if (error) {
      await this.logError({
        action,
        resource: 'webhook',
        resourceId: webhookId,
        organizationId,
        error,
        metadata: { ...metadata, provider },
      })
    } else {
      await this.log({
        action,
        resource: 'webhook',
        resourceId: webhookId,
        userId: 'webhook-system',
        organizationId,
        metadata: { ...metadata, provider },
      })
    }
  }

  /**
   * Log WhatsApp connection events
   */
  async logConnection(
    action: 'connect' | 'disconnect',
    instanceId: string,
    userId: string,
    organizationId?: string | null,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action,
      resource: 'connection',
      resourceId: instanceId,
      userId,
      organizationId,
      metadata,
    })
  }

  /**
   * Log message events
   */
  async logMessage(
    action: 'send_message' | 'receive_message',
    messageId: string,
    sessionId: string,
    userId: string,
    organizationId?: string | null,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action,
      resource: 'message',
      resourceId: messageId,
      userId,
      organizationId,
      metadata: { ...metadata, sessionId },
    })
  }

  /**
   * Log permission denied
   */
  async logPermissionDenied(
    resource: AuditResource,
    resourceId: string | undefined,
    userId: string,
    organizationId?: string | null,
    requiredPermission?: string,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      action: 'permission_denied',
      resource,
      resourceId,
      userId,
      organizationId,
      metadata: { requiredPermission },
      ipAddress,
      level: 'warn',
    })
  }

  /**
   * Log validation errors
   */
  async logValidationError(
    resource: AuditResource,
    userId: string,
    validationErrors: unknown,
    organizationId?: string | null,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      action: 'validation_error',
      resource,
      userId,
      organizationId,
      metadata: { validationErrors },
      ipAddress,
      level: 'warn',
    })
  }

  /**
   * Log external API errors (UAZapi, etc)
   */
  async logExternalApiError(
    service: string,
    error: Error,
    userId?: string,
    organizationId?: string | null,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.logError({
      action: 'external_api_error',
      resource: 'api',
      userId,
      organizationId,
      error,
      metadata: { ...metadata, service },
    })
  }

  /**
   * Log system errors
   */
  async logSystemError(
    error: Error,
    component: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.logError({
      action: 'system_error',
      resource: 'system',
      error,
      metadata: { ...metadata, component },
    })
  }
}

// Export singleton instance
export const auditLog = AuditLogService.getInstance()
