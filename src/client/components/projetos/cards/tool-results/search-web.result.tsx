"use client"

import * as React from "react"
import { FileText } from "lucide-react"

import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { safeGet } from "./index"

interface SearchWebResultProps {
  result: unknown
  tokens: AppTokens
}

/**
 * Adapter for the `generate_prompt_anatomy` / search-web tool results.
 * Renders the generated prompt preview with expand/collapse.
 */
export function SearchWebResult({ result, tokens }: SearchWebResultProps) {
  const prompt = safeGet<string>(result, "prompt") ?? ""
  return <PromptPreviewCard prompt={prompt} tokens={tokens} />
}

function PromptPreviewCard({
  prompt,
  tokens,
}: {
  prompt: string
  tokens: AppTokens
}) {
  const [expanded, setExpanded] = React.useState(false)
  const preview =
    prompt.length > 300 && !expanded ? prompt.slice(0, 300) + "..." : prompt

  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.brandBorder,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ backgroundColor: tokens.brandSubtle }}
        >
          <FileText className="h-4 w-4" style={{ color: tokens.brand }} />
          <p
            className="text-[12px] font-semibold"
            style={{ color: tokens.brandText }}
          >
            Prompt gerado
          </p>
        </div>
        <div className="px-4 py-3">
          <pre
            className="whitespace-pre-wrap break-words text-[12px] leading-relaxed"
            style={{ color: tokens.textSecondary }}
          >
            {preview}
          </pre>
          {prompt.length > 300 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-[11px] font-medium"
              style={{ color: tokens.brandText }}
            >
              {expanded ? "Ver menos" : "Ver prompt completo"}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
