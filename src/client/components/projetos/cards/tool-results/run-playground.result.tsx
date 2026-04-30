"use client"

import * as React from "react"
import { Bot, Shield } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { safeGet } from "./index"

interface RunPlaygroundResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter + presentational card for `get_agent_status` / playground run
 * results. Renders the agent status with version info and connected instance.
 */
export function RunPlaygroundResult({
  result,
  tokens,
}: RunPlaygroundResultProps) {
  return <AgentStatusCard result={result} tokens={tokens} />
}

function AgentStatusCard({
  result,
  tokens,
}: {
  result: unknown
  tokens: AppTokens
}) {
  const agent = safeGet<{
    name: string
    provider: string
    model: string
  }>(result, "agent")
  const status = safeGet<string>(result, "status") ?? "unknown"
  const currentVersion = safeGet<number>(result, "currentVersion")
  const draftVersion = safeGet<number>(result, "draftVersion")
  const activeConversations =
    safeGet<number>(result, "activeConversations") ?? 0
  const messagesLast24h = safeGet<number>(result, "messagesLast24h") ?? 0
  const connectedInstance = safeGet<{
    name: string
    phoneNumber: string | null
    status: string
  }>(result, "connectedInstance")

  const statusColor =
    status === "deployed"
      ? "#22c55e"
      : status === "ready"
        ? "#eab308"
        : "#ef4444"

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
        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[14px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              {agent?.name ?? "Agente"}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: statusColor }}
              />
              <span
                className="text-[11px] font-medium capitalize"
                style={{ color: statusColor }}
              >
                {status === "deployed"
                  ? "Publicado"
                  : status === "ready"
                    ? "Pronto"
                    : "Inativo"}
              </span>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div
          className="grid grid-cols-2 gap-px border-t"
          style={{
            borderColor: tokens.divider,
            backgroundColor: tokens.divider,
          }}
        >
          <StatCell
            label="Versao atual"
            value={currentVersion != null ? `v${currentVersion}` : "--"}
            tokens={tokens}
          />
          <StatCell
            label="Rascunho"
            value={draftVersion != null ? `v${draftVersion}` : "Nenhum"}
            tokens={tokens}
          />
          <StatCell
            label="Conversas ativas"
            value={String(activeConversations)}
            tokens={tokens}
          />
          <StatCell
            label="Msgs (24h)"
            value={String(messagesLast24h)}
            tokens={tokens}
          />
        </div>

        {/* Connected instance */}
        {connectedInstance && (
          <div
            className="flex items-center gap-2 border-t px-4 py-2.5"
            style={{ borderColor: tokens.divider }}
          >
            <Bot
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: tokens.textTertiary }}
            />
            <span
              className="text-[11px]"
              style={{ color: tokens.textSecondary }}
            >
              Conectado a{" "}
              <span style={{ color: tokens.textPrimary }}>
                {connectedInstance.name}
              </span>
              {connectedInstance.phoneNumber &&
                ` (${connectedInstance.phoneNumber})`}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatCell({
  label,
  value,
  tokens,
}: {
  label: string
  value: string
  tokens: AppTokens
}) {
  return (
    <div
      className="px-4 py-2.5"
      style={{ backgroundColor: tokens.bgSurface }}
    >
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: tokens.textTertiary }}
      >
        {label}
      </p>
      <p
        className="mt-0.5 text-[14px] font-semibold"
        style={{ color: tokens.textPrimary }}
      >
        {value}
      </p>
    </div>
  )
}
