import type {
  ChatMessage,
  WorkspaceProject,
} from "@/client/components/projetos/types"
import type { Stage } from "../types"
import { TOOL_STAGE_MAP } from "./tool-stage-map"

/**
 * Scans all chat messages for completed tool calls and derives stages.
 * Each unique tool call that succeeded becomes a "done" stage.
 * If the conversation is still active (last message is from user or
 * is streaming), the next expected stage gets "active" status.
 */
export function deriveStagesFromMessages(
  messages: ChatMessage[],
  project: WorkspaceProject,
): Stage[] {
  // Collect all successful tool calls from assistant messages
  const completedTools = new Map<string, { result: unknown; timestamp: string }>()

  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.toolCalls) continue
    for (const tc of msg.toolCalls) {
      // A tool call is "done" if it has a result and the result indicates success
      if (!tc.result) continue
      const r = tc.result as Record<string, unknown>
      // Skip explicitly failed calls
      if (r.success === false) continue

      // For tools that can be called multiple times (attach_tool), keep last
      // For most others, first call is the milestone
      if (!completedTools.has(tc.toolName)) {
        completedTools.set(tc.toolName, { result: tc.result, timestamp: msg.createdAt })
      }
    }
  }

  // Build stages from completed tools, maintaining TOOL_STAGE_MAP order
  const stages: Stage[] = []
  let stageNumber = 1

  for (const mapping of TOOL_STAGE_MAP) {
    const completed = completedTools.get(mapping.toolName)
    if (completed) {
      stages.push({
        number: stageNumber++,
        title: mapping.label,
        status: "done",
        detail: mapping.detailFn?.(completed.result),
      })
    }
  }

  // Also check project state for things that might have happened before
  // this conversation (e.g., agent already existed from a previous session)
  if (!completedTools.has("create_agent") && project.aiAgent) {
    stages.unshift({
      number: 0,
      title: "Agente criado",
      status: "done",
      detail: project.aiAgent.name,
    })
  }

  if (
    !completedTools.has("generate_prompt_anatomy") &&
    !completedTools.has("update_agent_prompt") &&
    project.aiAgent?.systemPrompt &&
    project.aiAgent.systemPrompt.length > 50
  ) {
    // Insert after agent created
    const agentIdx = stages.findIndex((s) => s.title === "Agente criado")
    stages.splice(agentIdx + 1, 0, {
      number: 0,
      title: "Prompt configurado",
      status: "done",
      detail: `${project.aiAgent.systemPrompt.length} caracteres`,
    })
  }

  // Renumber
  stages.forEach((s, i) => {
    s.number = i + 1
  })

  // If there are no stages at all and conversation has messages,
  // show a single "active" stage indicating work is in progress
  if (stages.length === 0 && messages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    if (lastMsg?.role === "user") {
      stages.push({
        number: 1,
        title: "Definindo objetivo",
        status: "active",
      })
    }
  }

  // Mark the last stage's next logical step as "active" if conversation
  // seems ongoing (last message is user or assistant without tool calls)
  if (stages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    const allDone = stages.every((s) => s.status === "done")
    if (allDone && lastMsg?.role === "user") {
      // User just sent something — next step is in progress
      stages.push({
        number: stages.length + 1,
        title: "Processando...",
        status: "active",
      })
    }
  }

  return stages
}
