import { splitMessage } from './message-splitter.service'
import type { MessageBlock } from './message-splitter.service'
import { getSender } from './senders/sender-factory'
import type { SendResult } from './senders/sender.interface'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutgoingPipelineParams {
  /** Recipient number/id (e.g. "5511999999999@s.whatsapp.net") */
  to: string
  /** Connection instance id (or phone_number_id for Cloud API) */
  instanceId: string
  /** Broker type: 'uazapi' | 'cloudapi' | 'instagram' */
  brokerType: string
  /** Raw AI response containing Format Tags */
  text: string
  /** API token for the connection */
  token?: string
}

export interface OutgoingPipelineResult {
  blocks: number
  sent: number
  failed: number
  results: SendResult[]
}

// ---------------------------------------------------------------------------
// Feature → block type mapping (for fallback check)
// ---------------------------------------------------------------------------

const BLOCK_FEATURE_MAP: Partial<Record<MessageBlock['type'], 'buttons' | 'list' | 'carousel' | 'cta' | 'flow'>> = {
  buttons: 'buttons',
  list: 'list',
  cta: 'cta',
}

/**
 * Convert a rich block to a plain text fallback when the sender does not
 * support the block's feature.
 */
function blockToTextFallback(block: MessageBlock): MessageBlock {
  switch (block.type) {
    case 'buttons': {
      const options = block.buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n')
      return { type: 'text', content: `${block.body}\n\n${options}` }
    }

    case 'list': {
      const sections = block.sections
        .map((s) => {
          const items = s.items.map((i) => `- ${i.title}`).join('\n')
          return `*${s.title}*\n${items}`
        })
        .join('\n\n')
      return { type: 'text', content: `${block.body}\n\n${sections}` }
    }

    case 'cta':
      return { type: 'text', content: `${block.body}\n\n${block.buttonText}: ${block.url}` }

    default:
      // No fallback needed for other types
      return block
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Split an AI response into typed blocks and send each one in order through
 * the appropriate broker sender.
 *
 * 1. `splitMessage(text)` -> MessageBlock[]
 * 2. `getSender(brokerType)` -> TypedSender
 * 3. For each block: check feature support, fallback if needed, send
 * 4. Return aggregate result
 */
export async function sendAgentResponse(params: OutgoingPipelineParams): Promise<OutgoingPipelineResult> {
  const { to, instanceId, brokerType, text, token } = params

  // 1. Parse format tags into blocks
  const blocks = splitMessage(text)

  if (blocks.length === 0) {
    return { blocks: 0, sent: 0, failed: 0, results: [] }
  }

  // 2. Get the appropriate sender
  const sender = getSender(brokerType)

  // 3. Send each block sequentially
  const results: SendResult[] = []
  let sent = 0
  let failed = 0

  for (const rawBlock of blocks) {
    // Check if sender supports this block's feature
    const requiredFeature = BLOCK_FEATURE_MAP[rawBlock.type]
    const block =
      requiredFeature && !sender.supportsFeature(requiredFeature)
        ? blockToTextFallback(rawBlock)
        : rawBlock

    try {
      const result = await sender.sendBlock({ to, instanceId, block, token })
      results.push(result)

      if (result.success) {
        sent++
      } else {
        failed++
        console.warn(`[outgoing-pipeline] Block send failed: ${result.error}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      failed++
      results.push({ messageId: '', success: false, error: msg })
      console.error(`[outgoing-pipeline] Unexpected error sending block: ${msg}`)
    }
  }

  return { blocks: blocks.length, sent, failed, results }
}
