import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/',
}))

const verifyEmailMutate = vi.fn()
const resendVerificationMutate = vi.fn()

vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      verifyEmail: { mutate: (...args: unknown[]) => verifyEmailMutate(...args) },
      resendVerification: { mutate: (...args: unknown[]) => resendVerificationMutate(...args) },
    },
  },
}))

import { VerifyEmailForm } from '@/client/components/auth/verify-email-form'

describe('VerifyEmailForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    verifyEmailMutate.mockResolvedValue({ data: null, error: null })
    resendVerificationMutate.mockResolvedValue({ data: null, error: null })
  })

  it('renders without crashing with email prop', () => {
    render(<VerifyEmailForm email="user@example.com" />)
    expect(screen.getByRole('heading', { name: /Verificação de email/i })).toBeInTheDocument()
  })

  it('shows the email in the description text', () => {
    render(<VerifyEmailForm email="user@example.com" />)
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument()
  })

  it('renders an OTP input with id "otp"', () => {
    const { container } = render(<VerifyEmailForm email="user@example.com" />)
    expect(container.querySelector('#otp')).not.toBeNull()
  })

  it('disables submit when no code is entered', () => {
    render(<VerifyEmailForm email="user@example.com" />)
    const submit = screen.getByRole('button', { name: /Verificar/i })
    expect(submit).toBeDisabled()
  })

  it('renders fallback "seu email" when no email provided', () => {
    render(<VerifyEmailForm />)
    const matches = screen.getAllByText(/seu email/i)
    expect(matches.length).toBeGreaterThan(0)
  })

  it('renders the back link to /login', () => {
    render(<VerifyEmailForm email="user@example.com" />)
    const link = screen.getByRole('link', { name: /Voltar/i })
    expect(link).toHaveAttribute('href', '/login')
  })

  it('does not call the API on initial render', async () => {
    const user = userEvent.setup()
    render(<VerifyEmailForm email="user@example.com" />)
    await user.tab()
    expect(verifyEmailMutate).not.toHaveBeenCalled()
  })

  it('renders the resend countdown waiting state', () => {
    render(<VerifyEmailForm email="user@example.com" />)
    expect(screen.getByText(/Aguarde/i)).toBeInTheDocument()
  })
})
