import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/onboarding',
}))

const createOrgMock = vi.fn()
vi.mock('@/app/(auth)/onboarding/actions', () => ({
  createOrganizationAction: (...args: unknown[]) => createOrgMock(...args),
}))

vi.mock('@/client/hooks/use-csrf-token', () => ({
  getCsrfHeaders: () => ({ 'x-csrf-token': 'test-csrf' }),
}))

import { OnboardingV3 } from '@/client/components/auth/onboarding-v3'

describe('OnboardingV3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createOrgMock.mockResolvedValue({ success: true, organization: { id: 'org_1' } })

    // mock fetch for /api/v1/auth/profile
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch
  })

  it('renders step 1 with name and company inputs', () => {
    render(<OnboardingV3 />)
    expect(screen.getByRole('heading', { name: /Configure sua conta/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nome$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Sobrenome/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Nome da empresa/i)).toBeInTheDocument()
    expect(screen.getByText(/Passo 1 de 2/i)).toBeInTheDocument()
  })

  it('shows validation errors when fields are too short', async () => {
    const user = userEvent.setup()
    render(<OnboardingV3 />)
    await user.click(screen.getByRole('button', { name: /Continuar/i }))
    await waitFor(() => {
      expect(screen.getAllByText(/muito curto/i).length).toBeGreaterThan(0)
    })
  })

  it('advances from step 1 to step 2 when valid data is entered', async () => {
    const user = userEvent.setup()
    render(<OnboardingV3 />)

    await user.type(screen.getByLabelText(/^Nome$/i), 'Joao')
    await user.type(screen.getByLabelText(/Sobrenome/i), 'Silva')
    await user.type(screen.getByLabelText(/Nome da empresa/i), 'Quayer')
    await user.click(screen.getByRole('button', { name: /Continuar/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Confirme seus dados/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/Passo 2 de 2/i)).toBeInTheDocument()
    expect(screen.getByText('Joao Silva')).toBeInTheDocument()
    expect(screen.getByText('Quayer')).toBeInTheDocument()
  })

  it('submits on step 2 — patches profile, creates org, redirects', async () => {
    const user = userEvent.setup()
    render(<OnboardingV3 />)

    await user.type(screen.getByLabelText(/^Nome$/i), 'Joao')
    await user.type(screen.getByLabelText(/Sobrenome/i), 'Silva')
    await user.type(screen.getByLabelText(/Nome da empresa/i), 'Quayer')
    await user.click(screen.getByRole('button', { name: /Continuar/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Finalizar/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Finalizar/i }))

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/auth/profile',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
    await waitFor(() => {
      expect(createOrgMock).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/')
    })
  })

  it('shows submit error when createOrganizationAction fails', async () => {
    createOrgMock.mockResolvedValueOnce({ success: false, error: 'Org duplicada' })
    const user = userEvent.setup()
    render(<OnboardingV3 />)

    await user.type(screen.getByLabelText(/^Nome$/i), 'Joao')
    await user.type(screen.getByLabelText(/Sobrenome/i), 'Silva')
    await user.type(screen.getByLabelText(/Nome da empresa/i), 'Quayer')
    await user.click(screen.getByRole('button', { name: /Continuar/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Finalizar/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Finalizar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Org duplicada/i)
    })
  })

  it('Voltar button on step 2 returns to step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingV3 />)
    await user.type(screen.getByLabelText(/^Nome$/i), 'Joao')
    await user.type(screen.getByLabelText(/Sobrenome/i), 'Silva')
    await user.type(screen.getByLabelText(/Nome da empresa/i), 'Quayer')
    await user.click(screen.getByRole('button', { name: /Continuar/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Voltar/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Voltar/i }))
    expect(screen.getByText(/Passo 1 de 2/i)).toBeInTheDocument()
  })
})
