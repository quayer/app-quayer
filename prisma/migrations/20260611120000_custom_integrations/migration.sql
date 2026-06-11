-- Integration Builder (Onda 1) — ferramentas personalizadas investigadas/templated.
-- Aditivo: 2 tabelas novas + 1 enum. Nenhuma ALTER em tabela existente, nenhum
-- data-loss. FK agentToolId é nullable + SetNull (delete do AgentTool libera o
-- nome do @@unique e mantém a CustomIntegration soft-deletada viva p/ auditoria).
-- Drift pré-existente do DB local (boards/device_sessions/scim_tokens/hnsw) é
-- intencionalmente EXCLUÍDO daqui — tratado em 20260610190000_fix_schema_drift.

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('draft', 'validated', 'active', 'paused', 'error');

-- CreateTable
CREATE TABLE "custom_integrations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "builderProjectId" TEXT NOT NULL,
    "agentToolId" TEXT,
    "templateSlug" TEXT,
    "displayName" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'draft',
    "triggerDescription" TEXT,
    "requestSpec" JSONB NOT NULL,
    "credentialFields" JSONB NOT NULL,
    "credentials" JSONB,
    "research" JSONB,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" TEXT,
    "lastTestErrorClass" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdById" TEXT NOT NULL,
    "validatedById" TEXT,
    "activatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_test_calls" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_test_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_integrations_agentToolId_key" ON "custom_integrations"("agentToolId");

-- CreateIndex
CREATE INDEX "custom_integrations_organizationId_status_idx" ON "custom_integrations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "custom_integrations_builderProjectId_idx" ON "custom_integrations"("builderProjectId");

-- CreateIndex
CREATE INDEX "custom_integrations_organizationId_deletedAt_idx" ON "custom_integrations"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "integration_test_calls_integrationId_createdAt_idx" ON "integration_test_calls"("integrationId", "createdAt");

-- AddForeignKey
ALTER TABLE "custom_integrations" ADD CONSTRAINT "custom_integrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_integrations" ADD CONSTRAINT "custom_integrations_builderProjectId_fkey" FOREIGN KEY ("builderProjectId") REFERENCES "builder_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_integrations" ADD CONSTRAINT "custom_integrations_agentToolId_fkey" FOREIGN KEY ("agentToolId") REFERENCES "agent_tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_test_calls" ADD CONSTRAINT "integration_test_calls_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "custom_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
