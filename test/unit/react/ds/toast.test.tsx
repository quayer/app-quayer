import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Toast } from '@/client/components/ds/toast'

describe('ds/Toast', () => {
  it('uses role=status for info', () => {
    render(<Toast type="info" message="Hello" />)
    expect(screen.getByRole('status').textContent).toContain('Hello')
  })

  it('uses role=status for success', () => {
    render(<Toast type="success" message="Saved" />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('uses role=alert for error', () => {
    render(<Toast type="error" message="Boom" />)
    expect(screen.getByRole('alert').textContent).toContain('Boom')
  })

  it('uses role=alert for warning', () => {
    render(<Toast type="warning" message="Heads up" />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('renders dismiss button and fires callback', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<Toast type="info" message="Hi" onDismiss={onDismiss} />)
    const btn = screen.getByRole('button', { name: 'Dismiss notification' })
    await user.click(btn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
