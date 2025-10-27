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
import { Loader2, Mail, Key } from "lucide-react"
import { GoogleIcon } from "@/components/ui/google-icon"
import { PasskeyButton } from "@/components/auth/passkey-button"
import { api } from "@/igniter.client"

export function LoginFormFinal({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  // Check if WebAuthn/Passkey is supported
  const isPasskeySupported = typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined

  const handleOTPRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setIsLoading(true)

    try {
      const { data, error: apiError } = await api.auth.loginOTP.mutate({
        body: { email }
      })

      if (apiError) {
        throw apiError
      }

      setSuccess(`✉️ Código enviado para ${email}! Verifique sua caixa de entrada.`)

      // Redirecionar para página de OTP
      setTimeout(() => {
        router.push(`/login/verify?email=${encodeURIComponent(email)}`)
      }, 1500)
    } catch (err: any) {
      console.error("OTP request error:", err)

      let errorMessage = "Erro ao enviar código. Tente novamente."

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

  const handlePasskeyLogin = async () => {
    if (!isPasskeySupported) {
      setError("Passkeys não suportados neste navegador. Use Chrome, Safari ou Edge.")
      return
    }

    if (!email) {
      setError("Digite seu email primeiro")
      return
    }

    setError("")
    setIsLoading(true)

    try {
      // TODO: Implementar WebAuthn/Passkey backend
      // 1. Obter challenge do servidor
      // const { data } = await api.auth.passkeyLoginOptions.query({ body: { email } })

      // 2. Usar WebAuthn API
      // const credential = await navigator.credentials.get({
      //   publicKey: data.options
      // })

      // 3. Verificar no servidor
      // const result = await api.auth.passkeyLoginVerify.mutate({
      //   body: { email, credential: JSON.stringify(credential) }
      // })

      // 4. Salvar tokens e redirecionar
      // localStorage.setItem("accessToken", result.data.accessToken)
      // ...

      // Por enquanto, simula
      setError("🔐 Passkeys em breve! Backend WebAuthn será implementado.")
    } catch (err: any) {
      console.error("Passkey login error:", err)
      setError(err.message || "Erro na autenticação com Passkey")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Bem-vindo</CardTitle>
          <CardDescription>
            Digite seu email para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleOTPRequest}>
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

              {/* EMAIL INPUT - PRIMARY */}
              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading || isGoogleLoading}
                  autoFocus
                />
              </Field>

              {/* SEND CODE BUTTON - PRIMARY */}
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
                      Continuar com Email
                    </>
                  )}
                </Button>
              </Field>

              <FieldSeparator>Ou</FieldSeparator>

              {/* GOOGLE OAUTH & PASSKEY */}
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

                <Field>
                  <PasskeyButton
                    mode="login"
                    email={email}
                    variant="outline"
                    className="w-full"
                  />
                </Field>
              </div>

              <FieldDescription className="text-center">
                Não tem uma conta?{" "}
                <a href="/signup" className="underline underline-offset-4 hover:text-primary">
                  Cadastre-se
                </a>
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
