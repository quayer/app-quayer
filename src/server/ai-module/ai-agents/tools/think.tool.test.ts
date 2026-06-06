/**
 * Unit tests da tool think (scratchpad com limite por turno).
 */

import { describe, it, expect } from 'vitest'
import {
  createThinkTool,
  MAX_THINK_CALLS_PER_TURN,
  type ThinkResult,
} from './think.tool'

function runner() {
  const execute = createThinkTool().execute
  if (!execute) throw new Error('tool sem execute')
  return (thought: string) =>
    execute({ thought }, {} as never) as Promise<ThinkResult>
}

describe('createThinkTool', () => {
  it('aceita até o limite e decrementa o saldo', async () => {
    const think = runner()

    const r1 = await think('passo 1')
    expect(r1.success).toBe(true)
    expect(r1.callsUsed).toBe(1)
    expect(r1.callsRemaining).toBe(MAX_THINK_CALLS_PER_TURN - 1)

    const r2 = await think('passo 2')
    expect(r2.success).toBe(true)
    expect(r2.callsRemaining).toBe(MAX_THINK_CALLS_PER_TURN - 2)

    const r3 = await think('passo 3')
    expect(r3.success).toBe(true)
    expect(r3.callsRemaining).toBe(0)
  })

  it('bloqueia a partir da 4ª chamada no mesmo turno', async () => {
    const think = runner()
    for (let i = 0; i < MAX_THINK_CALLS_PER_TURN; i++) await think('ok')

    const overflow = await think('demais')
    expect(overflow.success).toBe(false)
    expect(overflow.callsRemaining).toBe(0)
    expect(overflow.message).toMatch(/limite/i)
  })

  it('cada turno (nova factory) reseta o contador', async () => {
    const turn1 = runner()
    for (let i = 0; i < MAX_THINK_CALLS_PER_TURN; i++) await turn1('x')
    expect((await turn1('x')).success).toBe(false)

    const turn2 = runner()
    expect((await turn2('y')).success).toBe(true)
  })
})
