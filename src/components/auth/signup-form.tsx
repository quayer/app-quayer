"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Mail } from "lucide-react"
import { GoogleIcon } from "@/components/ui/google-icon"
import { api } from "@/igniter.client"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    // Validate and trim inputs
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()

    if (!trimmedName) {
      setError("Digite seu nome")
      setIsLoading(false)
      return
    }

    if (!trimmedEmail) {
      setError("Digite seu email")
      setIsLoading(false)
      return
    }

    try {
      // Send OTP code to email (SIGNUP endpoint - creates TempUser)
      const { data, error: apiError } = await api.auth.signupOTP.mutate({
        body: { email: trimmedEmail, name: trimmedName }
      })

      if (apiError) {
        throw apiError
      }

      setSuccess(`✉️ Código enviado para ${trimmedEmail}! Verifique sua caixa de entrada.`)

      // Save email and name to sessionStorage for resend functionality
      sessionStorage.setItem('signup-email', trimmedEmail)
      sessionStorage.setItem('signup-name', trimmedName)

      // Redirect to signup verification page with both email and name
      setTimeout(() => {
        router.push(`/signup/verify?email=${encodeURIComponent(trimmedEmail)}&name=${encodeURIComponent(trimmedName)}`)
      }, 1500)
    } catch (err: any) {
      let errorMessage = "Erro ao enviar código. Tente novamente."

      // Handle Igniter error structure
      if (err?.error?.message) {
        // Check if it's an object with 'error' property
        if (typeof err.error.message === 'object' && err.error.message.error) {
          errorMessage = err.error.message.error
        } else if (typeof err.error.message === 'string') {
          errorMessage = err.error.message
        }
      } else if (err?.error?.details && Array.isArray(err.error.details) && err.error.details.length > 0) {
        errorMessage = err.error.details[0].message || errorMessage
      } else if (err?.message) {
        errorMessage = err.message
      }

      console.error("Signup error:", errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true)
    setError('')

    try {
      const { data, error: apiError } = await api.auth.googleAuth.query()

      if (apiError) {
        setError('Erro ao iniciar autenticação com Google')
        setIsGoogleLoading(false)
        return
      }

      if (data?.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError('Erro ao obter URL de autenticação do Google')
        setIsGoogleLoading(false)
      }
    } catch (error) {
      console.error("Error signing up with Google:", error)
      setError('Erro ao conectar com Google. Tente novamente.')
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Criar uma conta</CardTitle>
          <CardDescription>
            Comece gratuitamente em segundos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <AlertDescription className="text-green-400">{success}</AlertDescription>
              </Alert>
            )}

            {/* Google OAuth */}
            <Field>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignup}
                disabled={isLoading || isGoogleLoading}
                className="w-full"
                aria-busy={isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <GoogleIcon className="mr-2 size-4" />
                    Continuar com Google
                  </>
                )}
              </Button>
            </Field>

            <FieldSeparator>Ou</FieldSeparator>

            {/* Email Signup Form */}
            <form onSubmit={handleEmailSignup}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Nome completo</FieldLabel>
                  <Input
                    id="name"
                    type="text"
                    placeholder="João Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={isLoading}
                    autoFocus
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="email">E-mail</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="joao@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  <FieldDescription>
                    Enviaremos um código de login para seu email
                  </FieldDescription>
                </Field>

                <Field>
                  <Button
                    type="submit"
                    disabled={isLoading || isGoogleLoading}
                    className="w-full"
                    aria-busy={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando código...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Continuar com Email
                      </>
                    )}
                  </Button>
                  <FieldDescription className="text-center">
                    Já tem uma conta?{" "}
                    <a href="/login" className="underline underline-offset-4 hover:text-primary">
                      Faça login
                    </a>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  )
}
