import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
const mockSignupOTPMutate = vi.fn().mockResolvedValue({ data: { success: true }, error: null })
const mockGoogleAuthQuery = vi.fn().mockResolvedValue({ data: { authUrl: 'https://accounts.google.com/auth' }, error: null })
vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      signupOTP: { mutate: (...args: unknown[]) => mockSignupOTPMutate(...args) },
      googleAuth: { query: (...args: unknown[]) => mockGoogleAuthQuery(...args) },
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

// Mock CSRF headers
vi.mock('@/client/hooks/use-csrf-token', () => ({
  getCsrfHeaders: vi.fn().mockReturnValue({}),
}))

// Mock translate-auth-error
vi.mock('@/lib/utils/translate-auth-error', () => ({
  translateAuthError: (msg: string) => msg,
}))

// Mock looksLikePhone - default to false (email mode)
vi.mock('@/lib/utils/phone', () => ({
  looksLikePhone: vi.fn().mockReturnValue(false),
}))

// Mock PhoneInput
vi.mock('@/client/components/ui/phone-input', () => ({
  PhoneInput: vi.fn().mockImplementation(({ id, value, onChange, disabled, placeholder, ...props }) => (
    <input
      id={id}
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      {...props}
    />
  )),
}))

// Stub sessionStorage
vi.stubGlobal('sessionStorage', {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
})

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

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignupOTPMutate.mockResolvedValue({ data: { success: true }, error: null })
    mockGoogleAuthQuery.mockResolvedValue({ data: { authUrl: 'https://accounts.google.com/auth' }, error: null })
  })

  it('renders name, email inputs and submit button', async () => {
    const { SignupForm } = await import(
      '@/client/components/auth/signup-form'
    )
    render(<SignupForm />, { wrapper: createWrapper() })

    expect(screen.getByLabelText(/Nome completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Email ou Telefone/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cadastrar com Email/i })).toBeInTheDocument()
  })

  it('shows validation error when name is empty on submit', async () => {
    const { SignupForm } = await import(
      '@/client/components/auth/signup-form'
    )
    render(<SignupForm />, { wrapper: createWrapper() })

    // Type email only, leave name empty
    const emailInput = screen.getByLabelText(/Email ou Telefone/i)
    await userEvent.type(emailInput, 'test@example.com')

    const submitBtn = screen.getByRole('button', { name: /Cadastrar com Email/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Informe seu nome/i)).toBeInTheDocument()
    })

    // API should not be called
    expect(mockSignupOTPMutate).not.toHaveBeenCalled()
  })

  it('shows validation error when email is empty on submit', async () => {
    const { SignupForm } = await import(
      '@/client/components/auth/signup-form'
    )
    render(<SignupForm />, { wrapper: createWrapper() })

    // Type name only, leave email empty
    const nameInput = screen.getByLabelText(/Nome completo/i)
    await userEvent.type(nameInput, 'Test User')

    const submitBtn = screen.getByRole('button', { name: /Cadastrar com Email/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Digite seu email/i)).toBeInTheDocument()
    })

    expect(mockSignupOTPMutate).not.toHaveBeenCalled()
  })

  it('shows loading state during submit', async () => {
    mockSignupOTPMutate.mockImplementation(() => new Promise(() => {}))

    const { SignupForm } = await import(
      '@/client/components/auth/signup-form'
    )
    render(<SignupForm />, { wrapper: createWrapper() })

    const nameInput = screen.getByLabelText(/Nome completo/i)
    await userEvent.type(nameInput, 'Test User')

    const emailInput = screen.getByLabelText(/Email ou Telefone/i)
    await userEvent.type(emailInput, 'test@example.com')

    const submitBtn = screen.getByRole('button', { name: /Cadastrar com Email/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/Enviando c.*digo.../i)).toBeInTheDocument()
    })

    const busyButton = screen.getByRole('button', { name: /Enviando c.*digo.../i })
    expect(busyButton).toHaveAttribute('aria-busy', 'true')
  })

  it('links to login page', async () => {
    const { SignupForm } = await import(
      '@/client/components/auth/signup-form'
    )
    render(<SignupForm />, { wrapper: createWrapper() })

    const loginLink = screen.getByRole('link', { name: /Fa.*login/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('has accessible form labels', async () => {
    const { SignupForm } = await import(
      '@/client/components/auth/signup-form'
    )
    const { container } = render(<SignupForm />, { wrapper: createWrapper() })

    expectAccessibleForm(container)
  })

  it('shows error when API returns error', async () => {
    mockSignupOTPMutate.mockRejectedValueOnce({
      error: { message: 'Email ja cadastrado' },
    })

    const { SignupForm } = await import(
      '@/client/components/auth/signup-form'
    )
    render(<SignupForm />, { wrapper: createWrapper() })

    const nameInput = screen.getByLabelText(/Nome completo/i)
    await userEvent.type(nameInput, 'Test User')

    const emailInput = screen.getByLabelText(/Email ou Telefone/i)
    await userEvent.type(emailInput, 'existing@example.com')

    const submitBtn = screen.getByRole('button', { name: /Cadastrar com Email/i })
    await userEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('renders Google signup button', async () => {
    const { SignupForm } = await import(
      '@/client/components/auth/signup-form'
    )
    render(<SignupForm />, { wrapper: createWrapper() })

    expect(screen.getByRole('button', { name: /Continuar com Google/i })).toBeInTheDocument()
  })
})
