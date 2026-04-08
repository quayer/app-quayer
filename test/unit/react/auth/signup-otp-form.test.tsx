import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/',
}))

// Mock TurnstileWidget — uses external Cloudflare script
vi.mock('@/client/components/auth/turnstile-widget', () => ({
  TurnstileWidget: ({ onSuccess }: { onSuccess: (token: string) => void }) => {
    // Simulate immediate token issue so the form is testable
    setTimeout(() => onSuccess('test-token'), 0)
    return null
  },
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

import { SignupOTPForm } from '@/client/components/auth/signup-otp-form'

describe('SignupOTPForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifySignupOTPMutate.mockResolvedValue({ data: null, error: null })
    signupOTPMutate.mockResolvedValue({ data: null, error: null })
  })

  it('renders without crashing with required props', () => {
    render(<SignupOTPForm email="new@example.com" name="Alice" />)
    expect(screen.getByRole('heading', { name: /Verificação/i })).toBeInTheDocument()
  })

  it('shows the email in the description text', () => {
    render(<SignupOTPForm email="new@example.com" name="Alice" />)
    expect(screen.getByText(/new@example\.com/)).toBeInTheDocument()
  })

  it('renders an OTP input with id "otp"', () => {
    const { container } = render(<SignupOTPForm email="new@example.com" name="Alice" />)
    expect(container.querySelector('#otp')).not.toBeNull()
  })

  it('disables the submit button when no code entered', () => {
    render(<SignupOTPForm email="new@example.com" name="Alice" />)
    const submit = screen.getByRole('button', { name: /Verificar/i })
    expect(submit).toBeDisabled()
  })

  it('renders the back-to-signup link', () => {
    render(<SignupOTPForm email="new@example.com" name="Alice" />)
    const link = screen.getByRole('link', { name: /Voltar para cadastro/i })
    expect(link).toHaveAttribute('href', '/signup')
  })

  it('does not call the API on initial render', async () => {
    const user = userEvent.setup()
    render(<SignupOTPForm email="new@example.com" name="Alice" />)
    await user.tab()
    expect(verifySignupOTPMutate).not.toHaveBeenCalled()
  })

  it('renders the resend countdown waiting state', () => {
    render(<SignupOTPForm email="new@example.com" name="Alice" />)
    expect(screen.getByText(/Aguarde/i)).toBeInTheDocument()
  })
})
