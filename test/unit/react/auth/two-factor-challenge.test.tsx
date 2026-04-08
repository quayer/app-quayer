import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/',
}))

import { TwoFactorChallenge } from '@/client/components/auth/two-factor-challenge'

interface MockResponseInit {
  ok?: boolean
  status?: number
  json?: () => Promise<unknown>
}

function makeFetchResponse(init: MockResponseInit): Response {
  const { ok = true, status = 200, json = async () => ({}) } = init
  return {
    ok,
    status,
    json,
  } as unknown as Response
}

describe('TwoFactorChallenge', () => {
  const onSuccess = vi.fn()
  const onCancel = vi.fn()
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing in TOTP mode by default', () => {
    render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )
    expect(
      screen.getByRole('heading', { name: /Verificação em duas etapas/i }),
    ).toBeInTheDocument()
  })

  it('shows the TOTP description message', () => {
    render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )
    expect(screen.getByText(/aplicativo autenticador/i)).toBeInTheDocument()
  })

  it('renders an OTP input with id "totp-code"', () => {
    const { container } = render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )
    expect(container.querySelector('#totp-code')).not.toBeNull()
  })

  it('renders submit button initially disabled', () => {
    render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )
    const submit = screen.getByRole('button', { name: /Verificar código/i })
    expect(submit).toBeDisabled()
  })

  it('renders link to switch to recovery code mode', () => {
    render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )
    expect(
      screen.getByRole('button', { name: /Perdeu acesso ao autenticador/i }),
    ).toBeInTheDocument()
  })

  it('switches to recovery mode when the link is clicked', async () => {
    const user = userEvent.setup()
    render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )
    await user.click(
      screen.getByRole('button', { name: /Perdeu acesso ao autenticador/i }),
    )
    expect(screen.getByLabelText(/Código de recuperação/i)).toBeInTheDocument()
  })

  it('calls onCancel when the back-to-login button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )
    await user.click(screen.getByRole('button', { name: /Voltar ao login/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('submits recovery code via fetch and calls onSuccess on success', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({
        ok: true,
        json: async () => ({ data: { user: { role: 'admin' }, needsOnboarding: false } }),
      }),
    )

    render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )

    await user.click(
      screen.getByRole('button', { name: /Perdeu acesso ao autenticador/i }),
    )

    const input = screen.getByLabelText(/Código de recuperação/i)
    await user.type(input, 'a1b2c3d4')

    const submit = screen.getByRole('button', { name: /Verificar código de recuperação/i })
    await user.click(submit)

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/auth/totp-recovery',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(onSuccess).toHaveBeenCalledWith({
      user: { role: 'admin' },
      needsOnboarding: false,
    })
  })

  it('shows an error when recovery code submission fails', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      makeFetchResponse({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Código inválido' } }),
      }),
    )

    render(
      <TwoFactorChallenge challengeId="ch_123" onSuccess={onSuccess} onCancel={onCancel} />,
    )

    await user.click(
      screen.getByRole('button', { name: /Perdeu acesso ao autenticador/i }),
    )
    await user.type(screen.getByLabelText(/Código de recuperação/i), 'wrongcode')
    await user.click(
      screen.getByRole('button', { name: /Verificar código de recuperação/i }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/inválido/i)
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
