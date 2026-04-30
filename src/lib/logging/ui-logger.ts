/**
 * UI Event Logger
 *
 * Captures all user interactions for analytics and debugging:
 * - Button clicks
 * - Navigation events
 * - Form submissions
 * - Errors and warnings
 * - Performance metrics
 *
 * Usage:
 * ```typescript
 * import { uiLogger } from '@/lib/logging/ui-logger'
 *
 * // Log button click
 * uiLogger.click('create-connection-button', { connectionName: 'My Connection' })
 *
 * // Log navigation
 * uiLogger.navigate('/integrations', { from: '/dashboard' })
 *
 * // Log error
 * uiLogger.error('Failed to load connections', { statusCode: 500 })
 * ```
 */

export type UIEventType =
  | 'click'
  | 'navigation'
  | 'form_submit'
  | 'form_error'
  | 'modal_open'
  | 'modal_close'
  | 'api_call'
  | 'api_success'
  | 'api_error'
  | 'page_load'
  | 'error'
  | 'warning'
  | 'info'
  | 'performance'

export interface UIEvent {
  type: UIEventType
  element?: string
  page?: string
  timestamp: number
  sessionId: string
  userId?: string
  metadata?: Record<string, any>
}

class UILogger {
  private sessionId: string
  private userId?: string
  private events: UIEvent[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private readonly FLUSH_INTERVAL_MS = 10000 // 10 seconds
  private readonly MAX_EVENTS_BEFORE_FLUSH = 50

  constructor() {
    this.sessionId = this.generateSessionId()
    this.startAutoFlush()
  }

  /**
   * Initialize logger with user context
   */
  init(userId?: string) {
    this.userId = userId
  }

  /**
   * Log button click
   */
  click(element: string, metadata?: Record<string, any>) {
    this.log('click', element, metadata)
  }

  /**
   * Log navigation event
   */
  navigate(page: string, metadata?: Record<string, any>) {
    this.log('navigation', page, { page, ...metadata })
  }

  /**
   * Log form submission
   */
  formSubmit(formName: string, metadata?: Record<string, any>) {
    this.log('form_submit', formName, metadata)
  }

  /**
   * Log form error
   */
  formError(formName: string, errors: Record<string, string>) {
    this.log('form_error', formName, { errors })
  }

  /**
   * Log modal open
   */
  modalOpen(modalName: string, metadata?: Record<string, any>) {
    this.log('modal_open', modalName, metadata)
  }

  /**
   * Log modal close
   */
  modalClose(modalName: string, metadata?: Record<string, any>) {
    this.log('modal_close', modalName, metadata)
  }

  /**
   * Log API call
   */
  apiCall(endpoint: string, method: string, metadata?: Record<string, any>) {
    this.log('api_call', endpoint, { method, endpoint, ...metadata })
  }

  /**
   * Log API success
   */
  apiSuccess(endpoint: string, duration: number, metadata?: Record<string, any>) {
    this.log('api_success', endpoint, { endpoint, duration, ...metadata })
  }

  /**
   * Log API error
   */
  apiError(endpoint: string, statusCode: number, error: string, metadata?: Record<string, any>) {
    this.log('api_error', endpoint, { endpoint, statusCode, error, ...metadata })
  }

  /**
   * Log page load
   */
  pageLoad(page: string, loadTime: number, metadata?: Record<string, any>) {
    this.log('page_load', page, { page, loadTime, ...metadata })
  }

  /**
   * Log error
   */
  error(message: string, metadata?: Record<string, any>) {
    this.log('error', message, metadata)
  }

  /**
   * Log warning
   */
  warning(message: string, metadata?: Record<string, any>) {
    this.log('warning', message, metadata)
  }

  /**
   * Log info
   */
  info(message: string, metadata?: Record<string, any>) {
    this.log('info', message, metadata)
  }

  /**
   * Log performance metric
   */
  performance(metric: string, value: number, metadata?: Record<string, any>) {
    this.log('performance', metric, { metric, value, ...metadata })
  }

  /**
   * Core log method
   */
  private log(type: UIEventType, element?: string, metadata?: Record<string, any>) {
    const event: UIEvent = {
      type,
      element,
      page: typeof window !== 'undefined' ? window.location.pathname : undefined,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
      metadata,
    }

    this.events.push(event)

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[UI Logger] ${type}:`, element || '', metadata || '')
    }

    // Flush if buffer is full
    if (this.events.length >= this.MAX_EVENTS_BEFORE_FLUSH) {
      this.flush()
    }
  }

  /**
   * Send events to backend
   */
  private async flush() {
    if (this.events.length === 0) return

    const eventsToSend = [...this.events]
    this.events = []

    try {
      // Send to analytics endpoint
      await fetch('/api/v1/analytics/ui-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: eventsToSend,
        }),
      })
    } catch (error) {
      console.error('[UI Logger] Failed to send events:', error)
      // Re-add events to buffer if failed
      this.events.unshift(...eventsToSend)
    }
  }

  /**
   * Start auto-flush interval
   */
  private startAutoFlush() {
    if (typeof window === 'undefined') return

    this.flushInterval = setInterval(() => {
      this.flush()
    }, this.FLUSH_INTERVAL_MS)

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush()
    })
  }

  /**
   * Stop auto-flush
   */
  stopAutoFlush() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * Get all events (for debugging)
   */
  getEvents(): UIEvent[] {
    return [...this.events]
  }

  /**
   * Clear all events
   */
  clear() {
    this.events = []
  }
}

// Export singleton instance
export const uiLogger = new UILogger()

// Auto-initialize on window load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    const startTime = performance.now()
    uiLogger.pageLoad(window.location.pathname, performance.now() - startTime)
  })
}

export default uiLogger
