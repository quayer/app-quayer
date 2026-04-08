import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Checkbox } from '@/client/components/ds/checkbox'

describe('ds/Checkbox', () => {
  it('renders label as clickable and toggles input via label click', async () => {
    const user = userEvent.setup()
    render(<Checkbox label="Aceito os termos" />)
    const input = screen.getByRole('checkbox') as HTMLInputElement
    expect(input.checked).toBe(false)
    await user.click(screen.getByText('Aceito os termos'))
    expect(input.checked).toBe(true)
  })

  it('calls onChange when clicked', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()
    render(<Checkbox label="Aceito" onChange={handleChange} />)
    await user.click(screen.getByRole('checkbox'))
    expect(handleChange).toHaveBeenCalledTimes(1)
  })

  it('renders error with role="alert"', () => {
    render(<Checkbox label="Aceito" error="Aceite os termos" />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('Aceite os termos')
  })

  it('aria-invalid true when error present, undefined otherwise', () => {
    const { rerender } = render(<Checkbox label="Aceito" />)
    const input = screen.getByRole('checkbox')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    rerender(<Checkbox label="Aceito" error="Obrigatorio" />)
    expect(screen.getByRole('checkbox').getAttribute('aria-invalid')).toBe('true')
  })
})
