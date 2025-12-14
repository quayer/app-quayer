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
import { PasswordInput } from "@/components/ui/password-input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2 } from "lucide-react"
import { GoogleIcon } from "@/components/ui/google-icon"
import { PasskeyButton } from "@/components/auth/passkey-button"
import { api } from "@/igniter.client"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setEmailError("")
    setPasswordError("")
    setIsLoading(true)

    try {
      const { data, error: apiError } = await api.auth.login.mutate({
        body: { email, password }
      })

      if (apiError) {
        // Error específico por campo
        const err = apiError as any
        const errorMsg = err.message || err.error?.message || 'Erro ao fazer login'

        if (errorMsg.toLowerCase().includes('email')) {
          setEmailError(errorMsg)
        } else if (errorMsg.toLowerCase().includes('senha') || errorMsg.toLowerCase().includes('password')) {
          setPasswordError(errorMsg)
        } else {
          setError(errorMsg)
        }
        setIsLoading(false)
        return
      }

      const loginData = data as any
      if (loginData?.accessToken) {
        localStorage.setItem("accessToken", loginData.accessToken)
        if (loginData.refreshToken) {
          localStorage.setItem("refreshToken", loginData.refreshToken)
        }

        // Cookie com encoding seguro
        const cookieValue = encodeURIComponent(loginData.accessToken)
        document.cookie = 'accessToken=' + cookieValue + '; path=/; max-age=86400; SameSite=Lax'

        // ✅ CORREÇÃO BRUTAL: Respeitar needsOnboarding antes de redirecionar
        const userRole = loginData.user?.role
        const needsOnboarding = loginData.needsOnboarding

        // Se precisa de onboarding, ir para /onboarding independente do role
        if (needsOnboarding) {
          window.location.href = "/onboarding"
          return
        }
        
        // Caso contrário, redirecionar baseado no role
        const redirectPath = userRole === "admin" ? "/admin" : "/integracoes"
        window.location.href = redirectPath
      }
    } catch (err: any) {
      console.error("Login error:", err)

      // Extract error message from Igniter.js API
      let errorMessage = "Credenciais inválidas. Verifique seu email e senha."

      if (err?.error?.details && Array.isArray(err.error.details) && err.error.details.length > 0) {
        errorMessage = err.error.details[0].message || errorMessage
      } else if (err?.error?.message) {
        errorMessage = err.error.message
      } else if (err?.message) {
        errorMessage = err.message
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true)
    setError("")

    try {
      const { data, error: apiError } = await api.auth.googleAuth.query()

      if (apiError) {
        setError("Erro ao iniciar autenticação com Google")
        setIsGoogleLoading(false)
        return
      }

      if (data?.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError("Erro ao obter URL de autenticação do Google")
        setIsGoogleLoading(false)
      }
    } catch (error) {
      console.error("Error logging in with Google:", error)
      setError("Erro ao conectar com Google. Tente novamente.")
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Bem-vindo de volta</CardTitle>
          <CardDescription>
            Entre com sua conta Google ou email
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

              <div className="grid grid-cols-1 gap-3">
                <Field>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isGoogleLoading || isLoading}
                    className="w-full"
                  >
                    {isGoogleLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Conectando ao Google...
                      </>
                    ) : (
                      <>
                        <GoogleIcon className="mr-2 size-4" />
                        Entrar com Google
                      </>
                    )}
                  </Button>
                </Field>

                <Field>
                  <PasskeyButton
                    mode="login"
                    email={email}
                    variant="outline"
                    className="w-full"
                  />
                </Field>
              </div>

              <FieldSeparator>Ou continue com</FieldSeparator>

              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setEmailError("")
                  }}
                  required
                  disabled={isLoading}
                  autoFocus
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? "email-error" : undefined}
                />
                {emailError && (
                  <p id="email-error" className="text-xs text-red-400 mt-1">
                    {emailError}
                  </p>
                )}
              </Field>

              <Field>
                <div className="flex items-center justify-between mb-2">
                  <FieldLabel htmlFor="password">Senha</FieldLabel>
                  <a
                    href="/forgot-password"
                    className="text-sm text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    Esqueceu a senha?
                  </a>
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setPasswordError("")
                  }}
                  required
                  disabled={isLoading}
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? "password-error" : undefined}
                />
                {passwordError && (
                  <p id="password-error" className="text-xs text-red-400 mt-1">
                    {passwordError}
                  </p>
                )}
              </Field>

              <Field>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || isGoogleLoading}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    "Entrar"
                  )}
                </Button>
                
                {/* ✅ CORREÇÃO BRUTAL: Botão para Login via Código OTP */}
                <div className="mt-3 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-sm"
                    onClick={() => router.push('/login/verify')}
                    disabled={isLoading || isGoogleLoading}
                  >
                    Entrar com código de verificação
                  </Button>
                </div>
                
                <FieldDescription className="text-center mt-3">
                  Não tem uma conta?{" "}
                  <a href="/signup" className="underline underline-offset-4 hover:text-primary">
                    Cadastre-se
                  </a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center text-xs">
        Ao continuar, você concorda com nossos{" "}
        <a href="/termos" className="underline underline-offset-4 hover:text-primary">
          Termos de Serviço
        </a>{" "}
        e{" "}
        <a href="/privacidade" className="underline underline-offset-4 hover:text-primary">
          Política de Privacidade
        </a>
        .
      </FieldDescription>
    </div>
  )
}
