/**
 * Request Tracing Service
 *
 * Provides trace IDs for correlating webhook processing across
 * the entire flow: webhook -> processing -> SSE.
 *
 * Note: This is a lightweight tracing implementation. For production
 * environments with high observability needs, consider integrating
 * OpenTelemetry with a backend like Jaeger, Zipkin, or Datadog.
 */

import { logger } from '@/lib/logging/logger';
import { randomUUID } from 'crypto';

/**
 * Trace context for request correlation
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  attributes: Record<string, string | number | boolean>;
}

/**
 * Span represents a unit of work
 */
export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
}

/**
 * Create a new trace context for an incoming webhook
 */
export function createTraceContext(attributes?: Record<string, string | number | boolean>): TraceContext {
  return {
    traceId: randomUUID(),
    spanId: randomUUID(),
    startTime: Date.now(),
    attributes: attributes || {},
  };
}

/**
 * Create a child span from an existing trace context
 */
export function createChildSpan(parent: TraceContext, name: string): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: randomUUID(),
    parentSpanId: parent.spanId,
    startTime: Date.now(),
    attributes: { ...parent.attributes },
  };
}

/**
 * Create a span from trace context
 */
function createSpan(context: TraceContext, name: string): Span {
  return {
    spanId: context.spanId,
    traceId: context.traceId,
    parentSpanId: context.parentSpanId,
    name,
    startTime: context.startTime,
    status: 'ok',
    attributes: context.attributes,
  };
}

/**
 * End a span and log it
 */
export function endSpan(span: Span, status: 'ok' | 'error' = 'ok'): void {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  span.status = status;

  // Log span for correlation
  logger.info('Span completed', {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    duration: span.duration,
    status: span.status,
    ...span.attributes,
  });
}

/**
 * Trace a function execution with automatic span management
 */
export async function trace<T>(
  name: string,
  context: TraceContext,
  fn: (ctx: TraceContext) => Promise<T>
): Promise<T> {
  const childCtx = createChildSpan(context, name);
  const span = createSpan(childCtx, name);

  try {
    const result = await fn(childCtx);
    endSpan(span, 'ok');
    return result;
  } catch (error) {
    span.attributes.error = error instanceof Error ? error.message : 'Unknown error';
    endSpan(span, 'error');
    throw error;
  }
}

/**
 * Add attributes to a trace context
 */
export function addTraceAttributes(
  context: TraceContext,
  attributes: Record<string, string | number | boolean>
): void {
  Object.assign(context.attributes, attributes);
}

/**
 * Extract trace ID from request headers (if forwarded from another service)
 */
export function extractTraceFromHeaders(headers: Headers): TraceContext | null {
  const traceId = headers.get('x-trace-id') || headers.get('traceparent');

  if (traceId) {
    // If traceparent format (W3C): version-traceId-spanId-flags
    const parts = traceId.split('-');
    if (parts.length >= 3) {
      return {
        traceId: parts[1],
        spanId: randomUUID(),
        parentSpanId: parts[2],
        startTime: Date.now(),
        attributes: {},
      };
    }

    // Simple trace ID format
    return {
      traceId,
      spanId: randomUUID(),
      startTime: Date.now(),
      attributes: {},
    };
  }

  return null;
}

/**
 * Create trace headers for outgoing requests
 */
export function createTraceHeaders(context: TraceContext): Record<string, string> {
  return {
    'x-trace-id': context.traceId,
    'x-span-id': context.spanId,
    // W3C Trace Context format
    'traceparent': `00-${context.traceId}-${context.spanId}-01`,
  };
}

/**
 * Webhook-specific trace context with common attributes
 */
export function createWebhookTrace(
  provider: string,
  event: string,
  messageId?: string
): TraceContext {
  return createTraceContext({
    'webhook.provider': provider,
    'webhook.event': event,
    ...(messageId && { 'message.id': messageId }),
  });
}
