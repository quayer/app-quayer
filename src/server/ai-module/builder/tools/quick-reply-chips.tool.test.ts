import { describe, expect, it } from 'vitest'

import {
  quickReplyChipsInputSchema,
  quickReplyChipsTool,
} from './quick-reply-chips.tool'
import { buildBuilderToolset } from './index'

const CTX = {
  projectId: 'proj-test',
  organizationId: 'org-test',
  userId: 'user-test',
}

function getExecute(t: ReturnType<typeof quickReplyChipsTool>) {
  return (t as unknown as { execute: (...a: unknown[]) => Promise<unknown> })
    .execute
}

describe('quickReplyChipsTool', () => {
  it('returns a transient prompt + deduped chips', async () => {
    const execute = getExecute(quickReplyChipsTool(CTX))

    const result = (await execute({
      prompt: 'Qual objetivo faz mais sentido?',
      chips: [
        { label: 'Captar leads', value: 'Captar leads interessados' },
        { label: 'Captar leads', value: 'Captar leads interessados' },
        { value: 'Agendar visitas' },
      ],
    })) as {
      success: boolean
      prompt: string
      chips: Array<{ label?: string; value: string }>
    }

    expect(result.success).toBe(true)
    expect(result.prompt).toBe('Qual objetivo faz mais sentido?')
    expect(result.chips).toEqual([
      { label: 'Captar leads', value: 'Captar leads interessados' },
      { value: 'Agendar visitas' },
    ])
  })

  it('is registered in the Builder toolset with read-only metadata', () => {
    const toolset = buildBuilderToolset(CTX)
    const t = toolset.quick_reply_chips as unknown as {
      __metadata: Record<string, unknown>
    }

    expect(t.__metadata).toMatchObject({
      name: 'quick_reply_chips',
      isReadOnly: true,
      isConcurrencySafe: true,
      requiresApproval: false,
    })
  })
})

describe('quickReplyChipsInputSchema', () => {
  it('requires 2-4 chips', () => {
    expect(
      quickReplyChipsInputSchema.safeParse({
        prompt: 'Escolha',
        chips: [{ value: 'Só uma' }],
      }).success,
    ).toBe(false)

    expect(
      quickReplyChipsInputSchema.safeParse({
        prompt: 'Escolha',
        chips: [
          { value: 'A' },
          { value: 'B' },
          { value: 'C' },
          { value: 'D' },
          { value: 'E' },
        ],
      }).success,
    ).toBe(false)
  })
})
