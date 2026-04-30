"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/igniter.client"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/client/components/ui/button"
import { TwoFactorChallenge } from "@/client/components/auth/two-factor-challenge"
import Image from "next/image"
import Link from "next/link"

export function LoginVerifyMagicClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState('')
  const [twoFactorChallengeId, setTwoFactorChallengeId] = useState<string | null>(null)

  const handle2FASuccess = useCallback((result: { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean }) => {
    if (result.needsOnboarding) {
      window.location.href = '/onboarding'
    } else {
      window.location.href = result.user.role === 'admin' ? '/admin' : '/projetos'
    }
  }, [])

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Token de verificação não encontrado')
      return
    }

    const verifyMagicLink = async () => {
      try {
        const { data, error: apiError } = await api.auth.verifyMagicLink.mutate({
          body: { token }
        })

        if (apiError || !data) {
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

          let redirectPath = '/projetos'
          if (needsOnboarding || !user.currentOrgId) {
            redirectPath = '/onboarding'
          } else if (user.role === 'admin') {
            redirectPath = '/admin'
          }

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
        <Link href="/login" className="flex items-center gap-2 self-start font-medium">
          <Image
            src="/logo.svg"
            alt="Quayer"
            width={120}
            height={28}
            style={{ height: "auto" }}
            priority
          />
        </Link>

        <div className="flex flex-col gap-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {status === 'verifying' && 'Verificando login...'}
              {status === 'success' && 'Login realizado!'}
              {status === 'error' && 'Erro na verificação'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {status === 'verifying' && 'Aguarde enquanto verificamos seu link...'}
              {status === 'success' && 'Redirecionando para o dashboard...'}
              {status === 'error' && error}
            </p>
          </div>

          {/* Status */}
          <div className="flex flex-col items-center gap-4">
            {status === 'verifying' && (
              <div role="status" aria-label="Verificando link mágico" className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Verificando...</span>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                  <CheckCircle2 className="h-6 w-6 text-green-400" aria-hidden="true" />
                </div>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Redirecionando...</span>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                  <XCircle className="h-6 w-6 text-red-400" aria-hidden="true" />
                </div>
                <Button
                  onClick={() => router.push('/login')}
                  className="w-full min-h-[44px] bg-foreground text-background hover:bg-foreground/90 border-transparent"
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
