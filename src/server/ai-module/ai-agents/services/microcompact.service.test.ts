/**
 * microcompact.service — unit tests
 *
 * Cobertura:
 *  - timeBasedMicrocompact: trigger por gap temporal, substituição de
 *    conteúdo de tool_results antigos por placeholder, preservação dos
 *    últimos N e respeito ao set COMPACTABLE_TOOLS.
 *  - cachedMicrocompact: identificação de tool IDs a deletar do cache.
 *  - estimateMessageTokens: heurística chars/4 + padding 4/3 e blocks.
 *
 * Função pura — sem mocks externos.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/services/microcompact.service.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  CLEARED_PLACEHOLDER,
  COMPACTABLE_TOOLS,
  cachedMicrocompact,
  estimateMessageTokens,
  timeBasedMicrocompact,
  type MessageLike,
} from './microcompact.service'

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

/** Constrói um par (assistant tool_use, user tool_result) para um tool. */
function makeToolPair(opts: {
  toolUseId: string
  toolName: string
  toolResultContent?: string
  toolUseTimestamp?: Date
  toolResultTimestamp?: Date
}): MessageLike[] {
  return [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: opts.toolUseId,
          name: opts.toolName,
          input: { q: 'hello' },
        },
      ],
      timestamp: opts.toolUseTimestamp,
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: opts.toolUseId,
          content: opts.toolResultContent ?? `result-for-${opts.toolUseId}`,
        },
      ],
      timestamp: opts.toolResultTimestamp,
    },
  ]
}

/** Constrói histórico com N tool pairs compactáveis + uma asst final recente. */
function buildHistory(opts: {
  numTools: number
  toolName?: string
  lastAssistantMinutesAgo: number
}): MessageLike[] {
  const now = Date.now()
  const messages: MessageLike[] = []
  for (let i = 0; i < opts.numTools; i++) {
    messages.push(
      ...makeToolPair({
        toolUseId: `tool-${i}`,
        toolName: opts.toolName ?? 'search_contacts',
      }),
    )
  }
  // mensagem assistant final (a mais recente) — fixa o "agora" do gap
  messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    timestamp: new Date(now - opts.lastAssistantMinutesAgo * 60_000),
  })
  return messages
}

// ---------------------------------------------------------------------------
// timeBasedMicrocompact
// ---------------------------------------------------------------------------

describe('timeBasedMicrocompact', () => {
  it('1. gap menor que threshold → retorna null (no-op)', () => {
    const messages = buildHistory({ numTools: 10, lastAssistantMinutesAgo: 5 })
    const result = timeBasedMicrocompact(messages, { gapThresholdMinutes: 30 })
    expect(result).toBeNull()
  })

  it('2. gap maior que threshold → substitui tool_results antigos por CLEARED_PLACEHOLDER', () => {
    const messages = buildHistory({ numTools: 10, lastAssistantMinutesAgo: 60 })
    const result = timeBasedMicrocompact(messages, {
      gapThresholdMinutes: 30,
      keepLast: 2,
    })
    expect(result).not.toBeNull()

    // Os tool_results antigos (tool-0 .. tool-7) precisam ter conteúdo trocado
    const clearedIds: string[] = []
    for (const msg of result!) {
      if (msg.role !== 'user' || !Array.isArray(msg.content)) continue
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (block.type === 'tool_result' && block.content === CLEARED_PLACEHOLDER) {
          clearedIds.push(block.tool_use_id as string)
        }
      }
    }
    // keepLast=2 → 8 dos 10 devem estar limpos
    expect(clearedIds.length).toBe(8)
    expect(clearedIds).toContain('tool-0')
    expect(clearedIds).toContain('tool-7')
    expect(clearedIds).not.toContain('tool-8')
    expect(clearedIds).not.toContain('tool-9')
  })

  it('3. mantém últimos N tool_results intactos', () => {
    const messages = buildHistory({ numTools: 10, lastAssistantMinutesAgo: 60 })
    const result = timeBasedMicrocompact(messages, {
      gapThresholdMinutes: 30,
      keepLast: 3,
    })
    expect(result).not.toBeNull()

    const intactIds: string[] = []
    for (const msg of result!) {
      if (msg.role !== 'user' || !Array.isArray(msg.content)) continue
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (
          block.type === 'tool_result' &&
          block.content !== CLEARED_PLACEHOLDER
        ) {
          intactIds.push(block.tool_use_id as string)
        }
      }
    }
    expect(intactIds).toEqual(['tool-7', 'tool-8', 'tool-9'])
  })

  it('4. não toca em messages que não são tool_results', () => {
    const now = Date.now()
    const messages: MessageLike[] = [
      { role: 'user', content: 'oi, tudo bem?' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'tudo!' }],
        timestamp: new Date(now - 60 * 60_000),
      },
      ...makeToolPair({ toolUseId: 't1', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 't2', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 't3', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 't4', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 't5', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 't6', toolName: 'search_contacts' }),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'fim' }],
        timestamp: new Date(now - 60 * 60_000),
      },
    ]
    const result = timeBasedMicrocompact(messages, {
      gapThresholdMinutes: 30,
      keepLast: 5,
    })
    expect(result).not.toBeNull()

    // Mensagens de texto puro precisam permanecer iguais
    expect(result![0]).toEqual(messages[0])
    expect(result![1]).toEqual(messages[1])
    // Última também
    expect(result![result!.length - 1]).toEqual(messages[messages.length - 1])
  })

  it('5. não compacta tools fora de COMPACTABLE_TOOLS (ex: transfer_to_human)', () => {
    const now = Date.now()
    const messages: MessageLike[] = [
      ...makeToolPair({ toolUseId: 'sensitive-1', toolName: 'transfer_to_human' }),
      ...makeToolPair({ toolUseId: 'sensitive-2', toolName: 'create_lead' }),
      ...makeToolPair({ toolUseId: 'noisy-1', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'noisy-2', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'noisy-3', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'noisy-4', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'noisy-5', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'noisy-6', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'noisy-7', toolName: 'search_contacts' }),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        timestamp: new Date(now - 60 * 60_000),
      },
    ]
    const result = timeBasedMicrocompact(messages, {
      gapThresholdMinutes: 30,
      keepLast: 5,
    })
    expect(result).not.toBeNull()

    // transfer_to_human e create_lead nunca devem ter conteúdo trocado
    const sensitiveCleared: string[] = []
    for (const msg of result!) {
      if (msg.role !== 'user' || !Array.isArray(msg.content)) continue
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (
          block.type === 'tool_result' &&
          block.content === CLEARED_PLACEHOLDER &&
          (block.tool_use_id === 'sensitive-1' ||
            block.tool_use_id === 'sensitive-2')
        ) {
          sensitiveCleared.push(block.tool_use_id as string)
        }
      }
    }
    expect(sensitiveCleared).toEqual([])
  })

  it('6. retorna null se NÃO há tool_results antigos para limpar', () => {
    // Apenas 3 tools compactáveis + keepLast=5 → nada a limpar
    const messages = buildHistory({ numTools: 3, lastAssistantMinutesAgo: 60 })
    const result = timeBasedMicrocompact(messages, {
      gapThresholdMinutes: 30,
      keepLast: 5,
    })
    expect(result).toBeNull()
  })

  it('7. keepLast default = 5', () => {
    const messages = buildHistory({ numTools: 12, lastAssistantMinutesAgo: 60 })
    const result = timeBasedMicrocompact(messages, { gapThresholdMinutes: 30 })
    expect(result).not.toBeNull()

    const intactIds: string[] = []
    for (const msg of result!) {
      if (msg.role !== 'user' || !Array.isArray(msg.content)) continue
      for (const block of msg.content as Array<Record<string, unknown>>) {
        if (
          block.type === 'tool_result' &&
          block.content !== CLEARED_PLACEHOLDER
        ) {
          intactIds.push(block.tool_use_id as string)
        }
      }
    }
    // 12 tools, keepLast=5 → mantém últimos 5
    expect(intactIds).toEqual([
      'tool-7',
      'tool-8',
      'tool-9',
      'tool-10',
      'tool-11',
    ])
  })
})

// ---------------------------------------------------------------------------
// cachedMicrocompact
// ---------------------------------------------------------------------------

describe('cachedMicrocompact', () => {
  it('8. lista todos tool_use IDs compactáveis na ordem', () => {
    const messages: MessageLike[] = [
      ...makeToolPair({ toolUseId: 'a', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'b', toolName: 'send_pricing' }),
      ...makeToolPair({ toolUseId: 'c', toolName: 'schedule_appointment' }),
      ...makeToolPair({ toolUseId: 'd', toolName: 'get_session_history' }),
      ...makeToolPair({ toolUseId: 'e', toolName: 'send_pricing' }),
    ]
    const result = cachedMicrocompact(messages, { keepLast: 2 })
    // keepLast=2 → mantém d,e. Deleta a,b,c na ordem.
    expect(result.toolIdsToDelete).toEqual(['a', 'b', 'c'])
    expect(result.activeToolCount).toBe(2)
  })

  it('9. reserva últimos N na keep set, retorna o resto em toolIdsToDelete', () => {
    const messages: MessageLike[] = []
    for (let i = 0; i < 10; i++) {
      messages.push(
        ...makeToolPair({ toolUseId: `t${i}`, toolName: 'search_contacts' }),
      )
    }
    const result = cachedMicrocompact(messages, { keepLast: 3 })
    expect(result.toolIdsToDelete).toEqual([
      't0',
      't1',
      't2',
      't3',
      't4',
      't5',
      't6',
    ])
    expect(result.activeToolCount).toBe(3)
  })

  it('10. não inclui tools fora de COMPACTABLE_TOOLS', () => {
    const messages: MessageLike[] = [
      ...makeToolPair({ toolUseId: 'sensitive', toolName: 'transfer_to_human' }),
      ...makeToolPair({ toolUseId: 'lead', toolName: 'create_lead' }),
      ...makeToolPair({ toolUseId: 'n1', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'n2', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'n3', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'n4', toolName: 'search_contacts' }),
    ]
    const result = cachedMicrocompact(messages, { keepLast: 2 })
    expect(result.toolIdsToDelete).not.toContain('sensitive')
    expect(result.toolIdsToDelete).not.toContain('lead')
    expect(result.toolIdsToDelete).toEqual(['n1', 'n2'])
  })

  it('11. quando histórico tem < N tools compactáveis → toolIdsToDelete vazio', () => {
    const messages: MessageLike[] = [
      ...makeToolPair({ toolUseId: 'a', toolName: 'search_contacts' }),
      ...makeToolPair({ toolUseId: 'b', toolName: 'search_contacts' }),
    ]
    const result = cachedMicrocompact(messages, { keepLast: 5 })
    expect(result.toolIdsToDelete).toEqual([])
    expect(result.activeToolCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// estimateMessageTokens
// ---------------------------------------------------------------------------

describe('estimateMessageTokens', () => {
  it('12. conta content.length / 4 por message + padding 4/3', () => {
    // 1 message com 40 chars → 10 base tokens → padding 4/3 → 14 (ceil)
    const messages: MessageLike[] = [
      { role: 'user', content: 'a'.repeat(40) }, // 40/4 = 10
    ]
    const tokens = estimateMessageTokens(messages)
    expect(tokens).toBe(Math.ceil(10 * (4 / 3))) // = 14
  })

  it('13. lida com content como string E como array de blocks', () => {
    const messages: MessageLike[] = [
      { role: 'user', content: 'a'.repeat(40) }, // 10 base
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'b'.repeat(80) }, // 20 base
          {
            type: 'tool_use',
            id: 't1',
            name: 'search_contacts',
            input: {}, // contagem do nome + '{}' = 'search_contacts{}' = 17 chars → 5 base (ceil)
          },
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: 'c'.repeat(40), // 10 base
          },
        ],
      },
    ]
    // 10 + 20 + 5 + 10 = 45 base → *4/3 = 60
    const tokens = estimateMessageTokens(messages)
    expect(tokens).toBe(Math.ceil(45 * (4 / 3))) // = 60
  })

  it('14. image blocks contam 2000 tokens fixos (padrão Claude Code)', () => {
    const messages: MessageLike[] = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', data: 'xxx' } },
        ],
      },
    ]
    // 2000 base → *4/3 = 2667 (ceil)
    const tokens = estimateMessageTokens(messages)
    expect(tokens).toBe(Math.ceil(2000 * (4 / 3))) // = 2667
  })
})

// ---------------------------------------------------------------------------
// COMPACTABLE_TOOLS sanity
// ---------------------------------------------------------------------------

describe('COMPACTABLE_TOOLS', () => {
  it('inclui tools barulhentas e exclui tools sensíveis', () => {
    // Inclusas
    expect(COMPACTABLE_TOOLS.has('get_session_history')).toBe(true)
    expect(COMPACTABLE_TOOLS.has('search_contacts')).toBe(true)
    expect(COMPACTABLE_TOOLS.has('send_pricing')).toBe(true)
    expect(COMPACTABLE_TOOLS.has('schedule_appointment')).toBe(true)
    // Excluídas (auditoria obrigatória) — transfer_to_human absorveu o notify_team
    expect(COMPACTABLE_TOOLS.has('transfer_to_human')).toBe(false)
    expect(COMPACTABLE_TOOLS.has('create_lead')).toBe(false)
  })
})
