import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Logo } from '@/client/components/ds/logo'

describe('ds/Logo', () => {
  it('renders with default size 32 and aria-hidden', () => {
    const { container } = render(<Logo />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('respects custom size and aria-label', () => {
    const { container } = render(<Logo size={64} aria-label="Quayer" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('64')
    expect(svg?.getAttribute('aria-hidden')).toBeNull()
    expect(svg?.getAttribute('role')).toBe('img')
  })
})
