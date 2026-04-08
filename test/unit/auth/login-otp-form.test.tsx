import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expectAccessibleForm } from '../../helpers/a11y-helpers'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

// Mock igniter.client
const mockVerifyLoginOTP = vi.fn().mockResolvedValue({
  data: { user: { role: 'member' }, needsOnboarding: false },
  error: null,
})
const mockVerifySignupOTP = vi.fn().mockResolvedValue({
  data: { user: { role: 'member' }, needsOnboarding: false },
  error: null,
})
const mockLoginOTPMutate = vi.fn().mockResolvedValue({ data: {}, error: null })
const mockCheckMagicLinkStatus = vi.fn().mockResolvedValue({ data: { verified: false }, error: null })
vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      verifyLoginOTP: { mutate: (...args: unknown[]) => mockVerifyLoginOTP(...args) },
      verifySignupOTP: { mutate: (...args: unknown[]) => mockVerifySignupOTP(...args) },
      loginOTP: { mutate: (...args: unknown[]) => mockLoginOTPMutate(...args) },
      checkMagicLinkStatus: { mutate: (...args: unknown[]) => mockCheckMagicLinkStatus(...args) },
    },
  },
}))

// Mock TurnstileWidget
vi.mock('@/client/components/auth/turnstile-widget', () => ({
  TurnstileWidget: ({ onSuccess }: { onSuccess: (token: string) => void }) => {
    onSuccess('mock-turnstile-token')
    return <div data-testid="turnstile-widget" />
  },
}))

// Mock TwoFactorChallenge
vi.mock('@/client/components/auth/two-factor-challenge', () => ({
  TwoFactorChallenge: () => <div data-testid="two-factor-challenge" />,
}))

// Mock CSRF headers
vi.mock('@/client/hooks/use-csrf-token', () => ({
  getCsrfHeaders: vi.fn().mockReturnValue({}),
}))

// Mock translate-auth-error
vi.mock('@/lib/utils/translate-auth-error', () => ({
  translateAuthError: (msg: string) => msg,
}))

// Mock BroadcastChannel
vi.stubGlobal('BroadcastChannel', vi.fn().mockImplementation(() => ({
  onmessage: null,
  close: vi.fn(),
  postMessage: vi.fn(),
})))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('LoginOTPForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockVerifyLoginOTP.mockResolvedValue({
      data: { user: { role: 'member' }, needsOnboarding: false },
      error: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders OTP input and verify button', async () => {
    const { LoginOTPForm } = await import(
      '@/client/components/auth/login-otp-form'
    )
    render(<LoginOTPForm email="test@example.com" />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { name: /Verificar c.*digo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Verificar c.*digo/i })).toBeInTheDocument()
  })

  it('displays the email address in the description', async () => {
    const { LoginOTPForm } = await import(
      '@/client/components/auth/login-otp-form'
    )
    render(<LoginOTPForm email="user@domain.com" />, { wrapper: createWrapper() })

    expect(screen.getByText(/user@domain.com/)).toBeInTheDocument()
  })

  it('shows countdown timer for resend', async () => {
    const { LoginOTPForm } = await import(
      '@/client/components/auth/login-otp-form'
    )
    render(<LoginOTPForm email="test@example.com" />, { wrapper: createWrapper() })

    // Initially shows countdown (resend disabled)
    expect(screen.getByText(/Aguarde \d+s/)).toBeInTheDocument()
  })

  it('resend button appears after countdown expires', async () => {
    const { LoginOTPForm } = await import(
      '@/client/components/auth/login-otp-form'
    )
    render(<LoginOTPForm email="test@example.com" />, { wrapper: createWrapper() })

    // Advance time past the 60s countdown
    await act(async () => {
      vi.advanceTimersByTime(61000)
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reenviar/i })).toBeInTheDocument()
    })
  })

  it('shows error for missing identifier', async () => {
    const { LoginOTPForm } = await import(
      '@/client/components/auth/login-otp-form'
    )
    // Render without email or phone
    render(<LoginOTPForm />, { wrapper: createWrapper() })

    // The verify button should be disabled when no identifier
    const verifyBtn = screen.getByRole('button', { name: /Verificar c.*digo/i })
    expect(verifyBtn).toBeDisabled()
  })

  it('has accessible labels for OTP input', async () => {
    const { LoginOTPForm } = await import(
      '@/client/components/auth/login-otp-form'
    )
    render(<LoginOTPForm email="test@example.com" />, { wrapper: createWrapper() })

    // The sr-only label should exist
    expect(screen.getByText(/C.*digo de verifica/i)).toBeInTheDocument()
  })

  it('shows back link to login page', async () => {
    const { LoginOTPForm } = await import(
      '@/client/components/auth/login-otp-form'
    )
    render(<LoginOTPForm email="test@example.com" />, { wrapper: createWrapper() })

    const backLink = screen.getByRole('link', { name: /Voltar/i })
    expect(backLink).toHaveAttribute('href', '/login')
  })

  it('displays WhatsApp indicator when phone is provided', async () => {
    const { LoginOTPForm } = await import(
      '@/client/components/auth/login-otp-form'
    )
    render(<LoginOTPForm phone="+5511999887766" />, { wrapper: createWrapper() })

    // The component shows "WhatsApp" in the description text
    expect(screen.getByText(/Enviado via/i)).toBeInTheDocument()
  })
})
