import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock igniter.client API calls
vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      verifyEmail: { mutate: vi.fn() },
      resendVerification: { mutate: vi.fn() },
    },
  },
  getAuthHeaders: vi.fn(() => ({})),
}))

// Mock translate-auth-error
vi.mock('@/lib/utils/translate-auth-error', () => ({
  translateAuthError: vi.fn((msg: string) => msg),
}))

// We need to re-import after mocks to wire the mock functions
import { api } from '@/igniter.client'
import { VerifyEmailForm } from '@/client/components/auth/verify-email-form'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('VerifyEmailForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the mock implementations
    vi.mocked(api.auth.verifyEmail.mutate).mockReset()
    vi.mocked(api.auth.resendVerification.mutate).mockReset()
  })

  it('should render the verification UI with email hint', () => {
    render(<VerifyEmailForm email="test@example.com" />, { wrapper: createWrapper() })

    expect(screen.getByText('Verificação de email')).toBeInTheDocument()
    expect(screen.getByText(/Enviamos um código de 6 dígitos para test@example.com/)).toBeInTheDocument()

    // OTP input label (sr-only)
    expect(screen.getByLabelText('Código de verificação')).toBeInTheDocument()

    // Submit button exists and is disabled initially
    const submitButton = screen.getByRole('button', { name: /verificar/i })
    expect(submitButton).toBeDisabled()
  })

  it('should show success state after successful verification', async () => {
    vi.mocked(api.auth.verifyEmail.mutate).mockResolvedValueOnce({
      data: {
        verified: true,
        user: { id: 'u-1', email: 'test@example.com', name: 'Test', role: 'member' },
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof api.auth.verifyEmail.mutate>>)

    render(<VerifyEmailForm email="test@example.com" />, { wrapper: createWrapper() })

    const input = screen.getByLabelText('Código de verificação')
    await userEvent.type(input, '123456')

    await waitFor(() => {
      expect(screen.getByText('Email verificado!')).toBeInTheDocument()
      // "Redirecionando..." appears in both visible text and sr-only span
      const redirectTexts = screen.getAllByText('Redirecionando...')
      expect(redirectTexts.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('should show error state for invalid/expired code', async () => {
    vi.mocked(api.auth.verifyEmail.mutate).mockResolvedValueOnce({
      data: null,
      error: { message: 'Código inválido ou expirado.' },
    } as unknown as Awaited<ReturnType<typeof api.auth.verifyEmail.mutate>>)

    render(<VerifyEmailForm email="test@example.com" />, { wrapper: createWrapper() })

    const input = screen.getByLabelText('Código de verificação')
    await userEvent.type(input, '000000')

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent('Código inválido ou expirado.')
    })
  })

  it('should have a resend button with countdown timer', () => {
    render(<VerifyEmailForm email="test@example.com" />, { wrapper: createWrapper() })

    // Initially shows countdown, not the Reenviar button
    expect(screen.getByText(/Não recebeu o código/)).toBeInTheDocument()
    expect(screen.getByText(/Aguarde/)).toBeInTheDocument()

    // Resend button should not be clickable while countdown is active
    expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument()
  })

  it('should have accessible form labels and back link', () => {
    render(<VerifyEmailForm email="test@example.com" />, { wrapper: createWrapper() })

    // OTP field has accessible label
    const otpInput = screen.getByLabelText('Código de verificação')
    expect(otpInput).toBeInTheDocument()

    // aria-busy on submit button
    const submitButton = screen.getByRole('button', { name: /verificar/i })
    expect(submitButton).toHaveAttribute('aria-busy', 'false')

    // Back link to login
    const backLink = screen.getByRole('link', { name: /voltar/i })
    expect(backLink).toHaveAttribute('href', '/login')
  })

  it('should show error when email is missing', async () => {
    render(<VerifyEmailForm />, { wrapper: createWrapper() })

    // The description text should show fallback
    expect(screen.getByText(/Enviamos um código de 6 dígitos para seu email/)).toBeInTheDocument()

    // OTP input should be disabled without email
    const otpInput = screen.getByLabelText('Código de verificação')
    expect(otpInput).toBeDisabled()
  })
})
