import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/signup',
}))

const signupOTPMutate = vi.fn()

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      signupOTP: { mutate: (...args: unknown[]) => signupOTPMutate(...args) },
    },
  },
}))

import { SignupFormV3 } from '@/client/components/auth/signup-form-v3'

describe('SignupFormV3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    signupOTPMutate.mockResolvedValue({ data: null, error: null })
  })

  it('renders email, name and terms fields', () => {
    render(<SignupFormV3 />)
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Nome/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('keeps submit disabled until terms accepted', () => {
    render(<SignupFormV3 />)
    const submit = screen.getByRole('button', { name: /Criar conta/i })
    expect(submit).toBeDisabled()
  })

  it('shows error for invalid email on submit', async () => {
    const user = userEvent.setup()
    render(<SignupFormV3 />)

    await user.type(screen.getByLabelText(/Email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/Nome/i), 'Joao')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Criar conta/i }))

    await waitFor(() => {
      expect(screen.getByText(/Email invalido/i)).toBeInTheDocument()
    })
    expect(signupOTPMutate).not.toHaveBeenCalled()
  })

  it('calls signupOTP mutation with valid input and redirects', async () => {
    const user = userEvent.setup()
    render(<SignupFormV3 />)

    await user.type(screen.getByLabelText(/Email/i), 'gabriel@example.com')
    await user.type(screen.getByLabelText(/Nome/i), 'Gabriel')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /Criar conta/i }))

    await waitFor(() => {
      expect(signupOTPMutate).toHaveBeenCalledTimes(1)
    })
    expect(signupOTPMutate).toHaveBeenCalledWith({
      body: { email: 'gabriel@example.com', name: 'Gabriel' },
    })
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/signup/verify?email=gabriel%40example.com')
    })
  })
})
