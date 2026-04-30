"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/igniter.client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/client/components/ui/card"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/client/components/ui/button"

export function SignupVerifyMagicClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [error, setError] = useState('')

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

        const responseData = data as { user?: { currentOrgId?: string; role: string }; needsOnboarding?: boolean } | null
        if (responseData?.user) {
          // Backend seta cookies httpOnly via Set-Cookie header.
          setStatus('success')
          const user = responseData.user
          const needsOnboarding = responseData.needsOnboarding

          setTimeout(() => {
            let redirectPath = '/projetos'
            if (needsOnboarding || !user.currentOrgId) {
              redirectPath = '/onboarding'
            } else if (user.role === 'admin') {
              redirectPath = '/admin'
            }
            window.location.href = redirectPath
          }, 1500)
        }
      } catch (err: unknown) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Link inválido ou expirado')
      }
    }

    verifyMagicLink()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Verificação de Cadastro</CardTitle>
          <CardDescription>
            {status === 'verifying' && 'Verificando seu link mágico...'}
            {status === 'success' && 'Conta criada com sucesso!'}
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
                Sua conta foi criada com sucesso!<br />
                Redirecionando para o dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
              <p className="text-sm text-center text-destructive" role="alert">
                {error}
              </p>
              <div className="flex flex-col gap-2 w-full">
                <Button
                  onClick={() => router.push('/signup')}
                  className="w-full"
                >
                  Tentar novamente
                </Button>
                <Button
                  onClick={() => router.push('/login')}
                  variant="outline"
                  className="w-full"
                >
                  Fazer login
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
