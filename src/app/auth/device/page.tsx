"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useState } from "react"
import {
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ShieldAlert,
} from "lucide-react"

import { Button } from "@/client/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card"
import { Badge } from "@/client/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert"
import { Logo } from "@/client/components/ds/logo"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState =
  | "loading"
  | "prompt"
  | "manual-entry"
  | "success"
  | "denied"
  | "error"

interface DeviceInfo {
  userCode: string
  keyName: string
  scopes: string[]
  organizationName: string | null
  expiresAt: string
}

type ErrorKind = "expired" | "not_found" | "already_used" | "unknown"

const ERROR_MESSAGES: Record<ErrorKind, { title: string; description: string }> = {
  expired: {
    title: "Codigo expirado",
    description:
      "Este codigo expirou. Inicie o processo novamente no terminal.",
  },
  not_found: {
    title: "Codigo invalido",
    description: "Verifique o codigo e tente novamente.",
  },
  already_used: {
    title: "Codigo ja utilizado",
    description: "Este codigo ja foi utilizado para autorizar um dispositivo.",
  },
  unknown: {
    title: "Erro inesperado",
    description: "Ocorreu um erro. Tente novamente mais tarde.",
  },
}

// ---------------------------------------------------------------------------
// Scope label mapping
// ---------------------------------------------------------------------------

const SCOPE_LABELS: Record<string, string> = {
  read: "Leitura",
  write: "Escrita",
  admin: "Administrador",
  "read:contacts": "Ler contatos",
  "write:contacts": "Escrever contatos",
  "read:messages": "Ler mensagens",
  "write:messages": "Enviar mensagens",
  "read:agents": "Ler agentes",
  "write:agents": "Configurar agentes",
}

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope
}

// ---------------------------------------------------------------------------
// Inner component (needs useSearchParams inside Suspense)
// ---------------------------------------------------------------------------

function DeviceAuthContent() {
  const searchParams = useSearchParams()
  const codeFromUrl = searchParams.get("code")

  const [state, setState] = useState<PageState>(
    codeFromUrl ? "loading" : "manual-entry"
  )
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [errorKind, setErrorKind] = useState<ErrorKind>("unknown")
  const [manualCode, setManualCode] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // -- Fetch device info by code ------------------------------------------

  const fetchDeviceInfo = useCallback(async (code: string) => {
    setState("loading")
    try {
      const res = await fetch(
        `/api/v1/device-auth/info?userCode=${encodeURIComponent(code)}`,
        { credentials: "include" }
      )

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const errorCode = (body as Record<string, string>).code ?? ""
        if (errorCode === "EXPIRED" || res.status === 410) {
          setErrorKind("expired")
        } else if (errorCode === "ALREADY_USED" || res.status === 409) {
          setErrorKind("already_used")
        } else if (res.status === 404) {
          setErrorKind("not_found")
        } else {
          setErrorKind("unknown")
        }
        setState("error")
        return
      }

      const data = (await res.json()) as DeviceInfo
      setDeviceInfo(data)
      setState("prompt")
    } catch {
      setErrorKind("unknown")
      setState("error")
    }
  }, [])

  useEffect(() => {
    if (codeFromUrl) {
      fetchDeviceInfo(codeFromUrl)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -- Approve / Deny -----------------------------------------------------

  const handleAction = async (action: "approve" | "deny") => {
    const code = deviceInfo?.userCode ?? codeFromUrl ?? manualCode
    if (!code) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/v1/device-auth/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: code, action }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const errorCode = (body as Record<string, string>).code ?? ""
        if (errorCode === "EXPIRED" || res.status === 410) {
          setErrorKind("expired")
        } else if (errorCode === "ALREADY_USED" || res.status === 409) {
          setErrorKind("already_used")
        } else {
          setErrorKind("unknown")
        }
        setState("error")
        return
      }

      setState(action === "approve" ? "success" : "denied")
    } catch {
      setErrorKind("unknown")
      setState("error")
    } finally {
      setSubmitting(false)
    }
  }

  // -- Manual code submission ---------------------------------------------

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = manualCode.trim()
    if (trimmed.length > 0) {
      fetchDeviceInfo(trimmed)
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        backgroundColor: "var(--color-bg-base, #000000)",
        color: "var(--color-text-primary, #ffffff)",
      }}
    >
      {/* Logo */}
      <div className="mb-8">
        <Logo size={32} variant="color" />
      </div>

      {/* Loading */}
      {state === "loading" && (
        <Card className="w-full max-w-md border-white/10 bg-white/[0.03]">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="size-8 animate-spin text-white/40" />
            <p className="text-sm text-white/50">Verificando codigo...</p>
          </CardContent>
        </Card>
      )}

      {/* Manual Code Entry */}
      {state === "manual-entry" && (
        <Card className="w-full max-w-md border-white/10 bg-white/[0.03]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-white/[0.06]">
              <Terminal className="size-6 text-white/70" />
            </div>
            <CardTitle className="text-lg text-white">
              Autorizar dispositivo
            </CardTitle>
            <CardDescription className="text-white/50">
              Insira o codigo exibido no seu terminal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleManualSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="ABCD-1234"
                autoFocus
                className="h-12 w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 text-center font-mono text-xl tracking-[0.2em] text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/10"
                maxLength={20}
                aria-label="Codigo do dispositivo"
              />
              <Button
                type="submit"
                disabled={manualCode.trim().length === 0}
                className="h-10 w-full bg-white text-black hover:bg-white/90"
              >
                Verificar codigo
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Authorization Prompt */}
      {state === "prompt" && deviceInfo && (
        <Card className="w-full max-w-md border-white/10 bg-white/[0.03]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-white/[0.06]">
              <Terminal className="size-6 text-white/70" />
            </div>
            <CardTitle className="text-lg text-white">
              Autorizar dispositivo
            </CardTitle>
            <CardDescription className="text-white/50">
              Um dispositivo esta solicitando acesso a sua conta Quayer.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {/* User code display */}
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-4">
              <span className="text-xs font-medium uppercase tracking-wider text-white/40">
                Codigo de verificacao
              </span>
              <span className="font-mono text-2xl font-bold tracking-[0.15em] text-white">
                {deviceInfo.userCode}
              </span>
            </div>

            {/* Details */}
            <div className="flex flex-col gap-3 text-sm">
              {/* Device / Key name */}
              <div className="flex items-center justify-between">
                <span className="text-white/50">Dispositivo</span>
                <span className="font-medium text-white">
                  {deviceInfo.keyName}
                </span>
              </div>

              {/* Organization */}
              {deviceInfo.organizationName && (
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Organizacao</span>
                  <span className="font-medium text-white">
                    {deviceInfo.organizationName}
                  </span>
                </div>
              )}

              {/* Scopes */}
              {deviceInfo.scopes.length > 0 && (
                <div className="flex items-start justify-between gap-2">
                  <span className="mt-0.5 text-white/50">Permissoes</span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {deviceInfo.scopes.map((scope) => (
                      <Badge
                        key={scope}
                        variant="secondary"
                        className="border-white/10 bg-white/[0.06] text-white/80"
                      >
                        {scopeLabel(scope)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Warning */}
            <Alert className="border-amber-500/20 bg-amber-500/[0.06]">
              <ShieldAlert className="size-4 text-amber-400" />
              <AlertTitle className="text-amber-300 text-xs font-semibold">
                Atencao
              </AlertTitle>
              <AlertDescription className="text-amber-200/70 text-xs">
                Certifique-se de que voce iniciou esta solicitacao. Se nao
                reconhece este codigo, clique em Negar.
              </AlertDescription>
            </Alert>
          </CardContent>

          <CardFooter className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-white/10 bg-transparent text-white/70 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
              onClick={() => handleAction("deny")}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Negar"
              )}
            </Button>
            <Button
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={() => handleAction("approve")}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Autorizar"
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Success */}
      {state === "success" && (
        <Card className="w-full max-w-md border-white/10 bg-white/[0.03]">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="size-8 text-emerald-400" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">
                Dispositivo autorizado com sucesso!
              </h2>
              <p className="mt-1.5 text-sm text-white/50">
                Voce pode fechar esta janela e voltar ao terminal.
              </p>
            </div>
            {deviceInfo && (
              <div className="mt-2 flex flex-col items-center gap-1 text-sm text-white/40">
                {deviceInfo.organizationName && (
                  <span>{deviceInfo.organizationName}</span>
                )}
                <span className="font-mono text-xs">{deviceInfo.keyName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Denied */}
      {state === "denied" && (
        <Card className="w-full max-w-md border-white/10 bg-white/[0.03]">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="flex size-14 items-center justify-center rounded-full bg-red-500/10">
              <XCircle className="size-8 text-red-400" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">
                Acesso negado
              </h2>
              <p className="mt-1.5 text-sm text-white/50">
                O dispositivo nao foi autorizado.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {state === "error" && (
        <Card className="w-full max-w-md border-white/10 bg-white/[0.03]">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="flex size-14 items-center justify-center rounded-full bg-white/[0.04]">
              {errorKind === "expired" ? (
                <Clock className="size-8 text-amber-400" />
              ) : (
                <AlertTriangle className="size-8 text-red-400" />
              )}
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">
                {ERROR_MESSAGES[errorKind].title}
              </h2>
              <p className="mt-1.5 text-sm text-white/50">
                {ERROR_MESSAGES[errorKind].description}
              </p>
            </div>
            <Button
              variant="outline"
              className="mt-2 border-white/10 bg-transparent text-white/70 hover:bg-white/[0.06]"
              onClick={() => {
                setManualCode("")
                setState("manual-entry")
              }}
            >
              Tentar outro codigo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page export (wrapped in Suspense for useSearchParams)
// ---------------------------------------------------------------------------

export default function DeviceAuthPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          style={{ backgroundColor: "var(--color-bg-base, #000000)" }}
        >
          <Loader2 className="size-8 animate-spin text-white/40" />
        </div>
      }
    >
      <DeviceAuthContent />
    </Suspense>
  )
}
