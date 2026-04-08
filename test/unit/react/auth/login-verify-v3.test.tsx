import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('email=user@example.com'),
  usePathname: () => '/login/verify',
}))

const verifyLoginOTPMutate = vi.fn()
const loginOTPMutate = vi.fn()

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      verifyLoginOTP: { mutate: (...args: unknown[]) => verifyLoginOTPMutate(...args) },
      loginOTP: { mutate: (...args: unknown[]) => loginOTPMutate(...args) },
    },
  },
}))

import { LoginVerifyV3 } from '@/client/components/auth/login-verify-v3'

describe('LoginVerifyV3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyLoginOTPMutate.mockResolvedValue({ data: { needsOnboarding: false }, error: null })
    loginOTPMutate.mockResolvedValue({ data: null, error: null })
  })

  it('renders 6 OTP slots', () => {
    const { container } = render(<LoginVerifyV3 />)
    const slots = container.querySelectorAll('input[inputmode="numeric"]')
    expect(slots.length).toBe(6)
  })

  it('typing in slot 1 advances focus to slot 2', async () => {
    const user = userEvent.setup()
    const { container } = render(<LoginVerifyV3 />)
    const slots = container.querySelectorAll('input[inputmode="numeric"]') as NodeListOf<HTMLInputElement>
    slots[0].focus()
    await user.keyboard('1')
    await waitFor(() => {
      expect(document.activeElement).toBe(slots[1])
    })
  })

  it('submit button disabled until 6 digits entered', async () => {
    const user = userEvent.setup()
    const { container } = render(<LoginVerifyV3 />)
    const submit = screen.getByRole('button', { name: /^verificar$/i }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    const slots = container.querySelectorAll('input[inputmode="numeric"]') as NodeListOf<HTMLInputElement>
    slots[0].focus()
    await user.keyboard('123456')
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /^verificar$/i }) as HTMLButtonElement).disabled).toBe(false)
    })
  })

  it('submit calls api.auth.verifyLoginOTP.mutate with email and code', async () => {
    const user = userEvent.setup()
    const { container } = render(<LoginVerifyV3 />)
    const slots = container.querySelectorAll('input[inputmode="numeric"]') as NodeListOf<HTMLInputElement>
    slots[0].focus()
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: /^verificar$/i }))
    await waitFor(() => {
      expect(verifyLoginOTPMutate).toHaveBeenCalledTimes(1)
    })
    expect(verifyLoginOTPMutate).toHaveBeenCalledWith({
      body: { email: 'user@example.com', code: '123456' },
    })
  })
})
