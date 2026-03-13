"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/client/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/client/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/client/components/ui/input-otp"
import { Input } from "@/client/components/ui/input"
import { Alert, AlertDescription } from "@/client/components/ui/alert"
import { Loader2, ShieldCheck, ArrowLeft, KeyRound, AlertTriangle } from "lucide-react"

interface TwoFactorChallengeProps extends React.ComponentProps<"div"> {
  challengeId: string
  onSuccess: (data: { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean }) => void
  onCancel: () => void
}

async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<{ data?: T; error?: string; attemptsRemaining?: number; remainingCodes?: number; warning?: string; code?: string }> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  const json = await res.json()
  if (!res.ok) {
    return {
      error: json?.error?.message || json?.error || "Erro desconhecido",
      attemptsRemaining: json?.attemptsRemaining ?? json?.error?.attemptsRemaining,
      code: json?.code ?? json?.error?.code,
    }
  }
  return {
    data: json?.data ?? json,
    remainingCodes: json?.data?.remainingCodes ?? json?.remainingCodes,
    warning: json?.data?.warning ?? json?.warning,
  }
}

const MAX_ATTEMPTS = 5

export function TwoFactorChallenge({
  challengeId,
  onSuccess,
  onCancel,
  className,
  ...props
}: TwoFactorChallengeProps) {
  const [mode, setMode] = useState<"totp" | "recovery">("totp")
  const [totpCode, setTotpCode] = useState("")
  const [recoveryCode, setRecoveryCode] = useState("")
  const [error, setError] = useState("")
  const [warning, setWarning] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [attemptsRemaining, setAttemptsRemaining] = useState(MAX_ATTEMPTS)
  const [autoSubmitted, setAutoSubmitted] = useState(false)

  const handleTotpSubmit = useCallback(async (code: string) => {
    if (code.length !== 6 || isLoading) return

    setError("")
    setWarning("")
    setIsLoading(true)

    try {
      const result = await apiFetch("/api/v1/auth/totp-challenge", {
        method: "POST",
        body: JSON.stringify({ challengeId, code }),
      })

      if (result.error) {
        if (result.code === "CHALLENGE_EXHAUSTED") {
          setError("Muitas tentativas falharam. Faça login novamente.")
          setAttemptsRemaining(0)
        } else if (result.code === "INVALID_CHALLENGE") {
          setError("Sessão expirada. Faça login novamente.")
        } else {
          setError(result.error === "Invalid TOTP code." ? "Código inválido. Tente novamente." : result.error)
          if (result.attemptsRemaining !== undefined) {
            setAttemptsRemaining(result.attemptsRemaining)
          }
        }
        setTotpCode("")
        setAutoSubmitted(false)
        setIsLoading(false)
        return
      }

      if (result.data) {
        onSuccess(result.data as { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean })
      }
    } catch {
      setError("Erro ao verificar código. Tente novamente.")
      setTotpCode("")
      setAutoSubmitted(false)
      setIsLoading(false)
    }
  }, [challengeId, isLoading, onSuccess])

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = recoveryCode.trim()
    if (!trimmed || isLoading) return

    setError("")
    setWarning("")
    setIsLoading(true)

    try {
      const result = await apiFetch("/api/v1/auth/totp-recovery", {
        method: "POST",
        body: JSON.stringify({ challengeId, recoveryCode: trimmed }),
      })

      if (result.error) {
        if (result.code === "CHALLENGE_EXHAUSTED") {
          setError("Muitas tentativas falharam. Faça login novamente.")
          setAttemptsRemaining(0)
        } else if (result.code === "INVALID_CHALLENGE") {
          setError("Sessão expirada. Faça login novamente.")
        } else {
          setError(result.error === "Invalid recovery code." ? "Código de recuperação inválido." : result.error)
          if (result.attemptsRemaining !== undefined) {
            setAttemptsRemaining(result.attemptsRemaining)
          }
        }
        setRecoveryCode("")
        setIsLoading(false)
        return
      }

      // Check warnings for low remaining codes
      if (result.warning === "few_codes_remaining" && result.remainingCodes !== undefined) {
        setWarning(`Atenção: restam apenas ${result.remainingCodes} código(s) de recuperação. Gere novos códigos nas configurações de segurança.`)
      }
      if (result.warning === "2fa_disabled_no_codes") {
        setWarning("Todos os códigos de recuperação foram usados. O 2FA foi desativado automaticamente.")
      }

      if (result.data) {
        // If there's a warning, show it briefly before redirecting
        if (result.warning) {
          setTimeout(() => {
            onSuccess(result.data as { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean })
          }, 3000)
        } else {
          onSuccess(result.data as { user: { role: string; currentOrgId?: string }; needsOnboarding?: boolean })
        }
      }
    } catch {
      setError("Erro ao verificar código. Tente novamente.")
      setRecoveryCode("")
      setIsLoading(false)
    }
  }

  // Auto-submit TOTP when 6 digits filled
  useEffect(() => {
    if (totpCode.length === 6 && !isLoading && !autoSubmitted) {
      setAutoSubmitted(true)
      handleTotpSubmit(totpCode)
    }
    if (totpCode.length < 6) setAutoSubmitted(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpCode])

  const switchMode = (newMode: "totp" | "recovery") => {
    setMode(newMode)
    setError("")
    setWarning("")
    setTotpCode("")
    setRecoveryCode("")
    setAutoSubmitted(false)
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShieldCheck className="h-10 w-10 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">Verificação em duas etapas</CardTitle>
          <CardDescription>
            {mode === "totp"
              ? "Digite o código de 6 dígitos do seu aplicativo autenticador."
              : "Digite um dos seus códigos de recuperação."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "totp" ? (
            <form onSubmit={(e) => { e.preventDefault(); handleTotpSubmit(totpCode) }}>
              <FieldGroup>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {warning && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                )}

                <Field className="flex flex-col items-center space-y-2">
                  <FieldLabel htmlFor="totp-code" className="sr-only">
                    Código TOTP
                  </FieldLabel>
                  <div className="flex justify-center w-full">
                    <InputOTP
                      id="totp-code"
                      value={totpCode}
                      onChange={setTotpCode}
                      maxLength={6}
                      disabled={isLoading || attemptsRemaining <= 0}
                      autoFocus
                    >
                      <InputOTPGroup className="gap-2.5 *:data-[slot=input-otp-slot]:rounded-md *:data-[slot=input-otp-slot]:border">
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </Field>

                {attemptsRemaining < MAX_ATTEMPTS && attemptsRemaining > 0 && (
                  <FieldDescription className="text-center text-amber-600 dark:text-amber-400">
                    {attemptsRemaining} tentativa{attemptsRemaining !== 1 ? "s" : ""} restante{attemptsRemaining !== 1 ? "s" : ""}
                  </FieldDescription>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || totpCode.length !== 6 || attemptsRemaining <= 0}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    "Verificar código"
                  )}
                </Button>

                <FieldDescription className="text-center">
                  <button
                    type="button"
                    onClick={() => switchMode("recovery")}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Perdeu acesso ao autenticador?
                  </button>
                </FieldDescription>

                <FieldDescription className="text-center">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar ao login
                  </button>
                </FieldDescription>
              </FieldGroup>
            </form>
          ) : (
            <form onSubmit={handleRecoverySubmit}>
              <FieldGroup>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {warning && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                )}

                <Field>
                  <FieldLabel htmlFor="recovery-code">Código de recuperação</FieldLabel>
                  <Input
                    id="recovery-code"
                    type="text"
                    placeholder="ex: a1b2c3d4"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    disabled={isLoading || attemptsRemaining <= 0}
                    autoFocus
                    maxLength={20}
                    className="font-mono text-center tracking-widest"
                  />
                  <FieldDescription>
                    Use um dos 8 códigos gerados durante a configuração do 2FA.
                  </FieldDescription>
                </Field>

                {attemptsRemaining < MAX_ATTEMPTS && attemptsRemaining > 0 && (
                  <FieldDescription className="text-center text-amber-600 dark:text-amber-400">
                    {attemptsRemaining} tentativa{attemptsRemaining !== 1 ? "s" : ""} restante{attemptsRemaining !== 1 ? "s" : ""}
                  </FieldDescription>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading || !recoveryCode.trim() || attemptsRemaining <= 0}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    "Verificar código de recuperação"
                  )}
                </Button>

                <FieldDescription className="text-center">
                  <button
                    type="button"
                    onClick={() => switchMode("totp")}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Usar código do autenticador
                  </button>
                </FieldDescription>

                <FieldDescription className="text-center">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar ao login
                  </button>
                </FieldDescription>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
