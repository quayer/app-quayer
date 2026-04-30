import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button } from '@/client/components/ds/button'

describe('ds/Button', () => {
  it('renders primary variant by default', () => {
    render(<Button>Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn).toBeTruthy()
    expect(btn.className).toContain('bg-ds-p-500')
  })

  it('renders secondary variant', () => {
    render(<Button variant="secondary">Sec</Button>)
    expect(screen.getByRole('button').className).toContain('bg-ds-surface')
  })

  it('renders ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button').className).toContain('bg-transparent')
  })

  it('respects disabled prop', () => {
    render(<Button disabled>Off</Button>)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows spinner and disables when loading', () => {
    render(<Button loading>Wait</Button>)
    const btn = screen.getByRole('button') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByTestId('ds-button-spinner')).toBeTruthy()
  })

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<Button onClick={fn}>Hit</Button>)
    await user.click(screen.getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
