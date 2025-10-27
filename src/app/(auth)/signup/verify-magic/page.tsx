"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/igniter.client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SignupVerifyMagicPage() {
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

        // Armazenar tokens
        if ((data as any).accessToken) {
          localStorage.setItem("accessToken", (data as any).accessToken)
          if ((data as any).refreshToken) {
            localStorage.setItem("refreshToken", (data as any).refreshToken)
          }

          const cookieValue = encodeURIComponent((data as any).accessToken)
          document.cookie = `accessToken=${cookieValue}; path=/; max-age=86400; SameSite=Lax`

          setStatus('success')

          // Redirecionar para dashboard
          setTimeout(() => {
            const redirectPath = (data as any).user?.role === "admin" ? "/admin" : "/integracoes"
            window.location.href = redirectPath
          }, 1500)
        }
      } catch (err: any) {
        console.error("Magic link verification error:", err)
        setStatus('error')
        setError(err.message || 'Link inválido ou expirado')
      }
    }

    verifyMagicLink()
  }, [token, router])

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
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Aguarde enquanto verificamos seu link...
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm text-center">
                Sua conta foi criada com sucesso!<br />
                Redirecionando para o dashboard...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-500" />
              <p className="text-sm text-center text-red-600">
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
