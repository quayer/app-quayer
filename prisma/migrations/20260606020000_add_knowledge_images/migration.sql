-- Onda D / G2 — Catálogo Visual das Fontes (imagens extraídas do site/Instagram).
-- pgvector já instalado (knowledge_chunks). captionEmbedding é NULLABLE e só será
-- populado na fase de runtime (busca vetorial da galeria); INSERT/SELECT do vetor
-- SEMPRE via raw SQL. Aditivo: nada de backfill, sem data-loss.

-- Garante a extensão (idempotente — já criada em add_knowledge_rag).
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable: toggle do catálogo visual por fonte (default ligado).
ALTER TABLE "knowledge_sources" ADD COLUMN "imagesEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "knowledge_images" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "caption" TEXT,
    "captionEmbedding" vector(1536),
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_images_sourceId_sha256_key" ON "knowledge_images"("sourceId", "sha256");
CREATE INDEX "knowledge_images_collectionId_idx" ON "knowledge_images"("collectionId");
CREATE INDEX "knowledge_images_organizationId_idx" ON "knowledge_images"("organizationId");
CREATE INDEX "knowledge_images_sourceId_idx" ON "knowledge_images"("sourceId");

-- HNSW para a busca por similaridade de cosseno da legenda (pgvector >= 0.5).
-- O índice fica vazio enquanto captionEmbedding for NULL (populado na fase runtime).
CREATE INDEX "knowledge_images_captionEmbedding_hnsw_idx" ON "knowledge_images" USING hnsw ("captionEmbedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "knowledge_images" ADD CONSTRAINT "knowledge_images_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "knowledge_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_images" ADD CONSTRAINT "knowledge_images_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
