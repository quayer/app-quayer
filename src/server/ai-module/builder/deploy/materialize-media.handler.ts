/**
 * materializeMedia handler — step "materialize_media" da saga de deploy (E2 / Fase E).
 *
 * Materializa o CATÁLOGO DE MÍDIA enviável pelo agente (foto/vídeo/PDF — NÃO áudio)
 * no modelo de RUNTIME `MediaAsset`, para que a tool de retrieval `buscar_media` (E3)
 * devolva URLs REAIS ao LLM e o pipeline OUTBOUND existente (tag-parser → uazapi-sender)
 * faça o envio. Este step NUNCA envia mídia — só faz a I/O do plano calculado pelo
 * helper PURO `media-reconcile`.
 *
 * Espelho EXATO de `materialize-pricing.handler.ts` (M2) e `materialize-team.handler.ts`
 * (M1): o helper PURO decide o plano (sanitização + reconciliação), o handler faz a I/O.
 *
 * DUAS origens materializadas na collection do projeto (kb:${projectId}):
 *   1. GALLERY — `KnowledgeImage` CONFIRMADAS (Onda D) da collection do projeto →
 *      source='gallery', sourceRef=image.id, mediaType='image', storageKey=image.storageKey
 *      (assina on-read; nunca persiste URL).
 *   2. PRICING — `PriceItem.imageUrl` (M2) da PriceList `pricing:${projectId}` →
 *      source='pricing', sourceRef=item.id, mediaType='image', externalUrl=item.imageUrl
 *      (URL externa https válida; usada direto). A legenda é o NOME do serviço.
 *
 * Idempotência: upsert por @@unique([source, sourceRef]) (GLOBAL, não por collection).
 * Re-rodar converge ao mesmo estado: reativa (deletedAt=null) os que voltaram, reescreve
 * os campos mutáveis e DESATIVA (soft, deletedAt=now()) os que sumiram do desired. NUNCA
 * toca source='upload' (uploads são do usuário, fora do controle do materialize) nem
 * hard-delete (preserva histórico, reversível).
 *
 * RESOLUÇÃO DA COLLECTION: o `DeployContext` NÃO carrega collectionId. Resolve via
 * `loadProject` + `resolveCollectionId` (knowledge-helpers). Se `null` (projeto sem KB
 * ainda) → não há collection alvo (a FK de MediaAsset é NOT NULL), logo nada a
 * materializar de gallery NEM de pricing — degrada para no-op limpo, sem derrubar a saga.
 *
 * Folha da saga (sem editar nada existente além dos couplings do orchestrator/contract/
 * rollback, feitos em outra fatia). PODE lançar em falha de DB de ESCRITA (upserts /
 * desativação) para acionar o rollback como os demais steps. Os READs degradam (fail-open
 * por origem: falha ao ler gallery/pricing não impede materializar a outra origem).
 *
 * Toca tabelas:
 *   - media_assets   (UPSERT por @@unique([source, sourceRef]) + soft-deactivate)
 *   - (READ) knowledge_images, price_lists, price_items
 *
 * REGRAS: TS strict, zero `any`; tudo org-scoped por `ctx.organizationId`;
 * idempotente (rodar 2x converge ao mesmo estado).
 */

import { database } from '@/server/services/database'
import { loadProject, resolveCollectionId } from '../knowledge/knowledge-helpers'
import {
  reconcileMediaAssets,
  sanitizeGalleryAssets,
  sanitizePricingAssets,
  type DesiredMediaAsset,
  type ExistingMediaRow,
} from './media-reconcile'
import type { DeployContext } from './deploy.contract'

// ==========================================
// Resultado do step
// ==========================================

/** Resultado do step — payload descritivo (compatível com `runStep`). */
export interface MaterializeMediaResult {
  /** Collection alvo (kb:${projectId}) ou null quando o projeto ainda não tem KB. */
  collectionId: string | null
  /** Quantos itens foram inseridos/atualizados (gallery + pricing). */
  upserted: number
  /** Quantos itens órfãos (gallery/pricing) foram desativados (soft). */
  deactivated: number
}

// ==========================================
// materializeMedia (folha da saga)
// ==========================================

/**
 * materializeMedia — materializa o catálogo de mídia (galeria + fotos de preço) no
 * modelo de runtime `MediaAsset`. Idempotente e org-scoped.
 *
 * Resolve a collection do projeto; se ausente, retorna no-op (collectionId=null) sem
 * desativar nada (não há alvo onde reconciliar). Caso contrário, calcula o conjunto
 * DESEJADO a partir das `KnowledgeImage` confirmadas e dos `PriceItem.imageUrl`, faz
 * o upsert por (source, sourceRef) e desativa (soft) os órfãos via o plano PURO de
 * `reconcileMediaAssets`.
 *
 * PODE lançar em falha de DB de ESCRITA para acionar o rollback como os demais steps.
 */
export async function materializeMedia(
  ctx: DeployContext,
): Promise<MaterializeMediaResult> {
  // 1. Resolve a collection do projeto (o ctx não carrega collectionId). Sem KB ainda
  //    => sem alvo (FK NOT NULL): nada a materializar e nada a desativar — no-op limpo.
  const project = await loadProject(ctx.projectId, ctx.organizationId)
  if (!project) return { collectionId: null, upserted: 0, deactivated: 0 }

  const collectionId = await resolveCollectionId(project, ctx.organizationId)
  if (!collectionId) return { collectionId: null, upserted: 0, deactivated: 0 }

  // 2. Monta o conjunto DESEJADO das DUAS origens (gallery + pricing). A I/O de read é
  //    fail-open POR ORIGEM: uma falha ao ler a galeria não impede materializar o
  //    pricing e vice-versa (degrada sem derrubar a saga; a reconciliação seguinte
  //    corrige). A I/O de WRITE abaixo é que pode lançar.
  const desired: DesiredMediaAsset[] = [
    ...(await loadGalleryDesired(collectionId, ctx.organizationId)),
    ...(await loadPricingDesired(ctx.projectId, ctx.organizationId)),
  ]

  // 3. Upsert por @@unique([source, sourceRef]) (GLOBAL). Para cada desired:
  //    - create: carimba collectionId, organizationId, confirmedAt=now, position.
  //    - update: reescreve campos mutáveis, RE-ATIVA (deletedAt=null) se voltou, e
  //      preserva confirmedAt existente (coalesce) — materializado é intencional →
  //      visível ao runtime desde a criação.
  let upserted = 0
  for (let i = 0; i < desired.length; i += 1) {
    const item = desired[i]
    await database.mediaAsset.upsert({
      where: {
        source_sourceRef: { source: item.source, sourceRef: item.sourceRef },
      },
      create: {
        organizationId: ctx.organizationId,
        collectionId,
        mediaType: item.mediaType,
        storageKey: item.storageKey,
        externalUrl: item.externalUrl,
        mimeType: item.mimeType,
        caption: item.caption,
        tags: [],
        category: item.category,
        source: item.source,
        sourceRef: item.sourceRef,
        sizeBytes: item.sizeBytes,
        position: i,
        confirmedAt: new Date(),
      },
      update: {
        // Re-aponta a collection (ex.: o projeto migrou de KB) + reescreve mutáveis.
        collectionId,
        mediaType: item.mediaType,
        storageKey: item.storageKey,
        externalUrl: item.externalUrl,
        mimeType: item.mimeType,
        caption: item.caption,
        category: item.category,
        sizeBytes: item.sizeBytes,
        position: i,
        // Re-ativa se tinha sido desativado num deploy anterior (item voltou).
        deletedAt: null,
        // confirmedAt: NÃO sobrescreve (o `update` sem o campo preserva o existente).
        // Se o registro nasceu via materialize/upload ele já está confirmado; manter.
      },
    })
    upserted += 1
  }

  // 4. Reconciliação (soft) das origens CONTROLADAS pelo materialize (gallery+pricing)
  //    DESTA collection: lê os ativos do DB, calcula o que sumiu do desired via o plano
  //    PURO `reconcileMediaAssets` e desativa (deletedAt=now()). NUNCA toca
  //    source='upload' (escopo do `where` já exclui) nem hard-delete.
  const existingRows = await database.mediaAsset.findMany({
    where: {
      collectionId,
      organizationId: ctx.organizationId,
      source: { in: ['gallery', 'pricing'] },
      deletedAt: null,
    },
    select: { id: true, source: true, sourceRef: true },
  })
  const existing: ExistingMediaRow[] = existingRows.map((r) => ({
    id: r.id,
    source: r.source,
    sourceRef: r.sourceRef,
  }))

  const plan = reconcileMediaAssets(existing, desired)

  let deactivated = 0
  if (plan.toDeactivate.length > 0) {
    const now = new Date()
    // updateMany org/collection-scoped: desativa só os ids do plano que ainda estão
    // ativos (deletedAt:null no where evita write no-op e conta certo).
    const result = await database.mediaAsset.updateMany({
      where: {
        id: { in: plan.toDeactivate },
        collectionId,
        organizationId: ctx.organizationId,
        deletedAt: null,
      },
      data: { deletedAt: now },
    })
    deactivated = result.count
  }

  // 5. Habilita a tool `buscar_media` no agente (idempotente, org-scoped). Sem ela no
  //    enabledTools, o guia de mídia NÃO instrui a buscá-la (ver renderWhatsAppMediaGuide)
  //    e o catálogo fica inerte. Habilitamos SEMPRE no deploy — assim uploads pós-deploy
  //    já funcionam; catálogo vazio só faz `buscar_media` retornar nada → o guia cai no
  //    fallback de texto. `push` é idempotente aqui porque guardamos com o includes.
  if (ctx.aiAgentId) {
    const agent = await database.aIAgentConfig.findFirst({
      where: { id: ctx.aiAgentId, organizationId: ctx.organizationId },
      select: { enabledTools: true },
    })
    if (agent && !agent.enabledTools.includes('buscar_media')) {
      await database.aIAgentConfig.update({
        where: { id: ctx.aiAgentId },
        data: { enabledTools: { push: 'buscar_media' } },
      })
    }
  }

  return { collectionId, upserted, deactivated }
}

// ==========================================
// Reads das DUAS origens (fail-open por origem)
// ==========================================

/**
 * GALLERY — lê as `KnowledgeImage` CONFIRMADAS (Onda D) da collection do projeto e
 * delega a normalização ao helper PURO `sanitizeGalleryAssets` (descarta imagens sem
 * storageKey; storageKey assina on-read; externalUrl=null; category=null).
 *
 * Fail-open: erro de DB no read degrada para `[]` (a outra origem ainda materializa;
 * melhor não materializar do que materializar lixo). "Sem imagens" também retorna `[]`
 * legitimamente — nesse caso a reconciliação desativa os assets gallery que sumiram.
 */
async function loadGalleryDesired(
  collectionId: string,
  organizationId: string,
): Promise<DesiredMediaAsset[]> {
  try {
    const images = await database.knowledgeImage.findMany({
      where: {
        organizationId,
        collectionId,
        confirmedAt: { not: null },
        deletedAt: null,
      },
      select: {
        id: true,
        storageKey: true,
        mimeType: true,
        caption: true,
        sizeBytes: true,
      },
      orderBy: { createdAt: 'asc' },
    })
    // Sanitização (descarta sem storageKey, trima caption/mime, etc.) no helper PURO.
    return sanitizeGalleryAssets(images)
  } catch (error) {
    console.warn(
      '[deploy/materialize_media] falha ao ler galeria (KnowledgeImage) — pulando origem gallery (degradando):',
      error,
    )
    return []
  }
}

/**
 * PRICING — resolve a PriceList `pricing:${projectId}` ORG-SCOPED (PriceItem não tem
 * organizationId — chega via PriceList), lê os itens ativos com foto e delega a
 * normalização ao helper PURO `sanitizePricingAssets` (só sobrevive item com `imageUrl`
 * https válida; externalUrl=imageUrl, caption=name (legenda = nome do serviço)).
 *
 * Fail-open: erro de DB no read degrada para `[]` (a galeria ainda materializa).
 */
async function loadPricingDesired(
  projectId: string,
  organizationId: string,
): Promise<DesiredMediaAsset[]> {
  try {
    const listName = `pricing:${projectId}`
    const list = await database.priceList.findFirst({
      where: { organizationId, name: listName },
      select: { id: true },
    })
    if (!list) return []

    const items = await database.priceItem.findMany({
      where: { priceListId: list.id, isActive: true, imageUrl: { not: null } },
      select: { id: true, name: true, imageUrl: true, category: true },
    })
    // Sanitização (https válida; legenda=nome; descarta URL inválida) no helper PURO.
    return sanitizePricingAssets(items)
  } catch (error) {
    console.warn(
      '[deploy/materialize_media] falha ao ler pricing (PriceItem.imageUrl) — pulando origem pricing (degradando):',
      error,
    )
    return []
  }
}

// ==========================================
// compensateMaterializeMedia (rollback)
// ==========================================

/**
 * compensateMaterializeMedia — compensação no rollback da saga.
 *
 * NO-OP idempotente, IDÊNTICO a `compensateMaterializePricing`/`compensateMaterializeTeam`:
 * o catálogo de mídia reflete o que o USUÁRIO configurou (galeria + fotos de preço), não
 * é "lixo de deploy". A materialização é reversível pela própria reconciliação no próximo
 * deploy, então a compensação correta é não desfazer nada. `void ctx` evita lint de
 * parâmetro não usado mantendo a assinatura do contrato de compensação. Nunca lança.
 */
export async function compensateMaterializeMedia(
  ctx: DeployContext,
): Promise<void> {
  void ctx
}
