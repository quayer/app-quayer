-- Fase E — Catálogo de Mídia: tabela UNIFICADA de mídia enviável pelo agente
-- (foto/vídeo/PDF). A tool `buscar_media` lê daqui; o outbound (tag-parser →
-- uazapi-sender) é quem envia. Origens: upload manual + materialização de
-- KnowledgeImage (galeria) e PriceItem (fotos de preço) no deploy.
-- Aditivo: tabela nova, sem backfill, sem data-loss.

CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "storageKey" TEXT,
    "externalUrl" TEXT,
    "mimeType" TEXT,
    "caption" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "sourceRef" TEXT,
    "sizeBytes" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- Dedup do materialize: (source, sourceRef). Uploads têm sourceRef NULL → Postgres
-- trata NULLs como distintos, então múltiplos uploads coexistem.
CREATE UNIQUE INDEX "media_assets_source_sourceRef_key" ON "media_assets"("source", "sourceRef");
CREATE INDEX "media_assets_collectionId_idx" ON "media_assets"("collectionId");
CREATE INDEX "media_assets_organizationId_idx" ON "media_assets"("organizationId");
CREATE INDEX "media_assets_collectionId_mediaType_deletedAt_idx" ON "media_assets"("collectionId", "mediaType", "deletedAt");

-- FK p/ a collection do projeto (= ragCollectionId do agente).
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "knowledge_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
