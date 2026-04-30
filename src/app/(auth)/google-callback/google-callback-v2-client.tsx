'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { api } from '@/igniter.client'
import { TwoFactorChallenge } from '@/client/components/auth/two-factor-challenge'
import Image from 'next/image'
import Link from 'next/link'

function GoogleCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string>('')
  const [twoFactorChallengeId, setTwoFactorChallengeId] = useState<string | null>(null)

  const handle2FASuccess = useCallback((result: { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean }) => {
    if (result.needsOnboarding) {
      window.location.href = '/onboarding'
    } else {
      window.location.href = result.user.role === 'admin' ? '/admin' : '/projetos'
    }
  }, [])

  const handleGoogleCallback = useCallback(async (code: string) => {
    try {
      const { data, error: apiError } = await api.auth.googleCallback.mutate({
        body: { code }
      })

      if (apiError) {
        setError('Código de autorização expirado ou inválido')
        setTimeout(() => router.push('/login'), 3000)
        return
      }

      const responseData = data as { user?: { currentOrgId?: string; role: string }; needsOnboarding?: boolean; requiresTwoFactor?: boolean; challengeId?: string } | null
      if (responseData?.requiresTwoFactor && responseData?.challengeId) {
        setTwoFactorChallengeId(responseData.challengeId)
        return
      }
      if (responseData?.user) {
        const user = responseData.user
        const needsOnboarding = responseData.needsOnboarding

        let redirectPath = '/projetos'
        if (needsOnboarding || !user.currentOrgId) {
          redirectPath = '/onboarding'
        } else if (user.role === 'admin') {
          redirectPath = '/admin'
        }

        window.location.href = redirectPath
      } else {
        setError('Erro ao processar autenticação')
        setTimeout(() => router.push('/login'), 3000)
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string }
      console.error('[GOOGLE CALLBACK] Authentication failed:', error?.message)

      const errorMessage = error?.response?.data?.message
        || error?.message
        || 'Código de autorização expirado. Tente fazer login novamente.'
      setError(errorMessage)
      setTimeout(() => router.push('/login'), 3000)
    }
  }, [router])

  useEffect(() => {
    const code = searchParams.get('code')
    const errorParam = searchParams.get('error')

    if (errorParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('Erro na autenticação com Google')
      setTimeout(() => router.push('/login'), 3000)
      return
    }

    if (code) {
      handleGoogleCallback(code)
    }
  }, [searchParams, router, handleGoogleCallback])

  if (twoFactorChallengeId) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link href="/login" className="flex items-center gap-2 self-center font-medium">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={120}
              height={28}
              style={{ height: "auto" }}
              priority
            />
          </Link>
          <TwoFactorChallenge
            challengeId={twoFactorChallengeId}
            onSuccess={handle2FASuccess}
            onCancel={() => router.push('/login')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6 text-center">
          {error ? (
            <>
              <div className="flex justify-center">
                <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
              </div>
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertDescription className="text-destructive">{error}</AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground">Redirecionando para o login...</p>
            </>
          ) : (
            <>
              <div className="flex justify-center" role="status" aria-label="Processando autenticação">
                <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium">Processando autenticação...</p>
                <p className="text-sm text-muted-foreground">Aguarde um momento</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function GoogleCallbackV2Client() {
  return (
    <Suspense fallback={
      <div className="flex min-h-svh flex-col items-center justify-center" role="status" aria-label="Carregando">
        <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
      </div>
    }>
      <GoogleCallbackContent />
    </Suspense>
  )
}

export default GoogleCallbackV2Client
