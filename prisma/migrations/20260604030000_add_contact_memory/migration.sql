-- CreateTable: contact_memories
-- Perfil vitalício do contato (por organização + telefone). Agrega o histórico
-- de todas as sessões fechadas em um perfil cumulativo, injetado no system
-- prompt do agente. Multi-tenant por organizationId.
CREATE TABLE "contact_memories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "aggregatedProfile" TEXT NOT NULL,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: lookup por org (multi-tenant scans) e unicidade por org+telefone.
CREATE UNIQUE INDEX "contact_memories_organizationId_contactPhone_key" ON "contact_memories"("organizationId", "contactPhone");
CREATE INDEX "contact_memories_organizationId_idx" ON "contact_memories"("organizationId");
