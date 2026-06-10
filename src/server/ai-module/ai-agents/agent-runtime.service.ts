/**
 * Agent Runtime Service
 *
 * Core service that executes AI agent responses using Vercel AI SDK.
 * Handles: context building, LLM calling, tool execution loop, cost tracking.
 *
 * Split estrutural (Jun/2026): a implementação vive em `./runtime/*` —
 * este arquivo é a fachada pública que preserva todos os imports existentes
 * (`@/server/ai-module/ai-agents/agent-runtime.service`). Módulos:
 *
 *   - runtime/runtime.types.ts        → tipos públicos + ContextBudgetExhaustedError (US-036/RT-04)
 *   - runtime/context-builders.ts     → histórico, prompt version (A/B), skill registry
 *   - runtime/cost.ts                 → cost table + estimativa de tokens
 *   - runtime/tool-loop.ts            → truncation wrapper + token-budget StopCondition (RT-10)
 *   - runtime/provider-failover.ts    → cooldown Redis (US-043/RT-05) + isRetriableError
 *   - runtime/prepare-agent-call.ts   → setup compartilhado + gates (QH-03 cost cap, QH-05 router, QH-11 hash)
 *   - runtime/runtime-metrics.ts      → métricas fire-and-forget
 *   - runtime/process-message.ts      → runtime sync (webhook WhatsApp)
 *   - runtime/process-message-stream.ts → runtime streaming (Builder chat)
 *   - runtime/playground-stream.ts    → runtime stateless (Playground/preview)
 *   - runtime/summarize-on-close.ts   → resumo de sessão fechada
 *
 * Dependencies (to be installed):
 *   npm install ai @ai-sdk/openai @ai-sdk/anthropic
 */

export {
  ContextBudgetExhaustedError,
  type AgentRuntimeResponse,
  type ProcessAgentMessageParams,
  type AgentStreamEvent,
} from './runtime/runtime.types'

export { processAgentMessage } from './runtime/process-message'

export { processAgentMessageStream } from './runtime/process-message-stream'

export {
  processPlaygroundStream,
  type ProcessPlaygroundStreamParams,
} from './runtime/playground-stream'

export { summarizeSessionOnClose } from './runtime/summarize-on-close'
