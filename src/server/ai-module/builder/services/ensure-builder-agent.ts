/**
 * ensureBuilderAgent — lazy-init do meta-agente do Builder por organização.
 *
 * Antes, o agente do Builder precisava ser criado à mão (script
 * register-builder-agent) e o chat retornava 400 "Builder AI not initialized"
 * se ele não existisse. Agora o chat chama esta função, que cria o agente na
 * primeira mensagem (idempotente + race-safe via upsert na unique
 * (organizationId, name)). É o "lazy-init path" que o próprio script previa.
 *
 * Anti-stale (fix homol): o upsert antigo usava `update: {}` e NUNCA atualizava
 * uma row existente — em homol o systemPrompt ficou velho e com o token
 * `{{SKILLS_SUMMARY}}` literal (o template cru, sem `buildResolvedSystemPrompt`).
 * Agora:
 *   1. O prompt fonte é SEMPRE o resolvido por `buildResolvedSystemPrompt()`
 *      (substitui {{SKILLS_SUMMARY}} pelo summary das skills, com cache
 *      in-process — custo ~zero por chamada).
 *   2. Comparamos um sha256 curto do prompt resolvido com o do systemPrompt
 *      persistido; divergiu → UPDATE só do systemPrompt. Hash igual → no-op
 *      (preserva ajustes/contadores da row; nada além do prompt é tocado).
 *
 * Nota: `AIAgentConfig` NÃO tem coluna `metadata` (ver prisma/schema.prisma),
 * então o hash não é persistido — ele é derivado do próprio systemPrompt
 * armazenado, o que detecta drift de forma equivalente sem mudança de schema.
 *
 * O register-builder-agent.ts continua existindo para provisionamento em lote,
 * mas reusa esta mesma lógica.
 */

import { createHash } from 'node:crypto'
import { database } from '@/server/services/database'
import {
  BUILDER_AGENT_DEFAULTS,
  BUILDER_RESERVED_NAME,
} from '../builder.constants'
import { buildResolvedSystemPrompt } from '../chat/handlers/build-system-prompt'

/** sha256 hex curto (16 chars) — suficiente para detectar drift de prompt. */
export function builderPromptHash(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex').slice(0, 16)
}

/**
 * Garante (cria se faltar) o meta-agente do Builder da org com o systemPrompt
 * RESOLVIDO e atualizado. Retorna a row (já refrescada quando havia drift).
 */
export async function ensureBuilderAgent(organizationId: string) {
  const resolvedPrompt = await buildResolvedSystemPrompt()
  const resolvedHash = builderPromptHash(resolvedPrompt)

  const agent = await database.aIAgentConfig.upsert({
    where: {
      organizationId_name: {
        organizationId,
        name: BUILDER_RESERVED_NAME,
      },
    },
    // Já existe → não sobrescreve aqui (preserva ajustes/contadores); o refresh
    // do prompt é decidido abaixo por comparação de hash.
    update: {},
    create: {
      organizationId,
      name: BUILDER_RESERVED_NAME,
      isActive: true,
      provider: BUILDER_AGENT_DEFAULTS.provider,
      model: BUILDER_AGENT_DEFAULTS.model,
      temperature: BUILDER_AGENT_DEFAULTS.temperature,
      maxTokens: BUILDER_AGENT_DEFAULTS.maxTokens,
      systemPrompt: resolvedPrompt,
      personality: BUILDER_AGENT_DEFAULTS.personality,
      agentTarget: 'builder',
      agentBehavior: BUILDER_AGENT_DEFAULTS.name,
      useMemory: true,
      memoryWindow: BUILDER_AGENT_DEFAULTS.memoryWindow,
      useRAG: false,
      enabledTools: BUILDER_AGENT_DEFAULTS.enabledTools,
    },
  })

  // Row recém-criada já carrega o prompt resolvido (hash igual) → no-op.
  const storedHash = agent.systemPrompt
    ? builderPromptHash(agent.systemPrompt)
    : null
  if (storedHash === resolvedHash) return agent

  console.log(
    `[ensureBuilderAgent] systemPrompt stale para org=${organizationId} ` +
      `(stored=${storedHash ?? 'null'} resolved=${resolvedHash}) — atualizando.`,
  )

  return database.aIAgentConfig.update({
    where: { id: agent.id },
    data: { systemPrompt: resolvedPrompt },
  })
}
