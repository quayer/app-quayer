import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

// Mock igniter.client
vi.mock('@/igniter.client', () => ({
  api: {},
  getAuthHeaders: vi.fn(() => ({})),
}))

// Mock translate-auth-error
vi.mock('@/lib/utils/translate-auth-error', () => ({
  translateAuthError: vi.fn((msg: string) => {
    const translations: Record<string, string> = {
      'Invalid TOTP code.': 'Código inválido. Tente novamente.',
      'Invalid recovery code.': 'Código de recuperação inválido.',
    }
    return translations[msg] || msg
  }),
}))

import { TwoFactorChallenge } from '@/client/components/auth/two-factor-challenge'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  function TestQueryClientProvider({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return TestQueryClientProvider
}

describe('TwoFactorChallenge', () => {
  const defaultProps = {
    challengeId: 'challenge-abc-123',
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the TOTP input field with 6 slots', () => {
    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() })

    expect(screen.getByText('Verificação em duas etapas')).toBeInTheDocument()
    expect(screen.getByText(/Digite o código de 6 dígitos/)).toBeInTheDocument()

    // The TOTP code label (sr-only)
    expect(screen.getByLabelText('Código TOTP')).toBeInTheDocument()

    // Submit button should be disabled when code is empty
    const submitButton = screen.getByRole('button', { name: /verificar código/i })
    expect(submitButton).toBeDisabled()
  })

  it('should show the backup code option link', () => {
    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() })

    const recoveryLink = screen.getByRole('button', { name: /perdeu acesso ao autenticador/i })
    expect(recoveryLink).toBeInTheDocument()
  })

  it('should switch to recovery code mode when clicking the link', async () => {
    const user = userEvent.setup()
    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() })

    const recoveryLink = screen.getByRole('button', { name: /perdeu acesso ao autenticador/i })
    await user.click(recoveryLink)

    // Recovery mode should now show
    expect(screen.getByText(/Digite um dos seus códigos de recuperação/)).toBeInTheDocument()
    expect(screen.getByLabelText(/código de recuperação/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verificar código de recuperação/i })).toBeInTheDocument()

    // Should have option to go back to TOTP
    expect(screen.getByRole('button', { name: /usar código do autenticador/i })).toBeInTheDocument()
  })

  it('should show error for invalid TOTP code from API response', async () => {
    server.use(
      http.post('/api/v1/auth/totp-challenge', () => {
        return HttpResponse.json(
          { error: { message: 'Invalid TOTP code.' }, attemptsRemaining: 4 },
          { status: 401 }
        )
      })
    )

    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() })

    const input = screen.getByLabelText('Código TOTP')
    await userEvent.type(input, '123456')

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent('Código inválido. Tente novamente.')
    })
  })

  it('should show loading state during verification', async () => {
    server.use(
      http.post('/api/v1/auth/totp-challenge', () => {
        // Never resolve to keep loading state
        return new Promise(() => {})
      })
    )

    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() })

    const input = screen.getByLabelText('Código TOTP')
    await userEvent.type(input, '123456')

    await waitFor(() => {
      expect(screen.getByText('Verificando...')).toBeInTheDocument()
    })
  })

  it('should call onCancel when clicking "Voltar ao login"', async () => {
    const user = userEvent.setup()
    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() })

    const cancelButton = screen.getByRole('button', { name: /voltar ao login/i })
    await user.click(cancelButton)

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('should call onSuccess with user data on successful TOTP verification', async () => {
    const successData = {
      user: { role: 'admin', currentOrgId: 'org-1' },
      needsOnboarding: false,
    }

    server.use(
      http.post('/api/v1/auth/totp-challenge', () => {
        return HttpResponse.json({ data: successData })
      })
    )

    render(<TwoFactorChallenge {...defaultProps} />, { wrapper: createWrapper() })

    const input = screen.getByLabelText('Código TOTP')
    await userEvent.type(input, '654321')

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalledWith(successData)
    })
  })
})
