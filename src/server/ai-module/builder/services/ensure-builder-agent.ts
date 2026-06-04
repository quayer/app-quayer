/**
 * ensureBuilderAgent — lazy-init do meta-agente do Builder por organização.
 *
 * Antes, o agente do Builder precisava ser criado à mão (script
 * register-builder-agent) e o chat retornava 400 "Builder AI not initialized"
 * se ele não existisse. Agora o chat chama esta função, que cria o agente na
 * primeira mensagem (idempotente + race-safe via upsert na unique
 * (organizationId, name)). É o "lazy-init path" que o próprio script previa.
 *
 * O register-builder-agent.ts continua existindo para provisionamento em lote,
 * mas reusa esta mesma lógica.
 */

import { database } from '@/server/services/database'
import {
  BUILDER_AGENT_DEFAULTS,
  BUILDER_RESERVED_NAME,
  BUILDER_SYSTEM_PROMPT,
} from '../builder.constants'

/** Garante (cria se faltar) o meta-agente do Builder da org. Retorna a row. */
export async function ensureBuilderAgent(organizationId: string) {
  return database.aIAgentConfig.upsert({
    where: {
      organizationId_name: {
        organizationId,
        name: BUILDER_RESERVED_NAME,
      },
    },
    // Já existe → não sobrescreve (preserva ajustes/contadores).
    update: {},
    create: {
      organizationId,
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
  })
}
