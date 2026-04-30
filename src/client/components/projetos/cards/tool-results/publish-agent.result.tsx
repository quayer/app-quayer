"use client"

import * as React from "react"
import { AlertTriangle, ExternalLink, Rocket } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { safeGet } from "./index"

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

interface PublishAgentSuccessResultProps {
  result: unknown
  tokens: AppTokens
}

export function PublishAgentSuccessResult({
  result,
  tokens,
}: PublishAgentSuccessResultProps) {
  const message =
    safeGet<string>(result, "message") ?? "Agente publicado!"
  const publishedVersion = safeGet<number>(result, "publishedVersion")

  return (
    <DeploySuccessCard
      message={message}
      publishedVersion={publishedVersion}
      tokens={tokens}
    />
  )
}

function DeploySuccessCard({
  message,
  publishedVersion,
  tokens,
}: {
  message: string
  publishedVersion?: number | null
  tokens: AppTokens
}) {
  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: "rgba(34,197,94,0.30)",
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: "rgba(34,197,94,0.08)" }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: "rgba(34,197,94,0.15)",
              color: "#22c55e",
            }}
          >
            <Rocket className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-[14px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Agente publicado!
            </p>
            <p
              className="text-[12px]"
              style={{ color: tokens.textSecondary }}
            >
              {message}
            </p>
            {publishedVersion != null && (
              <p
                className="mt-0.5 text-[11px]"
                style={{ color: tokens.textTertiary }}
              >
                Versao publicada: v{publishedVersion}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Blockers
// ---------------------------------------------------------------------------

interface PublishAgentBlockersResultProps {
  result: unknown
  tokens: AppTokens
}

export function PublishAgentBlockersResult({
  result,
  tokens,
}: PublishAgentBlockersResultProps) {
  const blockers = safeGet<string[]>(result, "blockers") ?? []
  const redirects =
    safeGet<Record<string, string>>(result, "redirects") ?? {}

  return (
    <DeployBlockersCard
      blockers={blockers}
      redirects={redirects}
      tokens={tokens}
    />
  )
}

function DeployBlockersCard({
  blockers,
  redirects,
  tokens,
}: {
  blockers: string[]
  redirects: Record<string, string>
  tokens: AppTokens
}) {
  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: "rgba(234,179,8,0.30)",
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ backgroundColor: "rgba(234,179,8,0.08)" }}
        >
          <AlertTriangle className="h-4 w-4" style={{ color: "#eab308" }} />
          <p
            className="text-[12px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            Bloqueadores encontrados
          </p>
        </div>
        <div className="px-4 py-3">
          <ul className="flex flex-col gap-2">
            {blockers.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[12px]"
                style={{ color: tokens.textSecondary }}
              >
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: "#eab308" }}
                />
                {b}
              </li>
            ))}
          </ul>
          {Object.keys(redirects).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(redirects).map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    borderColor: tokens.border,
                    color: tokens.brandText,
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                  {key === "plan"
                    ? "Ver planos"
                    : key === "byok"
                      ? "Configurar provedor"
                      : key === "instance"
                        ? "Gerenciar instancias"
                        : key}
                </a>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
