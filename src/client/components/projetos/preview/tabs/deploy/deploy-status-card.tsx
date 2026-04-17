"use client"

/**
 * DeployStatusCard — reusable status cards for deploy tab
 *
 * Exposes:
 *  - SuccessCard: post-publish celebration card
 *  - TimelineDot: small rail dot used by summary timeline
 *  - PromptVersion type: shared across deploy step components
 */

import { Clock, PartyPopper } from "lucide-react"
import { Card, CardContent } from "@/client/components/ui/card"
import type { useAppTokens } from "@/client/hooks/use-app-tokens"

export type Tokens = ReturnType<typeof useAppTokens>["tokens"]

export interface PromptVersion {
  id: string
  versionNumber: number
  description: string | null
  publishedAt: string | null
  createdAt: string
}

export function SuccessCard({
  tokens,
  versionNumber,
  onDismiss,
}: {
  tokens: Tokens
  versionNumber: number
  onDismiss: () => void
}) {
  return (
    <Card
      className="border p-0 shadow-none"
      style={{
        backgroundColor: "rgba(34,197,94,0.08)",
        borderColor: "rgba(34,197,94,0.25)",
      }}
    >
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(34,197,94,0.15)" }}
        >
          <PartyPopper className="h-6 w-6" style={{ color: "#22c55e" }} />
        </div>
        <div>
          <p
            className="text-[15px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            Agente publicado com sucesso!
          </p>
          <p
            className="mt-1 text-[13px]"
            style={{ color: tokens.textSecondary }}
          >
            Versao v{versionNumber} esta ativa em producao.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-1 text-[12px] font-medium underline underline-offset-2"
          style={{ color: tokens.textTertiary }}
        >
          Fechar
        </button>
      </CardContent>
    </Card>
  )
}

export function VersionStatusCards({
  tokens,
  versions,
  loading,
  production,
  draft,
}: {
  tokens: Tokens
  versions: PromptVersion[]
  loading: boolean
  production: PromptVersion | null
  draft: PromptVersion | null
}) {
  return (
    <Card
      className="border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <CardContent className="grid grid-cols-1 gap-0 p-0 sm:grid-cols-2">
        <div className="p-5" style={{ borderRight: "none" }}>
          <div
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: tokens.textTertiary }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: "#22c55e" }}
            />
            Producao
          </div>
          {production ? (
            <>
              <div
                className="mt-2 text-xl font-bold"
                style={{ color: tokens.textPrimary }}
              >
                v{production.versionNumber}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: "rgba(34,197,94,0.12)",
                    color: "#22c55e",
                  }}
                >
                  Ativo
                </span>
                <span
                  className="inline-flex items-center gap-1 text-[11px]"
                  style={{ color: tokens.textTertiary }}
                >
                  <Clock className="h-3 w-3" />
                  {production.publishedAt
                    ? new Date(production.publishedAt).toLocaleString("pt-BR")
                    : ""}
                </span>
              </div>
            </>
          ) : (
            <div
              className="mt-2 text-[13px]"
              style={{ color: tokens.textTertiary }}
            >
              Nenhuma versao em producao
            </div>
          )}
        </div>

        <div
          className="hidden sm:block"
          style={{ borderLeft: `1px solid ${tokens.divider}` }}
        >
          <DraftBlock tokens={tokens} draft={draft} />
        </div>

        <div
          className="block border-t p-5 sm:hidden"
          style={{ borderColor: tokens.divider }}
        >
          <DraftInner tokens={tokens} draft={draft} />
        </div>
      </CardContent>

      {versions.length === 0 && !loading && (
        <div
          className="border-t px-5 py-4 text-center"
          style={{ borderColor: tokens.divider }}
        >
          <p className="text-[12px]" style={{ color: tokens.textTertiary }}>
            Nenhuma versao criada ainda. O Builder criara automaticamente.
          </p>
        </div>
      )}
    </Card>
  )
}

function DraftBlock({
  tokens,
  draft,
}: {
  tokens: Tokens
  draft: PromptVersion | null
}) {
  return (
    <div className="p-5">
      <DraftInner tokens={tokens} draft={draft} />
    </div>
  )
}

function DraftInner({
  tokens,
  draft,
}: {
  tokens: Tokens
  draft: PromptVersion | null
}) {
  return (
    <>
      <div
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: tokens.textTertiary }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: tokens.brand }}
        />
        Rascunho
      </div>
      {draft ? (
        <>
          <div
            className="mt-2 text-xl font-bold"
            style={{ color: tokens.textPrimary }}
          >
            v{draft.versionNumber}
          </div>
          <div className="mt-1">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${tokens.brand}18`,
                color: tokens.brand,
              }}
            >
              Rascunho
            </span>
          </div>
        </>
      ) : (
        <div
          className="mt-2 text-[13px]"
          style={{ color: tokens.textTertiary }}
        >
          Nenhum rascunho
        </div>
      )}
    </>
  )
}

export function TimelineDot({ color }: { color: string }) {
  return (
    <div className="relative flex flex-col items-center">
      <div
        className="h-3 w-3 rounded-full border-2"
        style={{ borderColor: color, backgroundColor: color }}
      />
    </div>
  )
}
