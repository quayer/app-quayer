'use client'

// US-311: Onboarding v3 — mirrors v2 onboarding-form.tsx in two visual steps:
//   Step 1: profile (first/last name + companyName)
//   Step 2: confirmation (review + submit)
// v2 collects all data on a single screen but conceptually has 2 phases
// (profile patch via /api/v1/auth/profile, then createOrganizationAction).
// v3 splits these into explicit visual steps with a progress indicator while
// reusing the same backend calls — no behavioural change to the API surface.

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { Button } from '@/client/components/ds/button'
import { Input } from '@/client/components/ds/input'
import { Card } from '@/client/components/ds/card'
import { createOrganizationAction } from '@/app/(auth)/onboarding/actions'
import { getCsrfHeaders } from '@/client/hooks/use-csrf-token'

const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'Nome muito curto'),
  lastName: z.string().trim().optional().default(''),
  companyName: z.string().trim().min(2, 'Nome da empresa muito curto'),
})

type ProfileData = {
  firstName: string
  lastName: string
  companyName: string
}

const TOTAL_STEPS = 2

export function OnboardingV3(): React.ReactElement {
  const router = useRouter()
  const [step, setStep] = React.useState<1 | 2>(1)
  const [data, setData] = React.useState<ProfileData>({
    firstName: '',
    lastName: '',
    companyName: '',
  })
  const [errors, setErrors] = React.useState<Partial<Record<keyof ProfileData | 'submit', string>>>({})
  const [loading, setLoading] = React.useState(false)

  function updateField<K extends keyof ProfileData>(key: K, value: ProfileData[K]): void {
    setData((prev) => ({ ...prev, [key]: value }))
  }

  function handleNext(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault()
    setErrors({})

    const parsed = profileSchema.safeParse(data)
    if (!parsed.success) {
      const next: Partial<Record<keyof ProfileData, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (key === 'firstName' || key === 'lastName' || key === 'companyName') {
          next[key] = issue.message
        }
      }
      setErrors(next)
      return
    }

    setStep(2)
  }

  async function handleSubmit(): Promise<void> {
    setLoading(true)
    setErrors({})
    try {
      const fullName = data.lastName.trim()
        ? `${data.firstName.trim()} ${data.lastName.trim()}`
        : data.firstName.trim()

      // Step A: persist profile name
      const profileRes = await fetch('/api/v1/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        credentials: 'include',
        body: JSON.stringify({ name: fullName }),
      })
      if (!profileRes.ok) {
        setErrors({ submit: 'Erro ao salvar nome' })
        setLoading(false)
        return
      }

      // Step B: create organization
      const formData = new FormData()
      formData.append('name', data.companyName.trim())
      formData.append('type', 'pj')
      const result = await createOrganizationAction(formData)

      if (result.success) {
        router.push('/')
        return
      }

      const msg =
        typeof result.error === 'string' ? result.error : 'Erro ao criar organizacao'
      setErrors({ submit: msg })
      setLoading(false)
    } catch {
      setErrors({ submit: 'Erro inesperado' })
      setLoading(false)
    }
  }

  const progressPct = (step / TOTAL_STEPS) * 100

  return (
    <Card>
      <div className="flex flex-col gap-6">
        {/* Progress */}
        <div className="flex flex-col gap-2">
          <p className="text-ds-sm text-ds-muted">
            Passo {step} de {TOTAL_STEPS}
          </p>
          <div
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            className="h-1.5 w-full overflow-hidden rounded-ds-sm bg-ds-surface"
          >
            <div
              className="h-full bg-ds-p-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {step === 1 ? (
          <form onSubmit={handleNext} noValidate className="flex flex-col gap-4">
            <h1 className="text-ds-xl font-ds-bold text-ds-fg">Configure sua conta</h1>
            <p className="text-ds-sm text-ds-muted">
              Informe seus dados para comecar.
            </p>

            <Input
              label="Nome"
              type="text"
              autoComplete="given-name"
              value={data.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              error={errors.firstName}
              required
            />
            <Input
              label="Sobrenome"
              type="text"
              autoComplete="family-name"
              value={data.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              error={errors.lastName}
            />
            <Input
              label="Nome da empresa"
              type="text"
              autoComplete="organization"
              value={data.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              error={errors.companyName}
              required
            />

            <Button type="submit" variant="primary">
              Continuar
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <h1 className="text-ds-xl font-ds-bold text-ds-fg">Confirme seus dados</h1>
            <p className="text-ds-sm text-ds-muted">
              Revise as informacoes antes de finalizar.
            </p>

            <dl className="flex flex-col gap-3 text-ds-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ds-muted">Nome</dt>
                <dd className="text-ds-fg font-ds-medium">
                  {data.firstName} {data.lastName}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ds-muted">Empresa</dt>
                <dd className="text-ds-fg font-ds-medium">{data.companyName}</dd>
              </div>
            </dl>

            {errors.submit ? (
              <p role="alert" className="text-ds-sm text-ds-danger">
                {errors.submit}
              </p>
            ) : null}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={loading}
                disabled={loading}
                onClick={() => void handleSubmit()}
              >
                Finalizar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default OnboardingV3
