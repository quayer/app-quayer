import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { Logo } from '@/client/components/ds/logo'

describe('ds/Logo', () => {
  it('renders with default size 32 and aria-hidden', () => {
    const { container } = render(<Logo />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    // iconWidth = Math.round(32 * 200/248) = 26, iconHeight = 32
    expect(svg?.getAttribute('width')).toBe('26')
    expect(svg?.getAttribute('height')).toBe('32')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })

  it('respects custom size and aria-label', () => {
    const { container } = render(<Logo size={64} aria-label="Quayer" />)
    const svg = container.querySelector('svg')
    // iconWidth = Math.round(64 * 200/248) = 52, iconHeight = 64
    expect(svg?.getAttribute('width')).toBe('52')
    expect(svg?.getAttribute('height')).toBe('64')
    // Logo wraps in a div[role=img] with aria-label; svg is always aria-hidden
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    const wrapper = container.querySelector('[role="img"]')
    expect(wrapper?.getAttribute('aria-label')).toBe('Quayer')
  })
})
