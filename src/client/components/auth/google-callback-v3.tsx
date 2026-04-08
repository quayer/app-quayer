'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card } from '@/client/components/ds/card'
import { Button } from '@/client/components/ds/button'
import { api } from '@/igniter.client'
import { TwoFactorChallenge } from '@/client/components/auth/two-factor-challenge'

type State = 'loading' | 'twofactor' | 'error'

type ApiErrorShape = {
  error?: { message?: string }
  message?: string
}

type GoogleCallbackResponse = {
  user?: { currentOrgId?: string; role: string }
  needsOnboarding?: boolean
  requiresTwoFactor?: boolean
  challengeId?: string
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const e = err as ApiErrorShape | undefined
  if (typeof e?.error?.message === 'string') return e.error.message
  if (typeof e?.message === 'string') return e.message
  return fallback
}

export function GoogleCallbackV3(): React.ReactElement {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [state, setState] = React.useState<State>('loading')
  const [error, setError] = React.useState<string>('')
  const [challengeId, setChallengeId] = React.useState<string | null>(null)

  const handle2FASuccess = React.useCallback(
    (result: { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean }): void => {
      if (result.needsOnboarding) {
        window.location.href = '/onboarding'
        return
      }
      window.location.href = result.user.role === 'admin' ? '/admin' : '/integracoes'
    },
    [],
  )

  const exchange = React.useCallback(
    async (code: string): Promise<void> => {
      try {
        const mutateArg = { body: { code } } as Parameters<
          typeof api.auth.googleCallback.mutate
        >[0]
        const result = (await api.auth.googleCallback.mutate(mutateArg)) as {
          data?: GoogleCallbackResponse
          error?: ApiErrorShape['error']
        }

        if (result?.error) {
          setError(extractErrorMessage({ error: result.error }, 'Codigo invalido ou expirado'))
          setState('error')
          return
        }

        const data = result?.data
        if (data?.requiresTwoFactor && data?.challengeId) {
          setChallengeId(data.challengeId)
          setState('twofactor')
          return
        }

        if (data?.user) {
          let redirect = '/integracoes'
          if (data.needsOnboarding || !data.user.currentOrgId) {
            redirect = '/onboarding'
          } else if (data.user.role === 'admin') {
            redirect = '/admin'
          }
          window.location.href = redirect
          return
        }

        setError('Falha ao processar autenticacao')
        setState('error')
      } catch (err) {
        setError(extractErrorMessage(err, 'Falha na autenticacao com Google'))
        setState('error')
      }
    },
    [],
  )

  React.useEffect(() => {
    const code = searchParams.get('code')
    const errParam = searchParams.get('error')

    if (errParam) {
      setError('Erro na autenticacao com Google')
      setState('error')
      return
    }

    if (code) {
      void exchange(code)
    } else {
      setError('Codigo de autorizacao ausente')
      setState('error')
    }
  }, [searchParams, exchange])

  if (state === 'twofactor' && challengeId) {
    return (
      <TwoFactorChallenge
        challengeId={challengeId}
        onSuccess={handle2FASuccess}
        onCancel={() => router.push('/login')}
      />
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
          <h1 className="text-ds-xl font-ds-bold text-ds-fg">Falha no login com Google</h1>
          <p role="alert" className="text-ds-sm text-ds-danger">
            {error || 'Nao foi possivel concluir o login.'}
          </p>
          <Button type="button" variant="primary" onClick={() => router.push('/login')}>
            Voltar para login
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div role="status" className="flex flex-col items-center gap-3 py-4">
        <span
          aria-hidden="true"
          className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent text-ds-fg"
        />
        <p className="text-ds-sm text-ds-muted">Concluindo login...</p>
      </div>
    </Card>
  )
}

export default GoogleCallbackV3
