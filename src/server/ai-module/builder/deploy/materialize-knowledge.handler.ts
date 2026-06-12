/**
 * materializeKnowledge handler — passo "materialize_knowledge" da saga de deploy
 * (Onda 4 / risco 7 / FR-13).
 *
 * GARANTE o vínculo da base de conhecimento (`AIAgentConfig.ragCollectionId` +
 * `useRAG=true`) quando o projeto JÁ tem uma `KnowledgeCollection` `kb:${projectId}`.
 * Na jornada v2 a fonte é colada na fase "Conhecer" ANTES de o agente existir
 * (o review final cria o agente depois), então o único write histórico de `ragCollectionId`
 * (em `wireCollectionToProject`, que só roda `if (project.aiAgentId)`) NÃO acontece
 * no momento da ingestão — o agente publicado nasceria SEM RAG (gate do runtime em
 * `prepare-agent-call.ts:208`).
 *
 * REDE DUPLA com o backfill do `create_agent` (create-agent.tool.ts:~147): aquele
 * liga no nascimento do agente; este RE-CONFIRMA no deploy. É idempotente — quando
 * o agente já aponta para a collection com `useRAG=true`, não escreve nada (zero
 * UPDATE). Espelha a folha-de-saga dos demais materialize handlers (pricing/team/
 * media): READ fail-open de conteúdo, mas PODE lançar em falha de DB de ESCRITA para
 * acionar o rollback como os outros steps.
 *
 * RESOLUÇÃO DA COLLECTION: o `DeployContext` NÃO carrega collectionId. Resolve via
 * `metadata.knowledgeCollectionId` (verificando que existe e está ativa) com fallback
 * para o nome determinístico `kb:${projectId}` (mesma busca do `create_agent`). Sem
 * collection (projeto sem KB) → no-op limpo (`linked=false`), sem derrubar a saga.
 *
 * Toca tabelas:
 *   - AIAgentConfig    (UPDATE ragCollectionId + useRAG — só quando precisa)
 *   - (READ) builder_projects, knowledge_collections
 *
 * REGRAS: TS strict, zero `any`; tudo org-scoped por `ctx.organizationId`;
 * idempotente (rodar 2x converge ao mesmo estado).
 */

import { database } from '@/server/services/database'
import { collectionNameFor, metaCollectionId } from '../knowledge/knowledge-helpers'
import type { DeployContext } from './deploy.contract'

// ==========================================
// Resultado do step
// ==========================================

/** Resultado do step — payload descritivo (compatível com a saga). */
export interface MaterializeKnowledgeResult {
  /** Collection alvo (kb:${projectId}) ou null quando o projeto ainda não tem KB. */
  collectionId: string | null
  /** true quando o agente ficou (ou já estava) vinculado à collection com useRAG. */
  linked: boolean
}

// ==========================================
// materializeKnowledge (folha da saga)
// ==========================================

/**
 * Resolve a `KnowledgeCollection` do projeto SEM depender do vínculo do agente:
 * prefere `metadata.knowledgeCollectionId` (verificando existência + ativa na org) e
 * cai para a busca por nome determinístico `kb:${projectId}` (espelha o create_agent).
 * Retorna `null` quando o projeto ainda não tem base de conhecimento.
 */
async function resolveProjectCollectionId(
  projectId: string,
  organizationId: string,
  metadata: unknown,
): Promise<string | null> {
  const fromMeta = metaCollectionId(metadata)
  if (fromMeta) {
    const exists = await database.knowledgeCollection.findFirst({
      where: { id: fromMeta, organizationId, isActive: true },
      select: { id: true },
    })
    if (exists) return exists.id
  }

  const byName = await database.knowledgeCollection.findFirst({
    where: { organizationId, name: collectionNameFor(projectId), isActive: true },
    select: { id: true },
  })
  return byName?.id ?? null
}

/**
 * materializeKnowledge — garante `ragCollectionId` + `useRAG` no agente quando o
 * projeto tem uma collection de conhecimento. Idempotente e org-scoped.
 *
 * Resolve a collection do projeto; se ausente, retorna no-op (`linked=false`). Caso
 * contrário, só escreve no agente quando o vínculo ainda não está completo (collection
 * diferente OU `useRAG=false`) — assim re-rodar a saga não gera UPDATE redundante.
 *
 * PODE lançar em falha de DB de ESCRITA para acionar o rollback como os demais steps.
 */
export async function materializeKnowledge(
  ctx: DeployContext,
): Promise<MaterializeKnowledgeResult> {
  // 1. Carrega o projeto org-scoped (metadata p/ resolver a collection). Sem projeto
  //    => no-op (o orchestrator já validou existência, mas mantemos a defesa).
  const project = await database.builderProject.findFirst({
    where: { id: ctx.projectId, organizationId: ctx.organizationId },
    select: { metadata: true },
  })
  if (!project) return { collectionId: null, linked: false }

  // 2. Resolve a collection do projeto (independente do vínculo do agente). Sem KB
  //    ainda => nada a vincular: no-op limpo, sem derrubar a saga.
  const collectionId = await resolveProjectCollectionId(
    ctx.projectId,
    ctx.organizationId,
    project.metadata,
  )
  if (!collectionId) return { collectionId: null, linked: false }

  // 3. Lê o estado atual do agente (org-scoped). Se já aponta para ESTA collection com
  //    useRAG=true, o vínculo está completo → zero UPDATE (idempotência / rede dupla
  //    com o backfill do create_agent).
  const agent = await database.aIAgentConfig.findFirst({
    where: { id: ctx.aiAgentId, organizationId: ctx.organizationId },
    select: { ragCollectionId: true, useRAG: true },
  })
  if (!agent) return { collectionId, linked: false }

  const alreadyLinked = agent.ragCollectionId === collectionId && agent.useRAG
  if (!alreadyLinked) {
    await database.aIAgentConfig.update({
      where: { id: ctx.aiAgentId },
      data: { ragCollectionId: collectionId, useRAG: true },
    })
  }

  return { collectionId, linked: true }
}

// ==========================================
// compensateMaterializeKnowledge (rollback)
// ==========================================

/**
 * compensateMaterializeKnowledge — compensação no rollback da saga.
 *
 * NO-OP idempotente, IDÊNTICO a `compensateMaterializePricing`/`Team`/`Media`: o
 * vínculo da base de conhecimento reflete uma configuração do USUÁRIO (colou a fonte),
 * não é "lixo de deploy", e o backfill do `create_agent` já o teria criado na fase 2.
 * A materialização é reversível pela própria idempotência no próximo deploy, então a
 * compensação correta é não desfazer nada. `void ctx` evita lint de parâmetro não
 * usado mantendo a assinatura do contrato de compensação. Nunca lança.
 */
export async function compensateMaterializeKnowledge(
  ctx: DeployContext,
): Promise<void> {
  void ctx
}
