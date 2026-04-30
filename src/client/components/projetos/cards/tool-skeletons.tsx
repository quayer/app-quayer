"use client"

import * as React from "react"
import { Bot, QrCode, Sliders, Smartphone, Wrench } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

/**
 * Tier 3.4 — per-tool streaming skeletons.
 *
 * Previously every streaming tool rendered the same collapsible with
 * "executando..." text. This module provides light visual previews that
 * mirror the final card shape so the user sees progress instead of a
 * generic spinner. The skeleton is returned as-is (no spinner) and the
 * caller wraps it in a `animate-pulse` container for the shimmer effect.
 */

interface SkeletonProps {
  tokens: AppTokens
}

function ShimmerBar({
  tokens,
  widthClass = "w-full",
  heightClass = "h-2.5",
}: SkeletonProps & { widthClass?: string; heightClass?: string }) {
  return (
    <div
      className={`${widthClass} ${heightClass} rounded`}
      style={{ backgroundColor: tokens.hoverBg }}
    />
  )
}

function CardShell({
  tokens,
  children,
  borderColor,
}: SkeletonProps & {
  children: React.ReactNode
  borderColor?: string
}) {
  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: borderColor ?? tokens.border,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}

function CreateAgentSkeleton({ tokens }: SkeletonProps) {
  return (
    <CardShell tokens={tokens} borderColor="rgba(34,197,94,0.30)">
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: "rgba(34,197,94,0.08)" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "rgba(34,197,94,0.15)",
            color: "#22c55e",
          }}
        >
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <ShimmerBar tokens={tokens} widthClass="w-32" />
          <ShimmerBar tokens={tokens} widthClass="w-48" heightClass="h-1.5" />
        </div>
      </div>
      <div className="px-4 py-2.5">
        <ShimmerBar tokens={tokens} widthClass="w-40" heightClass="h-1.5" />
      </div>
    </CardShell>
  )
}

function InstanceSkeleton({ tokens }: SkeletonProps) {
  return (
    <CardShell tokens={tokens}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Smartphone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <ShimmerBar tokens={tokens} widthClass="w-36" />
          <ShimmerBar tokens={tokens} widthClass="w-24" heightClass="h-1.5" />
        </div>
      </div>
      <div
        className="mx-4 mb-3 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5"
        style={{ borderColor: tokens.border }}
      >
        <div
          className="flex h-24 w-24 items-center justify-center rounded-xl"
          style={{
            backgroundColor: tokens.hoverBg,
            color: tokens.textTertiary,
          }}
        >
          <QrCode className="h-10 w-10" />
        </div>
        <ShimmerBar tokens={tokens} widthClass="w-40" heightClass="h-1.5" />
      </div>
    </CardShell>
  )
}

function InstanceListSkeleton({ tokens }: SkeletonProps) {
  return (
    <CardShell tokens={tokens}>
      <div
        className="px-4 py-2.5"
        style={{ backgroundColor: tokens.hoverBg }}
      >
        <ShimmerBar tokens={tokens} widthClass="w-28" heightClass="h-2" />
      </div>
      <div className="divide-y" style={{ borderColor: tokens.divider }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Smartphone
              className="h-4 w-4 shrink-0"
              style={{ color: tokens.textTertiary }}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <ShimmerBar tokens={tokens} widthClass="w-32" heightClass="h-2" />
              <ShimmerBar
                tokens={tokens}
                widthClass="w-20"
                heightClass="h-1.5"
              />
            </div>
            <div
              className="h-4 w-16 rounded-full"
              style={{ backgroundColor: tokens.hoverBg }}
            />
          </div>
        ))}
      </div>
    </CardShell>
  )
}

function ToneSliderSkeleton({ tokens }: SkeletonProps) {
  return (
    <CardShell tokens={tokens}>
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Sliders className="h-4 w-4" />
        </div>
        <ShimmerBar tokens={tokens} widthClass="w-32" />
      </div>
      <div className="space-y-3 px-4 pb-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <ShimmerBar tokens={tokens} widthClass="w-20" heightClass="h-1.5" />
            <ShimmerBar tokens={tokens} widthClass="w-full" heightClass="h-1" />
          </div>
        ))}
      </div>
    </CardShell>
  )
}

function GenericSkeleton({ tokens }: SkeletonProps) {
  return (
    <CardShell tokens={tokens}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            backgroundColor: tokens.hoverBg,
            color: tokens.textTertiary,
          }}
        >
          <Wrench className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <ShimmerBar tokens={tokens} widthClass="w-24" />
          <ShimmerBar
            tokens={tokens}
            widthClass="w-40"
            heightClass="h-1.5"
          />
        </div>
      </div>
    </CardShell>
  )
}

const SKELETON_BY_TOOL: Record<
  string,
  (props: SkeletonProps) => React.JSX.Element
> = {
  create_agent: CreateAgentSkeleton,
  propose_agent_creation: CreateAgentSkeleton,
  create_whatsapp_instance: InstanceSkeleton,
  list_whatsapp_instances: InstanceListSkeleton,
  adjust_prompt_tone: ToneSliderSkeleton,
  generate_prompt_anatomy: GenericSkeleton,
}

/**
 * Returns a streaming skeleton for the given tool, or null if no rich
 * skeleton exists for that tool (in which case the caller should fall
 * back to the collapsible "executando..." view).
 */
export function getStreamingSkeleton(
  toolName: string,
  tokens: AppTokens,
): React.JSX.Element | null {
  const Component = SKELETON_BY_TOOL[toolName]
  if (!Component) return null
  return (
    <div className="animate-pulse">
      <Component tokens={tokens} />
    </div>
  )
}
