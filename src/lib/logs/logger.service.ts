/**
 * Centralized Logger Service
 *
 * Provides structured logging with database persistence and SSE broadcasting
 */

import { database } from '@/services/database'
import { LogLevel } from '@prisma/client'
import { EventEmitter } from 'events'

// Global event emitter for SSE broadcasting
export const logEmitter = new EventEmitter()
logEmitter.setMaxListeners(100)

export interface LogContext {
  userId?: string
  organizationId?: string
  connectionId?: string
  sessionId?: string
  requestId?: string
  requestPath?: string
  requestMethod?: string
  statusCode?: number
  duration?: number
  ipAddress?: string
  userAgent?: string
}

export interface LogMetadata {
  [key: string]: any
}

export interface LogOptions {
  source: string
  action?: string
  context?: LogContext
  metadata?: LogMetadata
  tags?: string[]
  stackTrace?: string
  details?: string
}

export interface LogEntryOutput {
  id: string
  timestamp: Date
  level: LogLevel
  source: string
  action: string | null
  message: string
  details: string | null
  stackTrace: string | null
  context: any
  metadata: any
  requestId: string | null
  requestPath: string | null
  requestMethod: string | null
  statusCode: number | null
  duration: number | null
  userId: string | null
  organizationId: string | null
  connectionId: string | null
  sessionId: string | null
  ipAddress: string | null
  userAgent: string | null
  tags: string[]
}

class LoggerService {
  private consoleEnabled = true
  private databaseEnabled = true
  private broadcastEnabled = true

  // Color codes for console
  private colors = {
    DEBUG: '\x1b[36m',   // Cyan
    INFO: '\x1b[32m',    // Green
    WARN: '\x1b[33m',    // Yellow
    ERROR: '\x1b[31m',   // Red
    CRITICAL: '\x1b[35m', // Magenta
    RESET: '\x1b[0m',
  }

  private levelEmoji = {
    DEBUG: '🔵',
    INFO: '🟢',
    WARN: '🟡',
    ERROR: '🔴',
    CRITICAL: '💀',
  }

  async log(level: LogLevel, message: string, options: LogOptions): Promise<LogEntryOutput | null> {
    const timestamp = new Date()
    const { source, action, context, metadata, tags, stackTrace, details } = options

    // Console output
    if (this.consoleEnabled) {
      this.logToConsole(level, message, source, action, timestamp)
    }

    // Database persistence
    let logEntry: LogEntryOutput | null = null
    if (this.databaseEnabled) {
      try {
        logEntry = await database.logEntry.create({
          data: {
            timestamp,
            level,
            source,
            action,
            message,
            details,
            stackTrace,
            context: context ? JSON.parse(JSON.stringify(context)) : undefined,
            metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
            requestId: context?.requestId,
            requestPath: context?.requestPath,
            requestMethod: context?.requestMethod,
            statusCode: context?.statusCode,
            duration: context?.duration,
            userId: context?.userId,
            organizationId: context?.organizationId,
            connectionId: context?.connectionId,
            sessionId: context?.sessionId,
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
            tags: tags ?? [],
          },
        })
      } catch (error) {
        console.error('[Logger] Failed to persist log:', error)
      }
    }

    // Broadcast via SSE
    if (this.broadcastEnabled && logEntry) {
      logEmitter.emit('log', logEntry)
    }

    return logEntry
  }

  private logToConsole(
    level: LogLevel,
    message: string,
    source: string,
    action: string | undefined,
    timestamp: Date
  ) {
    const color = this.colors[level] || this.colors.INFO
    const emoji = this.levelEmoji[level] || '📝'
    const timeStr = timestamp.toISOString().split('T')[1].split('.')[0]
    const actionStr = action ? `:${action}` : ''

    console.log(
      `${color}[${timeStr}] ${emoji} [${level}] [${source}${actionStr}]${this.colors.RESET} ${message}`
    )
  }

  // Convenience methods
  async debug(message: string, options: LogOptions) {
    return this.log('DEBUG', message, options)
  }

  async info(message: string, options: LogOptions) {
    return this.log('INFO', message, options)
  }

  async warn(message: string, options: LogOptions) {
    return this.log('WARN', message, options)
  }

  async error(message: string, options: LogOptions & { error?: Error }) {
    const stackTrace = options.error?.stack || options.stackTrace
    return this.log('ERROR', message, { ...options, stackTrace })
  }

  async critical(message: string, options: LogOptions & { error?: Error }) {
    const stackTrace = options.error?.stack || options.stackTrace
    return this.log('CRITICAL', message, { ...options, stackTrace })
  }

  // Query logs
  async query(params: {
    level?: LogLevel
    source?: string
    userId?: string
    organizationId?: string
    search?: string
    startDate?: Date
    endDate?: Date
    limit?: number
    offset?: number
  }) {
    const {
      level,
      source,
      userId,
      organizationId,
      search,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = params

    const where: any = {}

    if (level) where.level = level
    if (source) where.source = source
    if (userId) where.userId = userId
    if (organizationId) where.organizationId = organizationId
    if (startDate || endDate) {
      where.timestamp = {}
      if (startDate) where.timestamp.gte = startDate
      if (endDate) where.timestamp.lte = endDate
    }
    if (search) {
      where.OR = [
        { message: { contains: search, mode: 'insensitive' } },
        { details: { contains: search, mode: 'insensitive' } },
        { action: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [logs, total] = await Promise.all([
      database.logEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      database.logEntry.count({ where }),
    ])

    return { logs, total, limit, offset }
  }

  // Get log statistics
  async getStats(period: 'hour' | 'day' | 'week' = 'day') {
    const now = new Date()
    let startDate: Date

    switch (period) {
      case 'hour':
        startDate = new Date(now.getTime() - 60 * 60 * 1000)
        break
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
    }

    const [total, byLevel, bySourcce, recentErrors] = await Promise.all([
      database.logEntry.count({
        where: { timestamp: { gte: startDate } },
      }),
      database.logEntry.groupBy({
        by: ['level'],
        where: { timestamp: { gte: startDate } },
        _count: true,
      }),
      database.logEntry.groupBy({
        by: ['source'],
        where: { timestamp: { gte: startDate } },
        _count: true,
        orderBy: { _count: { source: 'desc' } },
        take: 10,
      }),
      database.logEntry.findMany({
        where: {
          timestamp: { gte: startDate },
          level: { in: ['ERROR', 'CRITICAL'] },
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
    ])

    const levelCounts = byLevel.reduce((acc, item) => {
      acc[item.level] = item._count
      return acc
    }, {} as Record<string, number>)

    const sourceCounts = bySourcce.map(item => ({
      source: item.source,
      count: item._count,
    }))

    return {
      period,
      startDate,
      endDate: now,
      total,
      byLevel: {
        DEBUG: levelCounts.DEBUG || 0,
        INFO: levelCounts.INFO || 0,
        WARN: levelCounts.WARN || 0,
        ERROR: levelCounts.ERROR || 0,
        CRITICAL: levelCounts.CRITICAL || 0,
      },
      bySource: sourceCounts,
      recentErrors,
    }
  }

  // Configuration
  setConsoleEnabled(enabled: boolean) {
    this.consoleEnabled = enabled
  }

  setDatabaseEnabled(enabled: boolean) {
    this.databaseEnabled = enabled
  }

  setBroadcastEnabled(enabled: boolean) {
    this.broadcastEnabled = enabled
  }
}

export const loggerService = new LoggerService()
