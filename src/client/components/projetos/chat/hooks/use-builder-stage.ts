"use client"

import * as React from "react"

import type { ChatMessage } from "../../types"
import { BUILDER_STAGE_KEYS } from "./builder-stage-defs"

export type BuilderStage = (typeof BUILDER_STAGE_KEYS)[number]

/**
 * Maps the most recent relevant tool call to the canonical Builder stage.
 * The order here is evaluation priority (later items override earlier).
 *
 * We do not parse free-form assistant text — that would be brittle and
 * locale-dependent. Stage is derived strictly from tool call presence.
 */
const STAGE_BY_TOOL: Record<string, BuilderStage> = {
  research_niche: "name",
  propose_agent_creation: "name",
  create_agent: "goal",
  generate_prompt_anatomy: "prompt",
  update_agent_prompt: "prompt",
  attach_tool_to_agent: "tools",
  propose_tool_selection: "tools",
  run_playground_test: "tests",
  select_channel: "channel",
  list_whatsapp_instances: "channel",
  create_whatsapp_instance: "channel",
  instagram_setup_wizard: "channel",
  publish_agent: "deploy",
  get_agent_status: "deploy",
}

/**
 * Canonical ordering of Builder stages. Used to keep the stage indicator
 * monotonically forward — if the user jumps back to edit the prompt,
 * we keep the indicator at the FURTHEST stage reached, not the latest.
 */
const STAGE_ORDER: BuilderStage[] = [...BUILDER_STAGE_KEYS]

interface UseBuilderStageOptions {
  messages: ChatMessage[]
  streamingToolNames?: string[]
}

/**
 * Infers the current Builder stage from message history + any tools
 * currently streaming. Returns null when we cannot detect any stage yet
 * (empty conversation) — caller should hide the indicator in that case.
 */
export function useBuilderStage({
  messages,
  streamingToolNames = [],
}: UseBuilderStageOptions): BuilderStage | null {
  return React.useMemo(() => {
    const toolNames: string[] = []

    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.toolCalls) continue
      for (const tc of msg.toolCalls) {
        if (STAGE_BY_TOOL[tc.toolName]) toolNames.push(tc.toolName)
      }
    }
    for (const name of streamingToolNames) {
      if (STAGE_BY_TOOL[name]) toolNames.push(name)
    }

    if (toolNames.length === 0) return null

    let furthest = -1
    for (const name of toolNames) {
      const stage = STAGE_BY_TOOL[name]
      if (!stage) continue
      const idx = STAGE_ORDER.indexOf(stage)
      if (idx > furthest) furthest = idx
    }

    return furthest >= 0 ? STAGE_ORDER[furthest] ?? null : null
  }, [messages, streamingToolNames])
}
