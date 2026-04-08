import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('email=gabriel%40example.com'),
  usePathname: () => '/signup/verify',
}))

const verifySignupOTPMutate = vi.fn()
const signupOTPMutate = vi.fn()

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      verifySignupOTP: { mutate: (...args: unknown[]) => verifySignupOTPMutate(...args) },
      signupOTP: { mutate: (...args: unknown[]) => signupOTPMutate(...args) },
    },
  },
}))

import { SignupVerifyV3 } from '@/client/components/auth/signup-verify-v3'

describe('SignupVerifyV3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifySignupOTPMutate.mockResolvedValue({ data: null, error: null })
    signupOTPMutate.mockResolvedValue({ data: null, error: null })
  })

  it('renders 6 OTP slots', () => {
    render(<SignupVerifyV3 />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(6)
  })

  it('keeps submit disabled until 6 digits entered', async () => {
    const user = userEvent.setup()
    render(<SignupVerifyV3 />)
    const submit = screen.getByRole('button', { name: /Verificar/i })
    expect(submit).toBeDisabled()

    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 5; i += 1) {
      await user.type(inputs[i]!, String(i + 1))
    }
    expect(submit).toBeDisabled()
  })

  it('calls verifySignupOTP mutation with 6 digits and redirects to /onboarding', async () => {
    const user = userEvent.setup()
    render(<SignupVerifyV3 />)

    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i += 1) {
      await user.type(inputs[i]!, String(i + 1))
    }

    await user.click(screen.getByRole('button', { name: /Verificar/i }))

    await waitFor(() => {
      expect(verifySignupOTPMutate).toHaveBeenCalledTimes(1)
    })
    expect(verifySignupOTPMutate).toHaveBeenCalledWith({
      body: { email: 'gabriel@example.com', code: '123456' },
    })
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('renders email from search params', () => {
    render(<SignupVerifyV3 />)
    expect(screen.getByText(/gabriel@example\.com/)).toBeInTheDocument()
  })
})
