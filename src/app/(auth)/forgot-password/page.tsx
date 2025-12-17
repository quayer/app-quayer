'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from '@/components/ui/field'
import { api } from '@/igniter.client'
import { AuthLayout } from "@/components/auth/auth-layout"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setIsLoading(true)

    try {
      await api.auth.forgotPassword.mutate({
        body: { email }
      })

      setSuccess(true)
      setEmail('')
    } catch (err: any) {
      const errorMessage = err?.message || err?.response?.data?.message || 'Erro ao enviar email de recuperação'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="flex w-full flex-col gap-6">
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 font-medium group"
          aria-label="Voltar para login"
        >
          <div className="relative">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={140}
              height={32}
              priority
              className="relative z-10 transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 blur-xl bg-gradient-to-r from-purple-500/30 to-pink-500/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </div>
        </Link>

        <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl font-semibold">Esqueceu sua senha?</CardTitle>
            <CardDescription className="text-muted-foreground">
              Digite seu e-mail e enviaremos instruções para redefinir sua senha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                {error && (
                  <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                    <AlertDescription className="text-red-200">{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="border-green-500/50 bg-green-500/10">
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                    <AlertDescription className="text-green-200">
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
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/70 px-4">
          Lembrou sua senha?{" "}
          <Link href="/login" className="underline underline-offset-4 hover:text-muted-foreground transition-colors">
            Faça login
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
