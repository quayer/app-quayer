"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { CreateAgentResult } from "./create-agent.result"
import { AttachToolResult } from "./attach-tool.result"
import {
  CreateInstanceResult,
  ListInstancesResult,
} from "./create-instance.result"
import {
  PublishAgentSuccessResult,
  PublishAgentBlockersResult,
} from "./publish-agent.result"
import { RunPlaygroundResult } from "./run-playground.result"
import { SearchWebResult } from "./search-web.result"
import { UpdatePromptResult } from "./update-prompt.result"
import { SelectChannelResult } from "./select-channel.result"
import { ProposeAgentCreationResult } from "./propose-agent-creation.result"
import { GeneratePromptResult } from "./generate-prompt.result"
import { RunPromptPreviewResult } from "./run-prompt-preview.result"
import { AdjustPromptToneResult } from "./adjust-prompt-tone.result"
import { ProposeToolSelectionResult } from "./propose-tool-selection.result"
import { ProposePlanUpgradeResult } from "./propose-plan-upgrade.result"
import { InstagramSetupWizardResult } from "./instagram-setup-wizard.result"
import { FallbackResultCard, GenericErrorCard } from "./fallback.result"

// ---------------------------------------------------------------------------
// Shared helpers (also consumed by individual *.result.tsx files)
// ---------------------------------------------------------------------------

export function safeGet<T = unknown>(
  obj: unknown,
  key: string,
): T | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    return (obj as Record<string, unknown>)[key] as T
  }
  return undefined
}

export function isSuccess(result: unknown): boolean {
  return safeGet<boolean>(result, "success") === true
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

interface ToolResultCardProps {
  toolName: string
  args: unknown
  result: unknown
  tokens: AppTokens
}

/**
 * ToolResultCard — smart dispatcher that renders rich UI cards based on
 * the toolName and its result payload. Falls back to a clean JSON view
 * for unknown tools.
 */
export function ToolResultCard({
  toolName,
  args,
  result,
  tokens,
}: ToolResultCardProps) {
  if (toolName === "create_agent" && isSuccess(result)) {
    return <CreateAgentResult args={args} result={result} tokens={tokens} />
  }

  if (toolName === "list_whatsapp_instances" && isSuccess(result)) {
    return <ListInstancesResult result={result} tokens={tokens} />
  }

  if (toolName === "create_whatsapp_instance" && isSuccess(result)) {
    return <CreateInstanceResult args={args} result={result} tokens={tokens} />
  }

  if (toolName === "generate_prompt_anatomy" && isSuccess(result)) {
    return <GeneratePromptResult result={result} tokens={tokens} />
  }

  if (toolName === "publish_agent" && isSuccess(result)) {
    return <PublishAgentSuccessResult result={result} tokens={tokens} />
  }

  if (
    toolName === "publish_agent" &&
    !isSuccess(result) &&
    safeGet(result, "blockers")
  ) {
    return <PublishAgentBlockersResult result={result} tokens={tokens} />
  }

  if (toolName === "get_agent_status" && isSuccess(result)) {
    return <RunPlaygroundResult result={result} tokens={tokens} />
  }

  if (toolName === "attach_tool_to_agent" && isSuccess(result)) {
    return <AttachToolResult result={result} tokens={tokens} />
  }

  if (toolName === "update_agent_prompt" && isSuccess(result)) {
    return <UpdatePromptResult result={result} tokens={tokens} />
  }

  if (toolName === "select_channel" && isSuccess(result)) {
    return <SelectChannelResult result={result} tokens={tokens} />
  }

  if (toolName === "propose_agent_creation" && isSuccess(result)) {
    return <ProposeAgentCreationResult result={result} tokens={tokens} />
  }

  if (toolName === "run_prompt_preview" && isSuccess(result)) {
    return <RunPromptPreviewResult result={result} tokens={tokens} />
  }

  if (toolName === "adjust_prompt_tone" && isSuccess(result)) {
    return <AdjustPromptToneResult result={result} tokens={tokens} />
  }

  if (toolName === "propose_tool_selection" && isSuccess(result)) {
    return <ProposeToolSelectionResult result={result} tokens={tokens} />
  }

  if (toolName === "propose_plan_upgrade" && isSuccess(result)) {
    return <ProposePlanUpgradeResult result={result} tokens={tokens} />
  }

  if (toolName === "instagram_setup_wizard" && isSuccess(result)) {
    return <InstagramSetupWizardResult result={result} tokens={tokens} />
  }

  if (result !== undefined && !isSuccess(result)) {
    return (
      <GenericErrorCard
        toolName={toolName}
        message={safeGet<string>(result, "message") ?? "Erro desconhecido"}
        result={result}
        tokens={tokens}
      />
    )
  }

  return (
    <FallbackResultCard
      toolName={toolName}
      args={args}
      result={result}
      tokens={tokens}
    />
  )
}
