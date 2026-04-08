import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock next/navigation BEFORE importing the component
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/',
}))

// Mock the CSRF helper
vi.mock('@/client/hooks/use-csrf-token', () => ({
  getCsrfHeaders: () => ({ 'x-csrf-token': 'test-token' }),
  useCsrfToken: () => ({ token: 'test-token', isLoading: false }),
}))

// Mock the Igniter client
const verifyLoginOTPMutate = vi.fn()
const loginOTPMutate = vi.fn()
const checkMagicLinkStatusMutate = vi.fn()
const verifySignupOTPMutate = vi.fn()

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      verifyLoginOTP: { mutate: (...args: unknown[]) => verifyLoginOTPMutate(...args) },
      verifySignupOTP: { mutate: (...args: unknown[]) => verifySignupOTPMutate(...args) },
      loginOTP: { mutate: (...args: unknown[]) => loginOTPMutate(...args) },
      checkMagicLinkStatus: { mutate: (...args: unknown[]) => checkMagicLinkStatusMutate(...args) },
    },
  },
}))

import { LoginOTPForm } from '@/client/components/auth/login-otp-form'

describe('LoginOTPForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyLoginOTPMutate.mockResolvedValue({ data: null, error: null })
    loginOTPMutate.mockResolvedValue({ data: null, error: null })
  })

  it('renders without crashing with email prop', () => {
    render(<LoginOTPForm email="user@example.com" />)
    expect(screen.getByRole('heading', { name: /Verificar código/i })).toBeInTheDocument()
  })

  it('shows the email in the description text', () => {
    render(<LoginOTPForm email="user@example.com" />)
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument()
  })

  it('renders the OTP input with id "otp"', () => {
    const { container } = render(<LoginOTPForm email="user@example.com" />)
    expect(container.querySelector('#otp')).not.toBeNull()
  })

  it('keeps submit button disabled when no code entered', () => {
    render(<LoginOTPForm email="user@example.com" />)
    const submit = screen.getByRole('button', { name: /Verificar código/i })
    expect(submit).toBeDisabled()
  })

  it('renders the resend countdown initially in disabled state', () => {
    render(<LoginOTPForm email="user@example.com" />)
    expect(screen.getByText(/Aguarde/i)).toBeInTheDocument()
  })

  it('renders the back link to /login', () => {
    render(<LoginOTPForm email="user@example.com" />)
    const link = screen.getByRole('link', { name: /Voltar/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('does not call the API on render', async () => {
    const user = userEvent.setup()
    render(<LoginOTPForm email="user@example.com" />)
    // give effects a tick
    await user.tab()
    expect(verifyLoginOTPMutate).not.toHaveBeenCalled()
  })

  it('renders WhatsApp text when phone prop is provided', () => {
    render(<LoginOTPForm phone="+5511999999999" />)
    const matches = screen.getAllByText(/WhatsApp/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('shows fallback "seu email" when no email/phone provided', () => {
    render(<LoginOTPForm />)
    const matches = screen.getAllByText(/seu email/i)
    expect(matches.length).toBeGreaterThan(0)
  })
})
