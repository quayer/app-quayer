/**
 * Builder Module — Media Curation REPOSITORY (Fase E / E4).
 *
 * A camada de DADOS da curadoria do CATÁLOGO DE MÍDIA enviável pelo agente
 * (foto/vídeo/PDF — NÃO áudio), persistido no modelo de runtime `MediaAsset`
 * (`database.mediaAsset`, tabela `media_assets`). O backend de E1-E3 já criou o
 * model, a rota de UPLOAD (multipart) e a materialização (gallery + pricing);
 * E4 expõe LISTAGEM e curadoria que a ROTA (e o FE da aba "Mídias") consome.
 *
 * Repo FINO — espelha `knowledge-images.repository.ts` (D2): concentra todo o
 * acesso a `database.mediaAsset.*` para manter o route file como orquestrador
 * fino. A ROTA resolve a collection do projeto (loadProject + resolveCollectionId)
 * e passa o `collectionId` já resolvido para `listProjectMedia` — o repository
 * não resolve collection (diferente de D2, onde a resolução por `kb:${projectId}`
 * vivia aqui; em E4 a resolução é responsabilidade da rota, igual ao materialize).
 *
 * INVARIANTES (duras):
 *   - ORG-SCOPED SEMPRE: TODA query filtra por `organizationId`. As mutações usam
 *     `updateMany({ where: { id, organizationId } })` — nunca `update({ where:{ id }})`
 *     — para que um id de outro tenant simplesmente afete 0 linhas (a rota traduz
 *     0 → 404, sem vazar existência). A leitura filtra `organizationId` ALÉM do
 *     `collectionId` (defense-in-depth — a FK já amarra à collection, mas o carimbo
 *     redundante protege contra collectionId de outra org).
 *   - NÃO assina `storageKey`. A geração da signed URL on-read (BUCKETS.MEDIA) é
 *     responsabilidade da ROTA (fail-safe lá; aqui só devolvemos o PATH). Para
 *     `externalUrl` (origem pricing) a rota usa a URL direto, sem assinar.
 *   - deletadas (deletedAt IS NOT NULL) ficam fora de TODAS as leituras/mutações.
 *
 * Cliente tipado `database.mediaAsset` (sem raw). TS strict, zero `any`.
 */

import { database } from '@/server/services/database'

// ---------------------------------------------------------------------------
// Shape retornado para a rota (sem url assinada — a rota assina storageKey
// on-read e/ou usa externalUrl direto). storageKey/externalUrl NÃO viram url
// aqui; isso é decisão da rota (fail-safe). Datas como Date (a rota serializa).
// ---------------------------------------------------------------------------

export interface MediaAssetRow {
  id: string
  mediaType: string // 'image' | 'video' | 'document'
  storageKey: string | null // PATH no BUCKETS.MEDIA; a rota gera signed url on-read
  externalUrl: string | null // URL pública externa (pricing); a rota usa direto
  mimeType: string | null
  caption: string | null
  category: string | null
  source: string // 'upload' | 'gallery' | 'pricing'
  confirmedAt: Date | null // NULL = pendente de curadoria
  createdAt: Date
}

interface MediaAssetLinkRow {
  source: string
  sourceRef: string | null
}

async function findActiveMediaAssetLink(
  mediaId: string,
  organizationId: string,
): Promise<MediaAssetLinkRow | null> {
  return database.mediaAsset.findFirst({
    where: { id: mediaId, organizationId, deletedAt: null },
    select: { source: true, sourceRef: true },
  })
}

async function patchLinkedGalleryImage(
  link: MediaAssetLinkRow | null,
  organizationId: string,
  data: {
    caption?: string | null
    confirmedAt?: Date | null
    deletedAt?: Date
  },
): Promise<void> {
  if (link?.source !== 'gallery' || !link.sourceRef) return
  await database.knowledgeImage.updateMany({
    where: { id: link.sourceRef, organizationId, deletedAt: null },
    data,
  })
}

// ---------------------------------------------------------------------------
// 1) Lista os MediaAsset de UMA collection, deletadas excluídas, org-scoped.
//    A rota já resolveu o collectionId (loadProject + resolveCollectionId) — se
//    o projeto não tem KB, a rota nem chama isto (devolve { media: [] }).
//    Ordena por position asc, depois createdAt asc (estável p/ a grade do FE).
// ---------------------------------------------------------------------------

export async function listProjectMedia(
  collectionId: string,
  organizationId: string,
): Promise<MediaAssetRow[]> {
  // Duplo guard de tenant: org no asset E sua collection. deletadas fora.
  const rows = await database.mediaAsset.findMany({
    where: { collectionId, organizationId, deletedAt: null },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      mediaType: true,
      storageKey: true,
      externalUrl: true,
      mimeType: true,
      caption: true,
      category: true,
      source: true,
      confirmedAt: true,
      createdAt: true,
    },
  })

  return rows
}

// ---------------------------------------------------------------------------
// 2) Soft-delete (deletedAt = now()). org-scoped via updateMany; só afeta
//    deletadas IS NULL (idempotente: re-deletar não conta). 0 → 404 na rota.
// ---------------------------------------------------------------------------

export async function softDelete(
  mediaId: string,
  organizationId: string,
): Promise<number> {
  const link = await findActiveMediaAssetLink(mediaId, organizationId)
  const now = new Date()
  const { count } = await database.mediaAsset.updateMany({
    where: { id: mediaId, organizationId, deletedAt: null },
    data: { deletedAt: now },
  })
  if (count > 0) {
    await patchLinkedGalleryImage(link, organizationId, { deletedAt: now })
  }
  return count
}

// ---------------------------------------------------------------------------
// 3) Confirma/desconfirma um asset (confirmedAt = now() | null). org-scoped via
//    updateMany, só sobre deletadas IS NULL. 0 → 404 na rota. O runtime só envia
//    mídia com confirmedAt IS NOT NULL — confirmar = liberar para o agente.
// ---------------------------------------------------------------------------

export async function setConfirmed(
  mediaId: string,
  confirmed: boolean,
  organizationId: string,
): Promise<number> {
  const link = await findActiveMediaAssetLink(mediaId, organizationId)
  const confirmedAt = confirmed ? new Date() : null
  const { count } = await database.mediaAsset.updateMany({
    where: { id: mediaId, organizationId, deletedAt: null },
    data: { confirmedAt },
  })
  if (count > 0) {
    await patchLinkedGalleryImage(link, organizationId, { confirmedAt })
  }
  return count
}

// ---------------------------------------------------------------------------
// 4) Edita a legenda (curadoria). org-scoped via updateMany; só sobre deletadas
//    IS NULL. Legenda vazia/whitespace → NULL (não persiste string em branco).
//    Retorna a contagem afetada (0 = não encontrada/sem acesso → rota 404).
// ---------------------------------------------------------------------------

export async function patchCaption(
  mediaId: string,
  caption: string,
  organizationId: string,
): Promise<number> {
  const trimmed = caption.trim()
  const nextCaption = trimmed.length > 0 ? trimmed : null
  const link = await findActiveMediaAssetLink(mediaId, organizationId)
  const { count } = await database.mediaAsset.updateMany({
    where: { id: mediaId, organizationId, deletedAt: null },
    data: { caption: nextCaption },
  })
  if (count > 0) {
    await patchLinkedGalleryImage(link, organizationId, { caption: nextCaption })
  }
  return count
}

// ---------------------------------------------------------------------------
// Export agrupado (mesmo estilo de re-uso dos route files / D2).
// ---------------------------------------------------------------------------

export const mediaCurationRepository = {
  listProjectMedia,
  softDelete,
  setConfirmed,
  patchCaption,
}
