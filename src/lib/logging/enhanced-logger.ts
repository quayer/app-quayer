/**
 * Enhanced Logger System
 *
 * Provides structured logging with:
 * - Better error messages for users
 * - Detailed context for developers
 * - Performance tracking
 * - Request tracing
 */

import { logger as baseLogger } from '@/services/logger'

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface LogContext {
  userId?: string
  organizationId?: string
  requestId?: string
  sessionId?: string
  feature?: string
  action?: string
  metadata?: Record<string, unknown>
}

export interface EnhancedError extends Error {
  statusCode?: number
  userMessage?: string
  code?: string
  details?: unknown
}

class EnhancedLogger {
  private requestId: string | null = null
  private isDevelopment = process.env.NODE_ENV === 'development'

  /**
   * Set request ID for tracing
   */
  setRequestId(id: string) {
    this.requestId = id
  }

  /**
   * Format log message with context
   */
  private formatMessage(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString()
    const requestId = this.requestId || context?.requestId || 'n/a'

    return {
      timestamp,
      level,
      message,
      requestId,
      ...context,
    }
  }

  /**
   * Log debug information (development only)
   */
  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      const formatted = this.formatMessage(LogLevel.DEBUG, message, context)
      baseLogger.debug(`[DEBUG] ${message}`, formatted)
    }
  }

  /**
   * Log general information
   */
  info(message: string, context?: LogContext) {
    const formatted = this.formatMessage(LogLevel.INFO, message, context)
    baseLogger.info(`[INFO] ${message}`, formatted)
  }

  /**
   * Log warnings
   */
  warn(message: string, context?: LogContext) {
    const formatted = this.formatMessage(LogLevel.WARN, message, context)
    baseLogger.warn(`[WARN] ${message}`, formatted)
  }

  /**
   * Log errors with enhanced context
   */
  error(error: Error | EnhancedError, context?: LogContext) {
    const enhancedError = error as EnhancedError
    const formatted = this.formatMessage(LogLevel.ERROR, error.message, {
      ...context,
      metadata: {
        ...context?.metadata,
        stack: this.isDevelopment ? error.stack : undefined,
        code: enhancedError.code,
        statusCode: enhancedError.statusCode,
        details: enhancedError.details,
      },
    })

    baseLogger.error(`[ERROR] ${error.message}`, formatted)

    // Log user-friendly message separately
    if (enhancedError.userMessage) {
      console.info(`[USER MESSAGE] ${enhancedError.userMessage}`)
    }
  }

  /**
   * Log fatal errors (crashes)
   */
  fatal(error: Error | EnhancedError, context?: LogContext) {
    const enhancedError = error as EnhancedError
    const formatted = this.formatMessage(LogLevel.FATAL, error.message, {
      ...context,
      metadata: {
        ...context?.metadata,
        stack: error.stack,
        code: enhancedError.code,
        statusCode: enhancedError.statusCode,
        details: enhancedError.details,
      },
    })

    baseLogger.error(`[FATAL] ${error.message}`, formatted)

    // Always show user message for fatal errors
    console.error(`[CRITICAL] ${enhancedError.userMessage || error.message}`)
  }

  /**
   * Log API request/response
   */
  api(method: string, path: string, duration: number, statusCode: number, context?: LogContext) {
    const level = statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO
    const message = `${method} ${path} - ${statusCode} (${duration}ms)`

    const formatted = this.formatMessage(level, message, {
      ...context,
      metadata: {
        method,
        path,
        duration,
        statusCode,
        ...context?.metadata,
      },
    })

    if (statusCode >= 400) {
      baseLogger.warn(message, formatted)
    } else {
      baseLogger.info(message, formatted)
    }
  }

  /**
   * Log database queries (development only)
   */
  query(query: string, duration: number, context?: LogContext) {
    if (this.isDevelopment) {
      const message = `Query executed in ${duration}ms`
      const formatted = this.formatMessage(LogLevel.DEBUG, message, {
        ...context,
        metadata: {
          query,
          duration,
          ...context?.metadata,
        },
      })

      baseLogger.debug(message, formatted)
    }
  }

  /**
   * Log performance metrics
   */
  performance(label: string, duration: number, context?: LogContext) {
    const message = `${label}: ${duration}ms`
    const formatted = this.formatMessage(LogLevel.INFO, message, {
      ...context,
      metadata: {
        label,
        duration,
        ...context?.metadata,
      },
    })

    baseLogger.info(message, formatted)
  }
}

/**
 * Enhanced logger instance
 */
export const enhancedLogger = new EnhancedLogger()

/**
 * Create user-friendly error
 */
export function createUserError(
  message: string,
  userMessage: string,
  options?: {
    code?: string
    statusCode?: number
    details?: unknown
  }
): EnhancedError {
  const error = new Error(message) as EnhancedError
  error.userMessage = userMessage
  error.code = options?.code
  error.statusCode = options?.statusCode
  error.details = options?.details

  return error
}

/**
 * Common error creators
 */
export const errors = {
  notFound: (resource: string) =>
    createUserError(
      `${resource} not found`,
      `${resource} não encontrado. Verifique se o ID está correto.`,
      { code: 'NOT_FOUND', statusCode: 404 }
    ),

  unauthorized: () =>
    createUserError(
      'Unauthorized access attempt',
      'Você não tem permissão para acessar este recurso.',
      { code: 'UNAUTHORIZED', statusCode: 401 }
    ),

  forbidden: () =>
    createUserError(
      'Forbidden access',
      'Acesso negado. Você não tem as permissões necessárias.',
      { code: 'FORBIDDEN', statusCode: 403 }
    ),

  validation: (details: unknown) =>
    createUserError(
      'Validation failed',
      'Dados inválidos. Verifique os campos e tente novamente.',
      { code: 'VALIDATION_ERROR', statusCode: 400, details }
    ),

  database: (operation: string) =>
    createUserError(
      `Database ${operation} failed`,
      'Erro ao acessar o banco de dados. Tente novamente em alguns instantes.',
      { code: 'DATABASE_ERROR', statusCode: 500 }
    ),

  external: (service: string) =>
    createUserError(
      `External service ${service} failed`,
      `Erro ao comunicar com ${service}. O serviço pode estar temporariamente indisponível.`,
      { code: 'EXTERNAL_SERVICE_ERROR', statusCode: 502 }
    ),

  rateLimit: () =>
    createUserError(
      'Rate limit exceeded',
      'Muitas requisições. Aguarde alguns instantes antes de tentar novamente.',
      { code: 'RATE_LIMIT', statusCode: 429 }
    ),
}
