/**
 * Quayer Builder — Registration Script
 *
 * Standalone script that seeds the Builder meta-agent (AIAgentConfig) for a
 * given organization. Idempotent: checks for an existing row with the
 * reserved name and exits early if found.
 *
 * Usage (PowerShell / bash):
 *   ORG_ID=<uuid> tsx src/server/ai-module/builder/scripts/register-builder-agent.ts
 *   # or
 *   tsx src/server/ai-module/builder/scripts/register-builder-agent.ts <uuid>
 *
 * Story: US-008 (Wave 2) — Quayer Builder PRD.
 *
 * NOTE: this script is NOT wired into any route and NOT executed automatically.
 * Run it manually per organization when provisioning the Builder. Later stories
 * will add a lazy-init path inside the conversation controller so ops does not
 * need to run this by hand in production.
 */

import { database } from '@/server/services/database'
import {
  BUILDER_AGENT_DEFAULTS,
  BUILDER_RESERVED_NAME,
  BUILDER_SYSTEM_PROMPT,
} from '../builder.constants'

async function main() {
  const organizationId = process.env.ORG_ID ?? process.argv[2]

  if (!organizationId) {
    console.error(
      '[register-builder-agent] Missing organizationId. Pass via ORG_ID env var or CLI arg.',
    )
    process.exit(1)
  }

  console.log(
    `[register-builder-agent] Checking Builder agent for org=${organizationId}...`,
  )

  const existing = await database.aIAgentConfig.findFirst({
    where: {
      organizationId,
      name: BUILDER_RESERVED_NAME,
    },
    select: { id: true, name: true, createdAt: true },
  })

  if (existing) {
    console.log(
      `[register-builder-agent] Already exists. id=${existing.id} created=${existing.createdAt.toISOString()}`,
    )
    await database.$disconnect()
    process.exit(0)
  }

  const created = await database.aIAgentConfig.create({
    data: {
      organizationId,
      // Reserved name: hides the Builder from the user's regular agent list.
      // UI/controllers listing agents MUST filter out BUILDER_RESERVED_NAME.
      name: BUILDER_RESERVED_NAME,
      isActive: true,
      provider: BUILDER_AGENT_DEFAULTS.provider,
      model: BUILDER_AGENT_DEFAULTS.model,
      temperature: BUILDER_AGENT_DEFAULTS.temperature,
      maxTokens: BUILDER_AGENT_DEFAULTS.maxTokens,
      systemPrompt: BUILDER_SYSTEM_PROMPT,
      personality: BUILDER_AGENT_DEFAULTS.personality,
      agentTarget: 'builder',
      agentBehavior: BUILDER_AGENT_DEFAULTS.name,
      useMemory: true,
      memoryWindow: BUILDER_AGENT_DEFAULTS.memoryWindow,
      useRAG: false,
      enabledTools: BUILDER_AGENT_DEFAULTS.enabledTools,
    },
    select: { id: true, name: true, organizationId: true },
  })

  console.log(
    `[register-builder-agent] Created Builder agent. id=${created.id} org=${created.organizationId}`,
  )

  await database.$disconnect()
  process.exit(0)
}

main().catch(async (err) => {
  console.error('[register-builder-agent] Fatal error:', err)
  try {
    await database.$disconnect()
  } catch {
    // ignore
  }
  process.exit(1)
})
