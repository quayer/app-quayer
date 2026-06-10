/**
 * Agent Runtime — context builders
 *
 * Building blocks de montagem de contexto: histórico de conversa (DB →
 * mensagens AI SDK), resolução de prompt version (A/B testing) e registry de
 * skills cacheado por processo. Extraído de `agent-runtime.service.ts` no
 * split estrutural — comportamento idêntico.
 */

import path from 'node:path'
import { database } from '@/server/services/database'
import { normalizeForAI } from '@/server/communication/services/message-normalizer.service'
import {
  loadSkillsFromDirectory,
} from '../services/skill-registry.service'
import {
  type SkillManifest,
} from '../services/skill-activator.service'

// ── Skill Registry (cached) ─────────────────────────────────────────────────
// Carrega `.claude/skills/agent/*.md` uma única vez por processo. Falhas
// (diretório ausente, parse error) viram array vazio para não derrubar o
// agente; o try/catch no call-site complementa.

let cachedSkills: SkillManifest[] | null = null

export async function getRegistrySkills(): Promise<SkillManifest[]> {
  if (cachedSkills) return cachedSkills
  try {
    const skillsDir = path.resolve(process.cwd(), '.claude', 'skills', 'agent')
    cachedSkills = await loadSkillsFromDirectory(skillsDir)
  } catch {
    cachedSkills = []
  }
  return cachedSkills
}

// ── Context Builders ─────────────────────────────────────────────────────────

/**
 * Fetch the most recent messages from the session to build conversation history.
 * Maps message direction to the appropriate AI SDK role.
 */
export async function buildConversationContext(sessionId: string, memoryWindow: number) {
  const messages = await database.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: memoryWindow,
    select: {
      content: true,
      direction: true,
      author: true,
      type: true,
      createdAt: true,
      transcription: true,
      locationName: true,
      latitude: true,
      longitude: true,
      geoAddress: true,
      geoNeighborhood: true,
      geoCity: true,
      geoState: true,
      geoPostalCode: true,
      fileName: true,
      mediaType: true,
    },
  })

  return messages.map((msg) => ({
    role: (msg.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: normalizeForAI(msg),
  }))
}

/**
 * Resolve which prompt version to use for the agent.
 *
 * Priority:
 *   1. A/B test — when two or more prompt versions have status TESTING,
 *      the session ID hash deterministically picks a variant.
 *   2. ACTIVE version — the latest active prompt version.
 *   3. Fallback — returns null so the caller uses the agent's own systemPrompt.
 */
export async function getActivePrompt(agentConfigId: string, sessionId?: string) {
  // Check for A/B test (TESTING versions)
  const testingVersions = await database.agentPromptVersion.findMany({
    where: {
      agentConfigId,
      status: 'TESTING',
    },
    orderBy: { version: 'asc' },
  })

  if (testingVersions.length >= 2 && sessionId) {
    // Deterministic variant assignment based on session ID character code sum
    const hash = sessionId
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const variant = hash % testingVersions.length
    return testingVersions[variant]
  }

  // Default: get the latest ACTIVE version
  const activeVersion = await database.agentPromptVersion.findFirst({
    where: {
      agentConfigId,
      status: 'ACTIVE',
    },
    orderBy: { version: 'desc' },
  })

  return activeVersion ?? null
}
