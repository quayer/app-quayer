/**
 * Tests for streamAgentResponse.
 */

import { describe, it } from 'vitest'

describe('streamAgentResponse', () => {
  it.todo('yields text-delta events and accumulates the assistant text')
  it.todo('persists the assistant message on finish with usage + cost metadata')
  it.todo('fires updateStateSummary fire-and-forget after finish')
  it.todo('yields __budget_exhausted__ when compactIfNeeded returns exhausted')
  it.todo('persists an error banner and yields an error event on loop throw')
})
