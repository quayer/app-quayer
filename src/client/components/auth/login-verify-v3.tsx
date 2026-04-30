'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/client/components/ds/button'
import { OtpInput } from '@/client/components/ds/otp-input'
import { api } from '@/igniter.client'

const RESEND_COOLDOWN_SECONDS = 60

type ApiErrorShape = {
  error?: { message?: string; details?: Array<{ message?: string }> }
  message?: string
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const e = err as ApiErrorShape | undefined
  const details = e?.error?.details
  if (details && details.length > 0 && typeof details[0]?.message === 'string') {
    return details[0].message as string
  }
  if (typeof e?.error?.message === 'string') return e.error.message
  if (typeof e?.message === 'string') return e.message
  return fallback
}

export function LoginVerifyV3(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [code, setCode] = React.useState<string>('')
  const [error, setError] = React.useState<string>('')
  const [loading, setLoading] = React.useState<boolean>(false)
  const [cooldown, setCooldown] = React.useState<number>(RESEND_COOLDOWN_SECONDS)

  React.useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => {
      setCooldown((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const isComplete = code.length === 6

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError('')
    if (!isComplete || !email) return

    setLoading(true)
    try {
      const mutateArg = { body: { email, code } } as Parameters<
        typeof api.auth.verifyLoginOTP.mutate
      >[0]
      const result = (await api.auth.verifyLoginOTP.mutate(mutateArg)) as {
        data?: { needsOnboarding?: boolean; user?: { role?: string } } | null
        error?: ApiErrorShape['error']
      }
      if (result?.error) {
        setError(extractErrorMessage({ error: result.error }, 'Codigo invalido'))
        return
      }
      if (result?.data?.needsOnboarding) {
        router.push('/onboarding')
        return
      }
      if (result?.data?.user?.role === 'admin') {
        router.push('/admin')
        return
      }
      router.push('/')
    } catch (err) {
      setError(extractErrorMessage(err, 'Codigo invalido'))
    } finally {
      setLoading(false)
    }
  }

  async function onResend(): Promise<void> {
    if (cooldown > 0 || !email) return
    setError('')
    try {
      const mutateArg = { body: { email } } as Parameters<typeof api.auth.loginOTP.mutate>[0]
      await api.auth.loginOTP.mutate(mutateArg)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(extractErrorMessage(err, 'Erro ao reenviar'))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-ds-2xl font-ds-bold text-ds-fg">Verificar codigo</h1>
        <p className="text-ds-sm text-ds-muted">
          Insira o codigo de 6 digitos enviado para {email || 'seu email'}.
        </p>
      </div>

      <OtpInput length={6} value={code} onChange={setCode} disabled={loading} />

      {error ? (
        <p role="alert" className="text-ds-sm text-ds-danger">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={loading}
        disabled={!isComplete || loading}
      >
        {loading ? 'Verificando...' : 'Verificar'}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onResend}
        disabled={cooldown > 0 || loading}
      >
        {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar codigo'}
      </Button>
    </form>
  )
}

export default LoginVerifyV3
