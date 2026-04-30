/**
 * Winston Logger Configuration
 *
 * Structured logging for backend with multiple transports:
 * - Console (development)
 * - File (production)
 * - JSON format for log aggregation
 *
 * Usage:
 * ```typescript
 * import { logger } from '@/lib/logging/logger'
 *
 * logger.info('User logged in', { userId: '123', email: 'user@example.com' })
 * logger.error('Database error', { error: err, query: 'SELECT ...' })
 * logger.warn('Rate limit exceeded', { ip: '192.168.1.1', endpoint: '/api/v1/auth/login' })
 * ```
 */

import winston from 'winston'
import path from 'path'

const isDevelopment = process.env.NODE_ENV === 'development'
const isTest = process.env.NODE_ENV === 'test'

// Custom format for console output (readable)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}] ${message}`

    // Add metadata if exists
    if (Object.keys(metadata).length > 0) {
      msg += `\n${JSON.stringify(metadata, null, 2)}`
    }

    return msg
  })
)

// JSON format for file output (machine-readable)
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Create transports based on environment
const transports: winston.transport[] = []

// Console transport (always in development)
if (isDevelopment || isTest) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: isTest ? 'error' : 'debug', // Only errors during tests
    })
  )
}

// File transports (production)
if (!isTest) {
  const logsDir = path.join(process.cwd(), 'logs')

  // Combined logs (all levels)
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: jsonFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      level: 'info',
    })
  )

  // Error logs (errors only)
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      format: jsonFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      level: 'error',
    })
  )

  // Debug logs (debug and above)
  if (isDevelopment) {
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'debug.log'),
        format: jsonFormat,
        maxsize: 10485760, // 10MB
        maxFiles: 3,
        level: 'debug',
      })
    )
  }
}

// Create logger instance
export const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  transports,
  exitOnError: false,
})

/**
 * Request logger middleware
 * Logs all incoming HTTP requests
 */
export function logRequest(req: any, metadata?: Record<string, any>) {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
    ...metadata,
  })
}

/**
 * Error logger with stack trace
 */
export function logError(error: Error, context?: Record<string, any>) {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
  })
}

/**
 * Database query logger
 */
export function logDatabaseQuery(query: string, duration?: number, metadata?: Record<string, any>) {
  logger.debug('Database Query', {
    query,
    duration: duration ? `${duration}ms` : undefined,
    ...metadata,
  })
}

/**
 * Job logger (BullMQ)
 */
export function logJob(jobName: string, status: 'started' | 'completed' | 'failed', metadata?: Record<string, any>) {
  const logLevel = status === 'failed' ? 'error' : 'info'

  logger.log(logLevel, `Job ${status}`, {
    jobName,
    status,
    ...metadata,
  })
}

/**
 * Authentication logger
 */
export function logAuth(event: string, userId?: string, metadata?: Record<string, any>) {
  logger.info('Authentication Event', {
    event,
    userId,
    ...metadata,
  })
}

/**
 * Business logic logger
 */
export function logBusinessEvent(event: string, metadata?: Record<string, any>) {
  logger.info('Business Event', {
    event,
    ...metadata,
  })
}

// Export default logger
export default logger
