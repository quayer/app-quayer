/**
 * Builder Module — Knowledge Images REPOSITORY (Onda D2, curadoria/G2).
 *
 * A camada de DADOS da curadoria do catálogo visual. D1 (image-pipeline.ts) já
 * extraiu, validou e persistiu as imagens em `knowledge_images` (model tipado
 * `database.knowledgeImage`). D2 expõe as operações de leitura e curadoria que a
 * ROTA (e, mais tarde, o FE de D3) consome.
 *
 * INVARIANTES (duras):
 *   - ORG-SCOPED SEMPRE: TODA query filtra por `organizationId`. As mutações usam
 *     `updateMany({ where: { id, organizationId } })` — nunca `update({ where:{ id }})`
 *     — para que um id de outro tenant simplesmente afete 0 linhas (a rota traduz
 *     0 → 404, sem vazar existência).
 *   - Resolve a collection do projeto por `name = kb:${projectId}` (unique org+name).
 *     NUNCA cria a collection numa leitura: se ela ainda não existe, retorna []
 *     (lista) ou { ...: 0 } (bulk).
 *   - NÃO assina `storageKey`. A geração da signed URL on-read é responsabilidade
 *     da ROTA (fail-safe lá; aqui só devolvemos o PATH no BUCKETS.MEDIA).
 *   - NUNCA toca `captionEmbedding` (Unsupported/vector — só via raw, fora de D2).
 *
 * Cliente tipado `database.knowledgeImage` (sem raw). TS strict, zero `any`.
 * Contrato/decisões: docs/builder/ONDA_D_VISION_PLAN.md (§ curadoria/D2).
 */

import { database } from '@/server/services/database'

// ---------------------------------------------------------------------------
// Shape retornado para a rota (sem imageUrl — a rota assina storageKey on-read).
// ---------------------------------------------------------------------------

export interface KnowledgeImageRow {
  id: string
  sourceId: string
  collectionId: string
  originalUrl: string
  storageKey: string // PATH no BUCKETS.MEDIA; a rota gera signed url on-read
  caption: string | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  mimeType: string | null
  confirmedAt: Date | null // NULL = pendente de curadoria
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Heurística de "baixa qualidade" (bulkDeleteLowQuality).
//   Uma imagem é "baixa qualidade" quando:
//     - não tem legenda (caption NULL), OU
//     - não conhecemos a dimensão (width/height NULL), OU
//     - width OU height < LOW_QUALITY_MIN_DIMENSION_PX (em qualquer eixo).
//   O threshold (300px) é mais alto que o MIN_DIMENSION_PX do pipeline (200px):
//   D1 já barrou ícones/spacers; aqui a curadoria em massa poda também imagens
//   "ok mas pequenas demais" para uso de catálogo. Constante exportada para o FE
//   poder explicar a ação ("remover imagens menores que 300px ou sem legenda").
// ---------------------------------------------------------------------------

export const LOW_QUALITY_MIN_DIMENSION_PX = 300

// ---------------------------------------------------------------------------
// 1) Helper interno — resolve a collection kb:${projectId} (org-scoped).
//    Reutilizado por todos os métodos. NÃO cria collection numa leitura.
// ---------------------------------------------------------------------------

async function resolveProjectCollectionId(
  projectId: string,
  organizationId: string,
): Promise<string | null> {
  const collection = await database.knowledgeCollection.findFirst({
    where: { organizationId, name: `kb:${projectId}` },
    select: { id: true },
  })
  return collection?.id ?? null
}

// ---------------------------------------------------------------------------
// 2) Lista as imagens do projeto (todas as KnowledgeSource da collection
//    kb:projectId), deletadas excluídas, org-scoped. [] se a collection não
//    existe ainda. Ordena por createdAt asc (estável p/ o FE de curadoria).
// ---------------------------------------------------------------------------

export async function listProjectImages(
  projectId: string,
  organizationId: string,
): Promise<KnowledgeImageRow[]> {
  const collectionId = await resolveProjectCollectionId(projectId, organizationId)
  if (!collectionId) return []

  // Duplo guard de tenant: org na imagem E sua collection. deletadas fora.
  const rows = await database.knowledgeImage.findMany({
    where: { organizationId, collectionId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      sourceId: true,
      collectionId: true,
      originalUrl: true,
      storageKey: true,
      caption: true,
      width: true,
      height: true,
      sizeBytes: true,
      mimeType: true,
      confirmedAt: true,
      createdAt: true,
    },
  })

  return rows
}

// ---------------------------------------------------------------------------
// 3) Edita a legenda (curadoria). org-scoped via updateMany.
//    Retorna a contagem afetada (0 = não encontrada/sem acesso → rota 404).
//    Só sobre deletadas IS NULL — não "ressuscita" legenda de imagem deletada.
// ---------------------------------------------------------------------------

export async function patchCaption(
  imageId: string,
  caption: string,
  organizationId: string,
): Promise<number> {
  const { count } = await database.knowledgeImage.updateMany({
    where: { id: imageId, organizationId, deletedAt: null },
    data: { caption },
  })
  return count
}

// ---------------------------------------------------------------------------
// 4) Soft-delete (deletedAt = now()). org-scoped via updateMany; só afeta
//    deletadas IS NULL (idempotente: re-deletar não conta). 0 → 404.
// ---------------------------------------------------------------------------

export async function softDelete(
  imageId: string,
  organizationId: string,
): Promise<number> {
  const { count } = await database.knowledgeImage.updateMany({
    where: { id: imageId, organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  })
  return count
}

// ---------------------------------------------------------------------------
// 5) Confirma/desconfirma uma imagem (confirmedAt = now() | null). org-scoped
//    via updateMany, só sobre deletadas IS NULL. 0 → 404.
// ---------------------------------------------------------------------------

export async function setConfirmed(
  imageId: string,
  confirmed: boolean,
  organizationId: string,
): Promise<number> {
  const { count } = await database.knowledgeImage.updateMany({
    where: { id: imageId, organizationId, deletedAt: null },
    data: { confirmedAt: confirmed ? new Date() : null },
  })
  return count
}

// ---------------------------------------------------------------------------
// 6) Aprova em massa todas as PENDENTES do projeto (confirmedAt IS NULL e
//    deletadas IS NULL), seta confirmedAt=now(). org-scoped (organizationId +
//    collectionId da kb:projectId). { confirmed: 0 } se a collection não existe.
// ---------------------------------------------------------------------------

export async function bulkApproveAll(
  projectId: string,
  organizationId: string,
): Promise<{ confirmed: number }> {
  const collectionId = await resolveProjectCollectionId(projectId, organizationId)
  if (!collectionId) return { confirmed: 0 }

  const { count } = await database.knowledgeImage.updateMany({
    where: {
      organizationId,
      collectionId,
      deletedAt: null,
      confirmedAt: null, // só as pendentes
    },
    data: { confirmedAt: new Date() },
  })

  return { confirmed: count }
}

// ---------------------------------------------------------------------------
// 7) Soft-delete em massa por heurística de baixa qualidade: caption NULL OU
//    width/height NULL OU width < LOW_QUALITY_MIN_DIMENSION_PX OU height < ... ,
//    apenas sobre deletadas IS NULL. org-scoped (organizationId + collectionId).
//    { deleted: 0 } se a collection não existe.
// ---------------------------------------------------------------------------

export async function bulkDeleteLowQuality(
  projectId: string,
  organizationId: string,
): Promise<{ deleted: number }> {
  const collectionId = await resolveProjectCollectionId(projectId, organizationId)
  if (!collectionId) return { deleted: 0 }

  const { count } = await database.knowledgeImage.updateMany({
    where: {
      organizationId,
      collectionId,
      deletedAt: null,
      // Baixa qualidade = qualquer uma das condições abaixo (OR).
      OR: [
        { caption: null },
        { width: null },
        { height: null },
        { width: { lt: LOW_QUALITY_MIN_DIMENSION_PX } },
        { height: { lt: LOW_QUALITY_MIN_DIMENSION_PX } },
      ],
    },
    data: { deletedAt: new Date() },
  })

  return { deleted: count }
}

// ---------------------------------------------------------------------------
// Export agrupado (mesmo estilo de re-uso dos route files).
// ---------------------------------------------------------------------------

export const knowledgeImagesRepository = {
  listProjectImages,
  patchCaption,
  softDelete,
  setConfirmed,
  bulkApproveAll,
  bulkDeleteLowQuality,
}
