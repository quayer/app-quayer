"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
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
import { Loader2, Mail, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react"
import { GoogleIcon } from "@/components/ui/google-icon"
import { PasskeyButton } from "@/components/auth/passkey-button"
import { api } from "@/igniter.client"

const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

export function LoginFormFinal({
  className,
}: { className?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // Check if WebAuthn/Passkey is supported
  const isPasskeySupported = typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined

  const handleOTPRequest = useCallback(async (e: React.FormEvent) => {
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

      setSuccess(`Codigo enviado para ${email}`)

      // Redirecionar para página de OTP
      setTimeout(() => {
        router.push(`/login/verify?email=${encodeURIComponent(email)}`)
      }, 1200)
    } catch (err: any) {
      console.error("OTP request error:", err)

      let errorMessage = "Erro ao enviar codigo. Tente novamente."

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
  }, [email, router])

  const handleGoogleLogin = useCallback(async () => {
    setIsGoogleLoading(true)
    setError("")

    try {
      const { data, error: apiError } = await api.auth.googleAuth.query()

      if (apiError) {
        setError("Erro ao iniciar autenticacao com Google")
        setIsGoogleLoading(false)
        return
      }

      if (data?.authUrl) {
        window.location.href = data.authUrl
      } else {
        setError("Erro ao obter URL de autenticacao do Google")
        setIsGoogleLoading(false)
      }
    } catch (error) {
      console.error("Error logging in with Google:", error)
      setError("Erro ao conectar com Google. Tente novamente.")
      setIsGoogleLoading(false)
    }
  }, [])

  const isValidEmail = email.includes('@') && email.includes('.')

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn("flex flex-col gap-6", className)}
    >
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm shadow-xl">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl font-semibold">Bem-vindo</CardTitle>
          <CardDescription className="text-muted-foreground">
            Digite seu email para continuar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleOTPRequest} noValidate>
            <FieldGroup>
              {/* Error Message */}
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    key="error"
                    {...fadeInUp}
                    transition={{ duration: 0.2 }}
                  >
                    <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-red-200 ml-2">{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Success Message */}
              <AnimatePresence mode="wait">
                {success && (
                  <motion.div
                    key="success"
                    {...fadeInUp}
                    transition={{ duration: 0.2 }}
                  >
                    <Alert className="border-green-500/50 bg-green-500/10">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <AlertDescription className="text-green-200 ml-2">{success}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* EMAIL INPUT - PRIMARY */}
              <Field>
                <FieldLabel htmlFor="email" className="text-sm font-medium">
                  E-mail
                </FieldLabel>
                <div className="relative">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="voce@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    required
                    disabled={isLoading || isGoogleLoading}
                    autoFocus
                    autoComplete="email"
                    aria-label="Seu endereco de email"
                    aria-describedby="email-hint"
                    className={cn(
                      "pr-10 transition-all duration-200",
                      focusedField === 'email' && "ring-2 ring-primary/20 border-primary"
                    )}
                  />
                  <AnimatePresence>
                    {email && isValidEmail && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <p id="email-hint" className="sr-only">
                  Enviaremos um codigo de verificacao para este email
                </p>
              </Field>

              {/* SEND CODE BUTTON - PRIMARY */}
              <Field>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full group relative overflow-hidden"
                  disabled={isLoading || isGoogleLoading || !isValidEmail}
                  aria-busy={isLoading}
                  aria-live="polite"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Enviando codigo...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        <span>Continuar com Email</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </span>
                </Button>
              </Field>

              <FieldSeparator>Ou</FieldSeparator>

              {/* GOOGLE OAUTH & PASSKEY */}
              <div className="grid grid-cols-1 gap-3">
                <Field>
                  <Button
                    variant="outline"
                    size="lg"
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isGoogleLoading || isLoading}
                    className="w-full group hover:bg-accent/50 transition-colors"
                    aria-busy={isGoogleLoading}
                  >
                    {isGoogleLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Conectando...</span>
                      </>
                    ) : (
                      <>
                        <GoogleIcon className="mr-2 size-4" />
                        <span>Continuar com Google</span>
                      </>
                    )}
                  </Button>
                </Field>

                <Field>
                  <PasskeyButton
                    mode="smart"
                    size="lg"
                    email={email}
                    variant="outline"
                    className="w-full hover:bg-accent/50 transition-colors"
                  />
                </Field>
              </div>

              <FieldDescription className="text-center pt-2">
                Nao tem uma conta?{" "}
                <a
                  href="/signup"
                  className="underline underline-offset-4 hover:text-primary transition-colors font-medium"
                >
                  Cadastre-se
                </a>
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {/* Terms */}
      <p className="text-center text-xs text-muted-foreground/70 px-4">
        Ao continuar, voce concorda com nossos{" "}
        <a href="/termos" className="underline underline-offset-4 hover:text-muted-foreground transition-colors">
          Termos de Servico
        </a>{" "}
        e{" "}
        <a href="/privacidade" className="underline underline-offset-4 hover:text-muted-foreground transition-colors">
          Politica de Privacidade
        </a>
        .
      </p>
    </motion.div>
  )
}
