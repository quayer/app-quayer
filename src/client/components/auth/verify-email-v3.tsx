'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { z } from 'zod'
import { Button } from '@/client/components/ds/button'
import { OtpInput } from '@/client/components/ds/otp-input'
import { Card } from '@/client/components/ds/card'
import { api } from '@/igniter.client'

const codeSchema = z.string().length(6).regex(/^\d+$/)

type State = 'loading' | 'idle' | 'submitting' | 'success' | 'error'

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

export function VerifyEmailV3(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const tokenParam = searchParams.get('token') ?? ''

  const [state, setState] = React.useState<State>(tokenParam ? 'loading' : 'idle')
  const [code, setCode] = React.useState<string>('')
  const [error, setError] = React.useState<string>('')

  const verify = React.useCallback(
    async (codeToSubmit: string): Promise<void> => {
      const parsed = codeSchema.safeParse(codeToSubmit)
      if (!parsed.success) {
        setError('Codigo deve ter 6 digitos numericos')
        setState('error')
        return
      }
      if (!email) {
        setError('Email nao encontrado')
        setState('error')
        return
      }

      setState('submitting')
      setError('')
      try {
        const mutateArg = { body: { email, code: parsed.data } } as Parameters<
          typeof api.auth.verifyEmail.mutate
        >[0]
        const result = (await api.auth.verifyEmail.mutate(mutateArg)) as {
          data?: unknown
          error?: ApiErrorShape['error']
        }
        if (result?.error) {
          setError(extractErrorMessage({ error: result.error }, 'Codigo invalido'))
          setState('error')
          return
        }
        setState('success')
      } catch (err) {
        setError(extractErrorMessage(err, 'Falha na verificacao'))
        setState('error')
      }
    },
    [email],
  )

  React.useEffect(() => {
    if (tokenParam && email) {
      void verify(tokenParam)
    } else if (tokenParam && !email) {
      setError('Email nao encontrado')
      setState('error')
    }
  }, [tokenParam, email, verify])

  function onSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    void verify(code)
  }

  function onContinue(): void {
    router.push('/integracoes')
  }

  function onRetry(): void {
    setError('')
    setCode('')
    setState('idle')
  }

  if (state === 'loading' || state === 'submitting') {
    return (
      <Card>
        <div role="status" className="flex flex-col items-center gap-3 py-4">
          <span
            aria-hidden="true"
            className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent text-ds-fg"
          />
          <p className="text-ds-sm text-ds-muted">Verificando email...</p>
        </div>
      </Card>
    )
  }

  if (state === 'success') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-ds-success/10 text-ds-success text-2xl"
          >
            {'\u2713'}
          </div>
          <h1 className="text-ds-xl font-ds-bold text-ds-fg">Email verificado</h1>
          <p className="text-ds-sm text-ds-muted">Sua conta esta pronta para uso.</p>
          <Button type="button" variant="primary" onClick={onContinue}>
            Continuar
          </Button>
        </div>
      </Card>
    )
  }

  if (state === 'error') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-ds-danger/10 text-ds-danger text-2xl"
          >
            {'\u2715'}
          </div>
          <h1 className="text-ds-xl font-ds-bold text-ds-fg">Falha na verificacao</h1>
          <p role="alert" className="text-ds-sm text-ds-danger">
            {error || 'Codigo invalido ou expirado.'}
          </p>
          <Button type="button" variant="primary" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      </Card>
    )
  }

  // idle — manual OTP entry
  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-ds-xl font-ds-bold text-ds-fg">Verificar email</h1>
          <p className="text-ds-sm text-ds-muted">
            Insira o codigo de 6 digitos enviado para {email || 'seu email'}.
          </p>
        </div>

        <OtpInput length={6} value={code} onChange={setCode} />

        {error ? (
          <p role="alert" className="text-ds-sm text-ds-danger">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          disabled={code.length !== 6}
        >
          Verificar
        </Button>
      </form>
    </Card>
  )
}

export default VerifyEmailV3
