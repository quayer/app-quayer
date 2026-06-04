-- Base de Conhecimento / RAG (pgvector)
-- pgvector já instalado no Postgres da app (Supabase, extensão vector 0.8.0).
-- A coluna embedding é vector(1536); INSERT/SELECT do vetor SEMPRE via raw SQL.

-- Garante a extensão (idempotente). Em DBs de dev/shadow/test, pgvector precisa
-- estar disponível para esta migration rodar (ver docs/backlog / SECRETS).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "knowledge_collections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_sources" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "storageKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sourceId" TEXT,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB,
    "ordinal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_collections_organizationId_name_key" ON "knowledge_collections"("organizationId", "name");
CREATE INDEX "knowledge_collections_organizationId_idx" ON "knowledge_collections"("organizationId");
CREATE INDEX "knowledge_sources_collectionId_idx" ON "knowledge_sources"("collectionId");
CREATE INDEX "knowledge_sources_organizationId_idx" ON "knowledge_sources"("organizationId");
CREATE INDEX "knowledge_sources_status_idx" ON "knowledge_sources"("status");
CREATE INDEX "knowledge_chunks_collectionId_idx" ON "knowledge_chunks"("collectionId");
CREATE INDEX "knowledge_chunks_sourceId_idx" ON "knowledge_chunks"("sourceId");

-- HNSW index para busca por similaridade de cosseno (pgvector >= 0.5)
CREATE INDEX "knowledge_chunks_embedding_hnsw_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "knowledge_collections" ADD CONSTRAINT "knowledge_collections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "knowledge_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "knowledge_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "knowledge_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reativa AIAgentConfig.ragCollectionId como FK (coluna já existe desde o init).
ALTER TABLE "AIAgentConfig" ADD CONSTRAINT "AIAgentConfig_ragCollectionId_fkey" FOREIGN KEY ("ragCollectionId") REFERENCES "knowledge_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
