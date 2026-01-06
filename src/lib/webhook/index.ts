/**
 * Webhook Processing Utilities
 *
 * This module provides utilities for secure and robust webhook processing:
 * - Payload validation with Zod schemas
 * - Distributed locking for idempotency
 * - Content sanitization for XSS prevention
 * - Redis caching for contacts and connections
 * - Request tracing for observability
 */

// Validation
export {
  webhookPayloadSchema,
  uazapiWebhookSchema,
  evolutionWebhookSchema,
  cloudApiWebhookSchema,
  validateWebhookPayload,
  type WebhookPayloadType,
} from './webhook-validation';

// Distributed Locking
export {
  withLock,
  withMessageLock,
  ResourceLockedError,
  type LockResult,
} from './distributed-lock';

// Sanitization
export {
  sanitizeContent,
  sanitizeContactName,
  sanitizeFileName,
  sanitizeUrl,
  sanitizeMessage,
} from './sanitize';

// Caching
export {
  getCachedContact,
  getCachedConnection,
  getCachedConnectionByToken,
  invalidateContactCache,
  invalidateConnectionCache,
  updateContactCache,
} from './contact-cache';

// Tracing
export {
  createTraceContext,
  createChildSpan,
  createWebhookTrace,
  trace,
  endSpan,
  addTraceAttributes,
  extractTraceFromHeaders,
  createTraceHeaders,
  type TraceContext,
  type Span,
} from './tracing';

// Event Processor (shared between routes)
export { processWebhookEvent } from './processor';
