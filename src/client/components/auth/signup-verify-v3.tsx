'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/client/components/ds/button'
import { OtpInput } from '@/client/components/ds/otp-input'
import { api } from '@/igniter.client'

const RESEND_COOLDOWN_SECONDS = 60

export function SignupVerifyV3(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [code, setCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_SECONDS)

  React.useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (code.length !== 6) return
    setLoading(true)
    setError(null)
    try {
      const { error: apiError } = await api.auth.verifySignupOTP.mutate({
        body: { email, code },
      } as Parameters<typeof api.auth.verifySignupOTP.mutate>[0])

      if (apiError) {
        const msg =
          (apiError as { message?: string })?.message ?? 'Codigo invalido. Tente novamente.'
        setError(msg)
        setLoading(false)
        return
      }

      router.push('/onboarding')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Codigo invalido. Tente novamente.'
      setError(msg)
      setLoading(false)
    }
  }

  const handleResend = async (): Promise<void> => {
    if (cooldown > 0 || !email) return
    setError(null)
    setCooldown(RESEND_COOLDOWN_SECONDS)
    try {
      await api.auth.signupOTP.mutate({
        body: { email, name: '' },
      } as Parameters<typeof api.auth.signupOTP.mutate>[0])
    } catch {
      setError('Erro ao reenviar codigo')
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-ds-xl font-ds-medium text-ds-fg">Verificar email</h1>
      <p className="text-ds-sm text-ds-muted">
        Digite o codigo de 6 digitos enviado para {email || 'seu email'}.
      </p>

      {error ? (
        <div role="alert" className="text-ds-sm text-ds-danger">
          {error}
        </div>
      ) : null}

      <OtpInput value={code} onChange={setCode} disabled={loading} length={6} />

      <Button type="submit" variant="primary" loading={loading} disabled={code.length !== 6 || loading}>
        Verificar
      </Button>

      <button
        type="button"
        onClick={handleResend}
        disabled={cooldown > 0}
        className="text-ds-sm text-ds-muted hover:text-ds-fg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar codigo'}
      </button>
    </form>
  )
}

export default SignupVerifyV3
