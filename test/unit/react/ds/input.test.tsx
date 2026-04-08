import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { Input } from '@/client/components/ds/input'

describe('ds/Input', () => {
  it('renders label and links it to input', () => {
    render(<Input label="Email" />)
    const input = screen.getByLabelText('Email') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.tagName).toBe('INPUT')
  })

  it('renders helper text when no error', () => {
    render(<Input label="Email" helper="We never share it" />)
    expect(screen.getByText('We never share it')).toBeTruthy()
  })

  it('shows error and sets aria-invalid', () => {
    render(<Input label="Email" error="Invalid email" />)
    const input = screen.getByLabelText('Email') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Invalid email')).toBeTruthy()
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy as string)?.textContent).toBe(
      'Invalid email',
    )
  })
})
