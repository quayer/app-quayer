"use client"

import type { ReactNode } from "react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  const { tokens } = useAppTokens()

  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border p-10 text-center"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
      }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{
          backgroundColor: tokens.bgElevated,
          color: tokens.brand,
        }}
      >
        {icon}
      </div>
      <h3
        className="text-sm font-medium"
        style={{ color: tokens.textPrimary }}
      >
        {title}
      </h3>
      <p
        className="max-w-xs text-xs"
        style={{ color: tokens.textTertiary }}
      >
        {description}
      </p>
    </div>
  )
}
