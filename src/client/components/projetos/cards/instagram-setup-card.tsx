"use client"

import * as React from "react"
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Instagram,
  Loader2,
} from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export interface InstagramWizardStep {
  key: "create-app" | "configure-webhook" | "paste-tokens" | "connect"
  title: string
  description: string
  externalUrl: string | null
  instructions: string[]
}

export interface InstagramSetupSubmit {
  name: string
  accessToken: string
  instagramAccountId: string
  pageId: string
}

interface InstagramSetupCardProps {
  name: string
  webhookUrl: string
  verifyToken: string
  steps: InstagramWizardStep[]
  tokens: AppTokens
  /**
   * Called with the collected credentials when user clicks "Conectar Instagram".
   * Must POST to /api/v1/instances and resolve after the instance is created
   * (or reject with a message).
   */
  onSubmit?: (payload: InstagramSetupSubmit) => Promise<void>
}

function CopyButton({
  value,
  tokens,
  label,
}: {
  value: string
  tokens: AppTokens
  label: string
}) {
  const [copied, setCopied] = React.useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignored
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors"
      style={{
        borderColor: tokens.border,
        color: tokens.textSecondary,
        backgroundColor: tokens.bgBase,
      }}
      aria-label={`Copiar ${label}`}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" style={{ color: tokens.brand }} />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copiar
        </>
      )}
    </button>
  )
}

export function InstagramSetupCard({
  name,
  webhookUrl,
  verifyToken,
  steps,
  tokens,
  onSubmit,
}: InstagramSetupCardProps) {
  const [activeStep, setActiveStep] = React.useState(0)
  const [accessToken, setAccessToken] = React.useState("")
  const [accountId, setAccountId] = React.useState("")
  const [pageId, setPageId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  const isLast = activeStep === steps.length - 1
  const canSubmit =
    accessToken.trim().length > 20 && accountId.trim().length > 0

  const handleConnect = async () => {
    if (!onSubmit || !canSubmit || submitting || done) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        name,
        accessToken: accessToken.trim(),
        instagramAccountId: accountId.trim(),
        pageId: pageId.trim(),
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ backgroundColor: tokens.hoverBg }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Instagram className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Conectar Instagram — {name}
            </p>
            <p
              className="truncate text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              {done
                ? "Conectado! Envie uma DM de teste"
                : `Passo ${activeStep + 1} de ${steps.length}: ${steps[activeStep]?.title}`}
            </p>
          </div>
        </div>

        <div
          className="flex border-b px-3 py-2"
          style={{ borderColor: tokens.divider }}
        >
          {steps.map((step, i) => {
            const isActive = i === activeStep
            const isCompleted = i < activeStep || done
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => setActiveStep(i)}
                className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 text-center"
                disabled={submitting}
              >
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: isActive
                      ? tokens.brand
                      : isCompleted
                        ? tokens.brandSubtle
                        : tokens.hoverBg,
                    color: isActive
                      ? tokens.textInverse
                      : isCompleted
                        ? tokens.brand
                        : tokens.textTertiary,
                  }}
                >
                  {isCompleted ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span
                  className="truncate text-[9px] font-medium"
                  style={{
                    color: isActive
                      ? tokens.textPrimary
                      : tokens.textTertiary,
                  }}
                >
                  {step.title}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          {steps[activeStep] && (
            <>
              <p
                className="text-[12px]"
                style={{ color: tokens.textSecondary }}
              >
                {steps[activeStep].description}
              </p>

              {steps[activeStep].externalUrl && (
                <a
                  href={steps[activeStep].externalUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 self-start rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: tokens.brandBorder,
                    color: tokens.brand,
                    backgroundColor: tokens.brandSubtle,
                  }}
                >
                  Abrir Meta for Developers
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}

              <ol
                className="flex list-decimal flex-col gap-1 pl-4 text-[11px]"
                style={{ color: tokens.textSecondary }}
              >
                {steps[activeStep].instructions.map((ins, i) => (
                  <li key={i}>{ins}</li>
                ))}
              </ol>

              {steps[activeStep].key === "configure-webhook" && (
                <div className="flex flex-col gap-2">
                  <div>
                    <Label
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: tokens.textTertiary }}
                    >
                      Callback URL
                    </Label>
                    <div
                      className="mt-1 flex items-center gap-2 rounded-md border px-2 py-1.5"
                      style={{
                        borderColor: tokens.border,
                        backgroundColor: tokens.bgBase,
                      }}
                    >
                      <code
                        className="flex-1 overflow-x-auto whitespace-nowrap text-[11px]"
                        style={{ color: tokens.textPrimary }}
                      >
                        {webhookUrl}
                      </code>
                      <CopyButton
                        value={webhookUrl}
                        tokens={tokens}
                        label="Callback URL"
                      />
                    </div>
                  </div>
                  <div>
                    <Label
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: tokens.textTertiary }}
                    >
                      Verify Token
                    </Label>
                    <div
                      className="mt-1 flex items-center gap-2 rounded-md border px-2 py-1.5"
                      style={{
                        borderColor: tokens.border,
                        backgroundColor: tokens.bgBase,
                      }}
                    >
                      <code
                        className="flex-1 overflow-x-auto whitespace-nowrap text-[11px]"
                        style={{ color: tokens.textPrimary }}
                      >
                        {verifyToken}
                      </code>
                      <CopyButton
                        value={verifyToken}
                        tokens={tokens}
                        label="Verify Token"
                      />
                    </div>
                  </div>
                </div>
              )}

              {steps[activeStep].key === "paste-tokens" && (
                <div className="flex flex-col gap-2.5">
                  <div>
                    <Label
                      htmlFor="ig-token"
                      className="text-[11px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      Page Access Token *
                    </Label>
                    <Input
                      id="ig-token"
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="EAAB..."
                      className="mt-1 h-8 text-[12px]"
                      disabled={submitting || done}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="ig-account"
                      className="text-[11px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      Instagram Business Account ID *
                    </Label>
                    <Input
                      id="ig-account"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      placeholder="17841..."
                      className="mt-1 h-8 text-[12px]"
                      disabled={submitting || done}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="ig-page"
                      className="text-[11px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      Facebook Page ID (opcional)
                    </Label>
                    <Input
                      id="ig-page"
                      value={pageId}
                      onChange={(e) => setPageId(e.target.value)}
                      placeholder="1234567..."
                      className="mt-1 h-8 text-[12px]"
                      disabled={submitting || done}
                    />
                  </div>
                </div>
              )}

              {steps[activeStep].key === "connect" && (
                <div className="flex flex-col gap-2">
                  {!canSubmit && (
                    <p
                      className="rounded-md border px-2.5 py-1.5 text-[11px]"
                      style={{
                        borderColor: tokens.border,
                        backgroundColor: tokens.hoverBg,
                        color: tokens.textSecondary,
                      }}
                    >
                      Volte no passo 3 e cole os tokens obrigatórios.
                    </p>
                  )}
                  {error && (
                    <p
                      className="rounded-md border px-2.5 py-1.5 text-[11px]"
                      style={{
                        borderColor: tokens.border,
                        backgroundColor: tokens.hoverBg,
                        color: tokens.textPrimary,
                      }}
                    >
                      {error}
                    </p>
                  )}
                  {done && (
                    <p
                      className="rounded-md border px-2.5 py-1.5 text-[11px]"
                      style={{
                        borderColor: tokens.brandBorder,
                        backgroundColor: tokens.brandSubtle,
                        color: tokens.brand,
                      }}
                    >
                      Instagram conectado. Pronto para receber DMs.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-2 border-t px-4 py-3"
          style={{ borderColor: tokens.divider }}
        >
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-[12px]"
            onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
            disabled={activeStep === 0 || submitting}
          >
            Voltar
          </Button>
          {isLast ? (
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-lg text-[12px] font-medium"
              style={{
                backgroundColor: tokens.brand,
                color: tokens.textInverse,
              }}
              onClick={handleConnect}
              disabled={!canSubmit || submitting || done}
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {done ? "Conectado" : "Conectar Instagram"}
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 gap-1 rounded-lg text-[12px] font-medium"
              style={{
                backgroundColor: tokens.brand,
                color: tokens.textInverse,
              }}
              onClick={() => setActiveStep((s) => Math.min(steps.length - 1, s + 1))}
              disabled={submitting}
            >
              Próximo
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
