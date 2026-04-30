/**
 * Tests for the persist-message handlers.
 */

import { describe, it } from 'vitest'

describe('persistUserMessage', () => {
  it.todo('writes a row with role=user and returns { persisted: true, id }')
  it.todo('swallows DB errors and returns { persisted: false, id: null }')
})

describe('persistAssistantMessage', () => {
  it.todo('persists toolCalls + metadata JSON payloads')
})

describe('persistErrorMessage', () => {
  it.todo('writes role=system_banner with an "Error from Builder AI:" prefix')
})

describe('persistSystemBanner', () => {
  it.todo('writes role=system_banner with optional metadata')
})
