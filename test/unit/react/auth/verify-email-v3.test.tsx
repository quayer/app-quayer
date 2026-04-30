import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()
let searchParamsString = 'email=user%40example.com'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
  usePathname: () => '/verify-email',
}))

const verifyEmailMutate = vi.fn()
vi.mock('@/igniter.client', () => ({
  api: {
    auth: {
      verifyEmail: { mutate: (...args: unknown[]) => verifyEmailMutate(...args) },
    },
  },
}))

import { VerifyEmailV3 } from '@/client/components/auth/verify-email-v3'

describe('VerifyEmailV3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchParamsString = 'email=user%40example.com'
    verifyEmailMutate.mockResolvedValue({ data: { verified: true }, error: null })
  })

  it('renders idle state with manual OTP input when no token in url', () => {
    render(<VerifyEmailV3 />)
    expect(screen.getByRole('heading', { name: /Verificar email/i })).toBeInTheDocument()
    expect(screen.getByRole('group')).toBeInTheDocument()
  })

  it('disables submit until 6 digit code is entered', () => {
    render(<VerifyEmailV3 />)
    const submit = screen.getByRole('button', { name: /Verificar/i })
    expect(submit).toBeDisabled()
  })

  it('manual OTP submit calls verifyEmail mutation', async () => {
    const user = userEvent.setup()
    render(<VerifyEmailV3 />)
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i += 1) {
      await user.type(inputs[i] as HTMLInputElement, String(i + 1))
    }
    const submit = screen.getByRole('button', { name: /Verificar/i })
    await user.click(submit)
    await waitFor(() => {
      expect(verifyEmailMutate).toHaveBeenCalledWith({
        body: { email: 'user@example.com', code: '123456' },
      })
    })
  })

  it('renders success state after a successful verification', async () => {
    const user = userEvent.setup()
    render(<VerifyEmailV3 />)
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i += 1) {
      await user.type(inputs[i] as HTMLInputElement, '1')
    }
    await user.click(screen.getByRole('button', { name: /Verificar/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Email verificado/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument()
  })

  it('renders error state when API returns an error', async () => {
    verifyEmailMutate.mockResolvedValueOnce({
      data: null,
      error: { message: 'Codigo expirado' },
    })
    const user = userEvent.setup()
    render(<VerifyEmailV3 />)
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i += 1) {
      await user.type(inputs[i] as HTMLInputElement, '1')
    }
    await user.click(screen.getByRole('button', { name: /Verificar/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Falha na verificacao/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/Codigo expirado/i)
  })

  it('auto-verifies when token is present in searchParams', async () => {
    searchParamsString = 'email=user%40example.com&token=999888'
    render(<VerifyEmailV3 />)
    await waitFor(() => {
      expect(verifyEmailMutate).toHaveBeenCalledWith({
        body: { email: 'user@example.com', code: '999888' },
      })
    })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Email verificado/i })).toBeInTheDocument()
    })
  })

  it('clicking Continuar after success calls router.push to /', async () => {
    const user = userEvent.setup()
    render(<VerifyEmailV3 />)
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i += 1) {
      await user.type(inputs[i] as HTMLInputElement, '1')
    }
    await user.click(screen.getByRole('button', { name: /Verificar/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Continuar/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Continuar/i }))
    expect(pushMock).toHaveBeenCalledWith('/')
  })
})
