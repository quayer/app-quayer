/**
 * Tests for the tool-registry service.
 *
 * The service is pure / side-effect-free, so these are straight unit tests —
 * no mocks, no setup beyond defining fixture tools inline.
 */

import { describe, it, expect } from 'vitest'
import {
  isDeferredTool,
  truncateToolResult,
  parseToolName,
  searchTools,
  partitionTools,
  DEFAULT_MAX_RESULT_SIZE_CHARS,
  type ToolMetadata,
} from './tool-registry.service'

// ---------------------------------------------------------------------------
// isDeferredTool
// ---------------------------------------------------------------------------

describe('isDeferredTool', () => {
  it('returns true when shouldDefer is set and alwaysLoad is absent', () => {
    const tool: ToolMetadata = {
      name: 'search_kb',
      description: 'Search internal KB',
      shouldDefer: true,
    }
    expect(isDeferredTool(tool)).toBe(true)
  })

  it('returns false when both shouldDefer and alwaysLoad are true (alwaysLoad wins)', () => {
    const tool: ToolMetadata = {
      name: 'send_pricing',
      description: 'Send pricing PDF',
      shouldDefer: true,
      alwaysLoad: true,
    }
    expect(isDeferredTool(tool)).toBe(false)
  })

  it('returns false when shouldDefer is not set', () => {
    const tool: ToolMetadata = {
      name: 'send_pricing',
      description: 'Send pricing PDF',
    }
    expect(isDeferredTool(tool)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// truncateToolResult
// ---------------------------------------------------------------------------

describe('truncateToolResult', () => {
  it('does not truncate strings shorter than maxResultSizeChars', () => {
    const result = truncateToolResult('hello world', 100)
    expect(result.truncated).toBe(false)
    expect(result.content).toBe('hello world')
    expect(result.omittedChars).toBe(0)
  })

  it('truncates strings longer than maxResultSizeChars and adds the suffix', () => {
    const longString = 'a'.repeat(50)
    const result = truncateToolResult(longString, 10)
    expect(result.truncated).toBe(true)
    expect(result.omittedChars).toBe(40)
    expect(result.content.startsWith('a'.repeat(10))).toBe(true)
    expect(result.content).toContain('...[truncated, 40 chars omitted]')
  })

  it('serializes objects via JSON.stringify and then truncates if necessary', () => {
    const obj = { foo: 'bar', baz: 'qux'.repeat(100) }
    const fullSerialized = JSON.stringify(obj, null, 2)
    const result = truncateToolResult(obj, 20)
    expect(result.truncated).toBe(true)
    expect(result.omittedChars).toBe(fullSerialized.length - 20)
    expect(result.content.startsWith(fullSerialized.slice(0, 20))).toBe(true)
    expect(result.content).toContain('...[truncated,')
  })

  it('serializes small objects without truncating', () => {
    const obj = { a: 1 }
    const result = truncateToolResult(obj, 100)
    expect(result.truncated).toBe(false)
    expect(result.content).toBe(JSON.stringify(obj, null, 2))
  })

  it('returns empty string for null and undefined without truncating', () => {
    const nullResult = truncateToolResult(null, 100)
    expect(nullResult.content).toBe('')
    expect(nullResult.truncated).toBe(false)
    expect(nullResult.omittedChars).toBe(0)

    const undefinedResult = truncateToolResult(undefined, 100)
    expect(undefinedResult.content).toBe('')
    expect(undefinedResult.truncated).toBe(false)
    expect(undefinedResult.omittedChars).toBe(0)
  })

  it('uses DEFAULT_MAX_RESULT_SIZE_CHARS when no cap is provided', () => {
    expect(DEFAULT_MAX_RESULT_SIZE_CHARS).toBe(5000)
    const longString = 'x'.repeat(DEFAULT_MAX_RESULT_SIZE_CHARS + 5)
    const result = truncateToolResult(longString)
    expect(result.truncated).toBe(true)
    expect(result.omittedChars).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// parseToolName
// ---------------------------------------------------------------------------

describe('parseToolName', () => {
  it('splits snake_case regular tool names into parts (isMcp=false)', () => {
    const result = parseToolName('send_pricing')
    expect(result.parts).toEqual(['send', 'pricing'])
    expect(result.isMcp).toBe(false)
    expect(result.full).toBe('send pricing')
  })

  it('handles MCP-prefixed tool names with the server name as a part', () => {
    const result = parseToolName('mcp__slack__send_message')
    expect(result.parts).toEqual(['slack', 'send', 'message'])
    expect(result.isMcp).toBe(true)
    expect(result.full).toBe('slack send message')
  })

  it('splits CamelCase regular tool names into lower-cased parts', () => {
    const result = parseToolName('SendMessage')
    expect(result.parts).toEqual(['send', 'message'])
    expect(result.isMcp).toBe(false)
    expect(result.full).toBe('send message')
  })
})

// ---------------------------------------------------------------------------
// searchTools
// ---------------------------------------------------------------------------

describe('searchTools', () => {
  const tools: ToolMetadata[] = [
    {
      name: 'send_pricing',
      description: 'Envia tabela de precos via WhatsApp',
      searchHint: 'pricing table whatsapp send',
      shouldDefer: true,
    },
    {
      name: 'book_appointment',
      description: 'Agenda horario no calendario',
      searchHint: 'calendar booking schedule',
      shouldDefer: true,
    },
    {
      name: 'mcp__slack__send_message',
      description: 'Sends a Slack message to a channel',
      searchHint: 'slack channel notification',
      shouldDefer: true,
    },
    {
      name: 'lookup_customer',
      description: 'Busca info do cliente no CRM (mentions pricing rarely)',
      shouldDefer: true,
    },
  ]

  it('returns exact match (case-insensitive) for `select:<name>` form', () => {
    expect(searchTools('select:send_pricing', tools)).toEqual(['send_pricing'])
    expect(searchTools('select:SEND_PRICING', tools)).toEqual(['send_pricing'])
  })

  it('ranks part-level hits (+10) above description-only hits (+2)', () => {
    // Term "pricing" hits send_pricing.parts AND lookup_customer.description.
    // Expect send_pricing first because part match score is much higher.
    const result = searchTools('pricing', tools)
    expect(result[0]).toBe('send_pricing')
    expect(result).toContain('lookup_customer')
    // Position of lookup_customer must be after send_pricing
    expect(result.indexOf('send_pricing')).toBeLessThan(
      result.indexOf('lookup_customer'),
    )
  })

  it('boosts results that match searchHint (+4 over plain description)', () => {
    // "notification" appears only in mcp slack tool's searchHint.
    const result = searchTools('notification', tools)
    expect(result).toContain('mcp__slack__send_message')
    expect(result[0]).toBe('mcp__slack__send_message')
  })

  it('sums scores across multiple query terms', () => {
    // Multiple terms compound: a tool matching two terms (each via parts)
    // outranks a tool that matches only one of them.
    //
    // - "pricing" alone: send_pricing wins easily (parts +10, hint +4).
    //   lookup_customer only has +2 (description word boundary).
    // - "send" alone: send_pricing has parts +10 + hint "send" +4 = +14.
    //   mcp slack has parts +12 (mcp bonus) = +12.
    // - "send pricing": send_pricing should have a HIGHER absolute score
    //   than its single-term result, because both terms hit its parts
    //   AND its hint, and lookup_customer's score stays roughly flat.
    const oneTermPricing = searchTools('pricing', tools)
    const twoTerms = searchTools('send pricing', tools)
    expect(twoTerms[0]).toBe('send_pricing')
    expect(oneTermPricing[0]).toBe('send_pricing')

    // The gap between send_pricing and the runner-up must grow when we
    // add a second matching term — that's the "scores sum" guarantee.
    // We don't expose scores directly, so we use a sentinel tool that
    // only matches one of the two terms to assert ordering shifts.
    const sentinelTools: ToolMetadata[] = [
      ...tools,
      {
        name: 'pricing_only',
        description: 'mentions pricing exactly once',
        shouldDefer: true,
      },
    ]
    const oneTerm = searchTools('pricing', sentinelTools)
    const twoTermsWithSentinel = searchTools('send pricing', sentinelTools)
    // Both "pricing_only" (description hit +2) and "send_pricing"
    // (parts+hint) match "pricing"; send_pricing already wins.
    expect(oneTerm[0]).toBe('send_pricing')
    expect(oneTerm).toContain('pricing_only')
    // After adding "send", send_pricing gains points but pricing_only
    // doesn't (no "send" anywhere). The gap widens, so send_pricing
    // remains #1 and pricing_only is still in the list but ranked below.
    expect(twoTermsWithSentinel[0]).toBe('send_pricing')
    expect(twoTermsWithSentinel.indexOf('send_pricing')).toBeLessThan(
      twoTermsWithSentinel.indexOf('pricing_only'),
    )
  })

  it('uses default maxResults = 5', () => {
    const many: ToolMetadata[] = Array.from({ length: 10 }).map((_, i) => ({
      name: `tool_send_${i}`,
      description: 'send something',
      shouldDefer: true,
    }))
    const result = searchTools('send', many)
    expect(result.length).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// partitionTools
// ---------------------------------------------------------------------------

describe('partitionTools', () => {
  it('places tools with shouldDefer:true (and no alwaysLoad) in the deferred bucket', () => {
    const tools: ToolMetadata[] = [
      { name: 'a', description: 'A', shouldDefer: true },
      { name: 'b', description: 'B' },
      { name: 'c', description: 'C', shouldDefer: true },
    ]
    const { loaded, deferred } = partitionTools(tools)
    expect(deferred.map(t => t.name)).toEqual(['a', 'c'])
    expect(loaded.map(t => t.name)).toEqual(['b'])
  })

  it('keeps tools with alwaysLoad:true in the loaded bucket even when shouldDefer is set', () => {
    const tools: ToolMetadata[] = [
      {
        name: 'critical',
        description: 'critical tool',
        shouldDefer: true,
        alwaysLoad: true,
      },
      { name: 'lazy', description: 'lazy tool', shouldDefer: true },
    ]
    const { loaded, deferred } = partitionTools(tools)
    expect(loaded.map(t => t.name)).toEqual(['critical'])
    expect(deferred.map(t => t.name)).toEqual(['lazy'])
  })
})
