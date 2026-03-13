'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from '@/client/components/ui/field'
import { api } from '@/igniter.client'
import { cn } from '@/lib/utils'
import { TurnstileWidget } from '@/client/components/auth/turnstile-widget'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setIsLoading(true)

    try {
      await api.auth.forgotPassword.mutate({
        body: { email, 'cf-turnstile-response': turnstileToken } as any
      })

      setSuccess(true)
      setEmail('')
    } catch (err: unknown) {
      const e = err as { message?: string; response?: { data?: { message?: string } } }
      const errorMessage = e?.message || e?.response?.data?.message || 'Erro ao enviar email de recuperação'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className={cn("flex flex-col gap-6")}>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <Link
                  href="/login"
                  className="flex flex-col items-center gap-2 font-medium"
                >
                  <div className="flex items-center justify-center">
                    <Image
                      src="/logo.svg"
                      alt="Quayer Logo"
                      width={160}
                      height={38}
                    />
                  </div>
                  <span className="sr-only">Quayer</span>
                </Link>
                <h1 className="text-xl font-bold mt-4">Esqueceu sua senha?</h1>
                <FieldDescription>
                  Digite seu e-mail e enviaremos instruções para redefinir sua senha
                </FieldDescription>
              </div>

              {error && (
                <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                  <AlertDescription className="text-destructive">{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-500/50 dark:border-green-500/50 bg-green-100 dark:bg-green-900/20">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-600 dark:text-green-400">
                    E-mail enviado com sucesso! Verifique sua caixa de entrada (e spam também).
                  </AlertDescription>
                </Alert>
              )}

              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading || success}
                  autoFocus
                />
              </Field>

              <TurnstileWidget
                onSuccess={setTurnstileToken}
                action="forgot-password"
              />

              <Field>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || success}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : success ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      E-mail enviado
                    </>
                  ) : (
                    'Enviar instruções'
                  )}
                </Button>
              </Field>

              <div className="text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para login
                </Link>
              </div>
            </FieldGroup>
          </form>
          <FieldDescription className="px-6 text-center text-xs">
            Lembrou sua senha? <Link href="/login" className="underline underline-offset-4 hover:text-primary">Faça login</Link>
          </FieldDescription>
        </div>
      </div>
    </div>
  )
}
