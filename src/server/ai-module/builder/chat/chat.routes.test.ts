/**
 * Tests for Builder Chat Routes composition (chat.routes.ts).
 *
 * Scope: wiring + HTTP response shape. Heavy behavior is covered by the
 * individual handler tests.
 */

import { describe, it } from 'vitest'

describe('chatRoutes.sendMessage', () => {
  it.todo('returns 401 when the caller is not authenticated')
  it.todo('returns 400 when projectId is not a valid UUID')
  it.todo('streams SSE events that match the AgentStreamEvent wire format')
  it.todo('converts __budget_exhausted__ into a single error SSE frame')
})

describe('chatRoutes.listMessages', () => {
  it.todo('returns messages newest-first with a nextCursor when more exist')
  it.todo('forbids access when conversation belongs to another organization')
})

describe('chatRoutes.compact', () => {
  it.todo('returns 400 when compaction is exhausted')
  it.todo('returns compacted=false when history is under threshold')
})
