import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { OtpInput } from '@/client/components/ds/otp-input'

function Harness({
  onComplete,
}: {
  onComplete?: (v: string) => void
}): React.ReactElement {
  const [val, setVal] = useState('')
  return <OtpInput value={val} onChange={setVal} onComplete={onComplete} />
}

describe('ds/OtpInput', () => {
  it('renders 6 slots by default', () => {
    render(<Harness />)
    const slots = screen.getAllByRole('textbox')
    expect(slots).toHaveLength(6)
    expect(slots[0].getAttribute('aria-label')).toBe('Digit 1 of 6')
    expect(slots[5].getAttribute('aria-label')).toBe('Digit 6 of 6')
    expect(slots[0].getAttribute('autocomplete')).toBe('one-time-code')
    expect(slots[0].getAttribute('inputmode')).toBe('numeric')
  })

  it('advances focus on digit entry', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const slots = screen.getAllByRole('textbox') as HTMLInputElement[]
    slots[0].focus()
    await user.keyboard('1')
    expect(document.activeElement).toBe(slots[1])
    await user.keyboard('2')
    expect(document.activeElement).toBe(slots[2])
  })

  it('fills all slots on paste of full code', async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onComplete={onComplete} />)
    const slots = screen.getAllByRole('textbox') as HTMLInputElement[]
    slots[0].focus()
    await user.paste('123456')
    expect(slots[0].value).toBe('1')
    expect(slots[5].value).toBe('6')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })
})
