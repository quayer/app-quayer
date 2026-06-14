import { describe, expect, it } from 'vitest'

import { parseBuilderState, patchBuilderState } from '../cards/builder-state'
import { buildDesignerInput } from './designer-input'

describe('buildDesignerInput', () => {
  it('inclui ferramentas recomendadas para SDR de empredimento imob em texto livre', () => {
    const state = patchBuilderState(parseBuilderState({}), {
      project: {
        objective:
          'Quero criar um SDR para empredimento imob que qualifica leads e agenda visita.',
      },
      identity: {
        description:
          'Empredimento residencial com apartamentos e atendimento de consultor.',
      },
    })

    const input = buildDesignerInput(state)

    expect(input?.niche).toBe('imobiliário')
    expect(input?.capabilities).toEqual(
      expect.arrayContaining([
        expect.stringContaining('create_lead'),
        expect.stringContaining('calendar_list_slots'),
        expect.stringContaining('check_availability'),
        expect.stringContaining('create_event'),
        expect.stringContaining('transfer_to_human'),
      ]),
    )
  })
})
