import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const pushMock = vi.fn()
let searchParamsString = 'code=test-auth-code'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
  usePathname: () => '/google-callback',
}))

const googleCallbackMutate = vi.fn()
vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      googleCallback: { mutate: (...args: unknown[]) => googleCallbackMutate(...args) },
    },
  },
}))

vi.mock('@/client/components/auth/two-factor-challenge', () => ({
  TwoFactorChallenge: () => <div data-testid="two-factor-challenge" />,
}))

import { GoogleCallbackV3 } from '@/client/components/auth/google-callback-v3'

const originalLocation = window.location

describe('GoogleCallbackV3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchParamsString = 'code=test-auth-code'
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' } as Location,
    })
  })

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  it('renders loading state initially', () => {
    googleCallbackMutate.mockImplementation(() => new Promise(() => {}))
    render(<GoogleCallbackV3 />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Concluindo login/i)).toBeInTheDocument()
  })

  it('calls googleCallback mutation with code from search params', async () => {
    googleCallbackMutate.mockResolvedValue({
      data: { user: { role: 'user', currentOrgId: 'org_1' }, needsOnboarding: false },
      error: null,
    })
    render(<GoogleCallbackV3 />)
    await waitFor(() => {
      expect(googleCallbackMutate).toHaveBeenCalledWith({
        body: { code: 'test-auth-code' },
      })
    })
  })

  it('renders 2FA challenge when API returns requiresTwoFactor', async () => {
    googleCallbackMutate.mockResolvedValue({
      data: { requiresTwoFactor: true, challengeId: 'chal_1' },
      error: null,
    })
    render(<GoogleCallbackV3 />)
    await waitFor(() => {
      expect(screen.getByTestId('two-factor-challenge')).toBeInTheDocument()
    })
  })

  it('renders error state when API returns an error', async () => {
    googleCallbackMutate.mockResolvedValue({
      data: null,
      error: { message: 'Codigo expirado' },
    })
    render(<GoogleCallbackV3 />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Falha no login com Google/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/Codigo expirado/i)
  })

  it('renders error state when search params include error param', async () => {
    searchParamsString = 'error=access_denied'
    render(<GoogleCallbackV3 />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Falha no login com Google/i })).toBeInTheDocument()
    })
    expect(googleCallbackMutate).not.toHaveBeenCalled()
  })
})
