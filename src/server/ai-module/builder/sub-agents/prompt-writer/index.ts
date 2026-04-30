/**
 * PromptWriter Sub-Agent — Public Barrel
 *
 * Re-exports the concrete sub-agent plus its schema and helper types.
 * The coordinator wires this into the parent `sub-agents/index.ts` barrel
 * in Phase C; we intentionally do NOT modify the parent barrel here.
 */

export {
  promptWriterSubAgent,
  promptWriterInputSchema,
  parsePromptSections,
  type PromptWriterInput,
  type PromptWriterOutput,
  type PromptWriterSections,
  type ParseResult,
} from './prompt-writer.sub-agent'

export {
  SUB_LLM_SYSTEM,
  buildUserMessage,
  type BuildUserMessageInput,
} from './prompt-writer.prompt'
