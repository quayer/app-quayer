import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}))

const loginOTPMutate = vi.fn()
const verifyLoginOTPMutate = vi.fn()

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      loginOTP: { mutate: (...args: unknown[]) => loginOTPMutate(...args) },
      verifyLoginOTP: { mutate: (...args: unknown[]) => verifyLoginOTPMutate(...args) },
    },
  },
}))

import { LoginFormV3 } from '@/client/components/auth/login-form-v3'

describe('LoginFormV3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loginOTPMutate.mockResolvedValue({ data: null, error: null })
  })

  it('renders email input and submit button', () => {
    render(<LoginFormV3 />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continuar com email/i })).toBeInTheDocument()
  })

  it('typing fills the email input', async () => {
    const user = userEvent.setup()
    render(<LoginFormV3 />)
    const input = screen.getByLabelText(/email/i) as HTMLInputElement
    await user.type(input, 'user@example.com')
    expect(input.value).toBe('user@example.com')
  })

  it('shows error on submit with invalid email and does not call mutate', async () => {
    const user = userEvent.setup()
    render(<LoginFormV3 />)
    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /continuar com email/i }))
    await waitFor(() => {
      expect(screen.getByText(/email invalido/i)).toBeInTheDocument()
    })
    expect(loginOTPMutate).not.toHaveBeenCalled()
  })

  it('calls api.auth.loginOTP.mutate with valid email and pushes verify route', async () => {
    const user = userEvent.setup()
    loginOTPMutate.mockResolvedValueOnce({ data: { isNewUser: false }, error: null })
    render(<LoginFormV3 />)
    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /continuar com email/i }))
    await waitFor(() => {
      expect(loginOTPMutate).toHaveBeenCalledTimes(1)
    })
    expect(loginOTPMutate).toHaveBeenCalledWith({ body: { email: 'user@example.com' } })
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/login/verify?email=user%40example.com'))
    })
  })
})
