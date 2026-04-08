'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { Button } from '@/client/components/ds/button'
import { Input } from '@/client/components/ds/input'
import { api } from '@/igniter.client'

const schema = z.object({
  email: z.string().email('Email invalido'),
  name: z.string().min(2, 'Nome muito curto'),
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Aceite os termos' }),
  }),
})

type FormErrors = {
  email?: string
  name?: string
  acceptedTerms?: string
  submit?: string
}

export function SignupFormV3(): React.ReactElement {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [name, setName] = React.useState('')
  const [acceptedTerms, setAcceptedTerms] = React.useState(false)
  const [errors, setErrors] = React.useState<FormErrors>({})
  const [loading, setLoading] = React.useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setErrors({})

    const parsed = schema.safeParse({ email, name, acceptedTerms })
    if (!parsed.success) {
      const next: FormErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'email') next.email = issue.message
        else if (key === 'name') next.name = issue.message
        else if (key === 'acceptedTerms') next.acceptedTerms = issue.message
      }
      setErrors(next)
      return
    }

    setLoading(true)
    try {
      const { error: apiError } = await api.auth.signupOTP.mutate({
        body: { email: parsed.data.email, name: parsed.data.name },
      } as Parameters<typeof api.auth.signupOTP.mutate>[0])

      if (apiError) {
        const msg =
          (apiError as { message?: string })?.message ?? 'Erro ao enviar codigo. Tente novamente.'
        setErrors({ submit: msg })
        setLoading(false)
        return
      }

      router.push('/signup/verify?email=' + encodeURIComponent(parsed.data.email))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar codigo. Tente novamente.'
      setErrors({ submit: msg })
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-ds-xl font-ds-medium text-ds-fg">Crie sua conta</h1>

      {errors.submit ? (
        <div role="alert" className="text-ds-sm text-ds-danger">
          {errors.submit}
        </div>
      ) : null}

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        disabled={loading}
        required
      />

      <Input
        label="Nome"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        disabled={loading}
        required
      />

      <label className="flex items-start gap-2 text-ds-sm text-ds-fg">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          disabled={loading}
          aria-invalid={errors.acceptedTerms ? true : undefined}
          className="mt-1"
        />
        <span>Aceito os termos de uso e a politica de privacidade</span>
      </label>
      {errors.acceptedTerms ? (
        <span className="text-ds-sm text-ds-danger">{errors.acceptedTerms}</span>
      ) : null}

      <Button type="submit" variant="primary" loading={loading} disabled={!acceptedTerms || loading}>
        Criar conta
      </Button>
    </form>
  )
}

export default SignupFormV3
