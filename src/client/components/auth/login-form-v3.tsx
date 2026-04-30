'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { Button } from '@/client/components/ds/button'
import { Input } from '@/client/components/ds/input'
import { api } from '@/igniter.client'

const LoginSchema = z.object({
  email: z.string().email('Email invalido'),
})

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

export function LoginFormV3(): React.ReactElement {
  const router = useRouter()
  const [email, setEmail] = React.useState<string>('')
  const [error, setError] = React.useState<string>('')
  const [loading, setLoading] = React.useState<boolean>(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError('')

    const parsed = LoginSchema.safeParse({ email: email.trim() })
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      setError(first?.message ?? 'Email invalido')
      return
    }

    setLoading(true)
    try {
      const mutateArg = { body: { email: parsed.data.email } } as Parameters<
        typeof api.auth.loginOTP.mutate
      >[0]
      const result = (await api.auth.loginOTP.mutate(mutateArg)) as {
        data?: { isNewUser?: boolean; magicLinkSessionId?: string } | null
        error?: ApiErrorShape['error']
      }
      if (result?.error) {
        setError(extractErrorMessage({ error: result.error }, 'Erro ao enviar codigo'))
        return
      }
      const params = new URLSearchParams({ email: parsed.data.email })
      if (result?.data?.isNewUser) params.set('signup', 'true')
      if (result?.data?.magicLinkSessionId) params.set('mlsid', result.data.magicLinkSessionId)
      router.push(`/login/verify?${params.toString()}`)
    } catch (err) {
      setError(extractErrorMessage(err, 'Erro ao enviar codigo'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-ds-2xl font-ds-bold text-ds-fg">Faca login no Quayer</h1>
        <p className="text-ds-sm text-ds-muted">Enviaremos um codigo para o seu email.</p>
      </div>

      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="email@exemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
        error={error || undefined}
      />

      <Button type="submit" variant="primary" size="md" loading={loading} disabled={loading}>
        {loading ? 'Enviando...' : 'Continuar com Email'}
      </Button>
    </form>
  )
}

export default LoginFormV3
