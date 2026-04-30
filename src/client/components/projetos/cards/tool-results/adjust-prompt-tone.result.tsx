"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useChatActions } from "../../chat/chat-action-context"
import { ToneSliderCard, type ToneValues } from "../tone-slider-card"
import { safeGet } from "./index"

interface AdjustPromptToneResultProps {
  result: unknown
  tokens: AppTokens
}

function bucket(v: number): "baixa" | "média" | "alta" {
  if (v < 0.34) return "baixa"
  if (v < 0.67) return "média"
  return "alta"
}

function humanizeTone(tone: ToneValues): string {
  return [
    `formalidade ${bucket(tone.formality)} (${Math.round(tone.formality * 100)}%)`,
    `energia ${bucket(tone.energy)} (${Math.round(tone.energy * 100)}%)`,
    `emojis ${bucket(tone.emoji)} (${Math.round(tone.emoji * 100)}%)`,
    `detalhe ${bucket(tone.verbosity)} (${Math.round(tone.verbosity * 100)}%)`,
  ].join(", ")
}

/**
 * Adapter for `adjust_prompt_tone`. Renders ToneSliderCard and, on Apply,
 * posts a user message encoding the chosen values so the Builder LLM
 * knows to call update_agent_prompt with a rewritten prompt reflecting
 * the new tone.
 */
export function AdjustPromptToneResult({
  result,
  tokens,
}: AdjustPromptToneResultProps) {
  const actions = useChatActions()
  const [applied, setApplied] = React.useState(false)

  const initialTone =
    safeGet<ToneValues>(result, "initialTone") ?? {
      formality: 0.5,
      energy: 0.5,
      emoji: 0.5,
      verbosity: 0.5,
    }

  const handleApply = React.useCallback(
    (tone: ToneValues) => {
      if (applied || !actions || actions.isStreaming) return
      setApplied(true)
      actions.sendMessage(
        `Ajustar tom do prompt para: ${humanizeTone(tone)}. Re-escreva preservando o conteúdo e as instruções, só mudando o tom.`,
      )
    },
    [actions, applied],
  )

  return (
    <ToneSliderCard
      initialTone={initialTone}
      tokens={tokens}
      onApply={handleApply}
      disabled={applied}
    />
  )
}
