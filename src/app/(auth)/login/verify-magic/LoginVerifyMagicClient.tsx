"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/igniter.client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card"
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
    if (result.needsOnboarding) {
      window.location.href = '/onboarding'
    } else {
      window.location.href = result.user.role === 'admin' ? '/admin' : '/integracoes'
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

          let redirectPath = '/integracoes'
          if (needsOnboarding || !user.currentOrgId) {
            redirectPath = '/onboarding'
          } else if (user.role === 'admin') {
            redirectPath = '/admin'
          }

          // Notificar a aba original (OTP) que o login foi feito via magic link
          // Se conseguir notificar, fecha esta aba (a original redireciona)
          // Se não (sem BroadcastChannel ou sem aba original), redireciona aqui mesmo
          let notifiedOriginalTab = false
          try {
            const bc = new BroadcastChannel('quayer-auth')
            bc.postMessage({ type: 'auth-success', redirectPath })
            bc.close()
            notifiedOriginalTab = true
          } catch { /* BroadcastChannel não suportado */ }

          setTimeout(() => {
            if (notifiedOriginalTab) {
              // Tentar fechar esta aba — só funciona se foi aberta via JS/link
              window.close()
              // Fallback: se não fechou (restrição do browser), redireciona
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
    <div className="flex min-h-svh flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Verificação de Login</CardTitle>
          <CardDescription>
            {status === 'verifying' && 'Verificando seu link mágico...'}
            {status === 'success' && 'Login realizado com sucesso!'}
            {status === 'error' && 'Erro na verificação'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'verifying' && (
            <div role="status" aria-label="Verificando link mágico" className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Aguarde enquanto verificamos seu link...
              </p>
            </div>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" aria-hidden="true" />
              <p className="text-sm text-center">
                Login realizado com sucesso!<br />
                Redirecionando para o dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
              <p className="text-sm text-center text-destructive">
                {error}
              </p>
              <div className="flex flex-col gap-2 w-full">
                <Button
                  onClick={() => router.push('/login')}
                  className="w-full"
                >
                  Fazer login novamente
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
