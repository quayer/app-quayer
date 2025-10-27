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
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Mail, Fingerprint, ChevronDown, ChevronUp } from "lucide-react"
import { GoogleIcon } from "@/components/ui/google-icon"
import { api } from "@/igniter.client"

export function LoginFormMagic({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [showPasswordLogin, setShowPasswordLogin] = useState(false)
  const [showBiometric, setShowBiometric] = useState(false)

  // Check if WebAuthn is supported
  const isWebAuthnSupported = typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    try {
      // TODO: Implement magic link endpoint
      // const { data, error: apiError } = await api.auth.requestMagicLink.mutate({
      //   body: { email, rememberMe }
      // })

      // Simulação por enquanto
      await new Promise(resolve => setTimeout(resolve, 1000))

      setSuccess(`✨ Link mágico enviado para ${email}! Verifique sua caixa de entrada.`)
    } catch (err: any) {
      console.error("Magic link error:", err)
      setError("Erro ao enviar link mágico. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    try {
      const { data, error: apiError } = await api.auth.login.mutate({
        body: { email, password, rememberMe }
      })

      if (apiError) {
        setError(apiError.message || apiError.error?.message || 'Erro ao fazer login')
        setIsLoading(false)
        return
      }

      if (data?.accessToken) {
        localStorage.setItem("accessToken", data.accessToken)
        if (data.refreshToken) {
          localStorage.setItem("refreshToken", data.refreshToken)
        }

        // Cookie duration based on Remember Me
        const maxAge = rememberMe ? 2592000 : 86400 // 30 days or 24 hours
        const cookieValue = encodeURIComponent(data.accessToken)
        document.cookie = `accessToken=${cookieValue}; path=/; max-age=${maxAge}; SameSite=Lax`

        const userRole = data.user?.role
        const redirectPath = userRole === "admin" ? "/admin" : "/integracoes"

        window.location.href = redirectPath
      }
    } catch (err: any) {
      console.error("Login error:", err)
      setError("Credenciais inválidas. Verifique seu email e senha.")
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

  const handleBiometricLogin = async () => {
    if (!isWebAuthnSupported) {
      setError("Autenticação biométrica não suportada neste navegador")
      return
    }

    setError("")
    setIsLoading(true)

    try {
      // TODO: Implement WebAuthn login
      // const { data } = await api.auth.webAuthnLoginOptions.query({ body: { email } })
      // const credential = await navigator.credentials.get({
      //   publicKey: data.options
      // })
      // const result = await api.auth.webAuthnLoginVerify.mutate({
      //   body: { email, credential, rememberMe }
      // })

      // Simulação
      setError("Biometric login will be implemented with WebAuthn backend")
    } catch (err: any) {
      console.error("Biometric login error:", err)
      setError("Erro na autenticação biométrica")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Bem-vindo de volta</CardTitle>
          <CardDescription>
            Entre com link mágico ou escolha outra opção
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {error && (
              <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-500/50 bg-green-500/10">
                <AlertDescription className="text-green-200">{success}</AlertDescription>
              </Alert>
            )}

            {/* Magic Link - PRIMARY */}
            <form onSubmit={handleMagicLinkSubmit}>
              <Field>
                <FieldLabel htmlFor="email-magic">E-mail</FieldLabel>
                <Input
                  id="email-magic"
                  name="email"
                  type="email"
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </Field>

              <Field>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember-magic"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  />
                  <label
                    htmlFor="remember-magic"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                  >
                    Manter conectado por 30 dias
                  </label>
                </div>
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
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Enviar Link Mágico
                    </>
                  )}
                </Button>
              </Field>
            </form>

            <FieldSeparator>Ou</FieldSeparator>

            {/* Google OAuth */}
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

            {/* Biometric (if supported) */}
            {isWebAuthnSupported && (
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={isLoading || isGoogleLoading || !email}
                  className="w-full"
                >
                  <Fingerprint className="mr-2 h-4 w-4" />
                  Usar Touch ID / Face ID
                </Button>
              </Field>
            )}

            <FieldSeparator>
              <button
                type="button"
                onClick={() => setShowPasswordLogin(!showPasswordLogin)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Entrar com senha
                {showPasswordLogin ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            </FieldSeparator>

            {/* Password Login - FALLBACK */}
            {showPasswordLogin && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <Field>
                  <FieldLabel htmlFor="password">Senha</FieldLabel>
                  <PasswordInput
                    id="password"
                    name="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  <div className="flex justify-end mt-1">
                    <a
                      href="/forgot-password"
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-primary"
                    >
                      Esqueceu a senha?
                    </a>
                  </div>
                </Field>

                <Field>
                  <Button
                    type="submit"
                    className="w-full"
                    variant="secondary"
                    disabled={isLoading || isGoogleLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      "Entrar com Senha"
                    )}
                  </Button>
                </Field>
              </form>
            )}

            <FieldDescription className="text-center">
              Não tem uma conta?{" "}
              <a href="/signup" className="underline underline-offset-4 hover:text-primary">
                Cadastre-se
              </a>
            </FieldDescription>
          </FieldGroup>
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
