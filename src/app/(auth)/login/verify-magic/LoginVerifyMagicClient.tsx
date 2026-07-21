"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { client } from "@/orpc/client"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { TwoFactorChallenge } from "@/client/components/auth/two-factor-challenge"

export function LoginVerifyMagicClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState('')
  const [twoFactorChallengeId, setTwoFactorChallengeId] = useState<string | null>(null)

  const handle2FASuccess = useCallback((result: { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean }) => {
    window.location.href = '/'
  }, [])

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Token de verificação não encontrado')
      return
    }

    const verifyMagicLink = async () => {
      try {
        // Client oRPC: erro lança e cai no catch (fluxo original preservado)
        const { data } = await client.auth.verifyMagicLink({ token })

        if (!data) {
          throw new Error('Magic link inválido ou expirado')
        }

        const responseData = data as { user?: { currentOrgId?: string; role: string }; needsOnboarding?: boolean; requiresTwoFactor?: boolean; challengeId?: string } | null
        if (responseData?.requiresTwoFactor && responseData?.challengeId) {
          setTwoFactorChallengeId(responseData.challengeId)
          setStatus('success')
          return
        }
        if (responseData?.user) {
          // Backend seta cookies httpOnly via Set-Cookie header.
          setStatus('success')
          const user = responseData.user
          const needsOnboarding = responseData.needsOnboarding

          const redirectPath = '/'

          // Notificar a aba original (OTP) que o login foi feito via magic link
          let notifiedOriginalTab = false
          try {
            const bc = new BroadcastChannel('quayer-auth')
            bc.postMessage({ type: 'auth-success', redirectPath })
            bc.close()
            notifiedOriginalTab = true
          } catch { /* BroadcastChannel não suportado */ }

          setTimeout(() => {
            if (notifiedOriginalTab) {
              window.close()
              window.location.href = redirectPath
            } else {
              window.location.href = redirectPath
            }
          }, 1500)
        }
      } catch (err: unknown) {
        const errorMessage = (err instanceof Error ? err.message : null) || 'Link inválido ou expirado'
        setStatus('error')
        setError(errorMessage)
      }
    }

    verifyMagicLink()
  }, [token, router])

  if (twoFactorChallengeId) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
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
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-8">
          {/* Header — live region announces status changes */}
          <div
            className="space-y-3"
            role={status === 'error' ? 'alert' : 'status'}
            aria-live={status === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            aria-busy={status === 'verifying'}
          >
            <h1 className="text-2xl font-bold tracking-tight text-foreground leading-tight">
              {status === 'verifying' && 'Verificando login...'}
              {status === 'success' && 'Login realizado!'}
              {status === 'error' && 'Erro na verificação'}
            </h1>
            <p className="text-[0.9375rem] text-foreground/70 leading-relaxed">
              {status === 'verifying' && 'Aguarde enquanto verificamos seu link...'}
              {status === 'success' && 'Redirecionando para o dashboard...'}
              {status === 'error' && error}
            </p>
          </div>

          {/* Status icons */}
          <div className="flex flex-col items-center gap-5">
            {status === 'verifying' && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-foreground/70" aria-hidden="true" />
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                  <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" aria-hidden="true" />
                </div>
                <Loader2 className="h-6 w-6 animate-spin text-foreground/70" aria-hidden="true" />
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-5 w-full">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                  <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden="true" />
                </div>
                <Button
                  onClick={() => router.push('/login')}
                  className="w-full min-h-[44px] bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2"
                >
                  Fazer login novamente
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
