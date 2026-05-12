-- Add AgentDeployment model + supporting enums.
--
-- The `agent_deployments` table is referenced by:
--   - getProjectDetail (src/server/ai-module/builder/queries.ts) — includes
--     aiAgent.deployments to derive hasWhatsAppConnection
--   - The publish saga + deploy controllers
--
-- The table was defined in the `20250101000000_init` migration but homol's
-- database was bootstrapped from a partial init that omitted it (Prisma
-- migrate state shows init was never applied; later incremental migrations
-- were applied on top of a db-push baseline). The enum types `AgentDeployMode`
-- and `AgentDeployStatus` are also missing.

-- Enum: AgentDeployMode
CREATE TYPE "public"."AgentDeployMode" AS ENUM ('CHAT', 'N8N', 'CLAUDE_CODE');

-- Enum: AgentDeployStatus
CREATE TYPE "public"."AgentDeployStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DRAFT');

-- Table: agent_deployments
CREATE TABLE "public"."agent_deployments" (
    "id" TEXT NOT NULL,
    "agentConfigId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "mode" "public"."AgentDeployMode" NOT NULL DEFAULT 'CHAT',
    "status" "public"."AgentDeployStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_deployments_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "agent_deployments_agentConfigId_idx" ON "public"."agent_deployments"("agentConfigId");
CREATE INDEX "agent_deployments_connectionId_idx" ON "public"."agent_deployments"("connectionId");
CREATE INDEX "agent_deployments_status_idx" ON "public"."agent_deployments"("status");

-- Foreign keys
ALTER TABLE "public"."agent_deployments"
    ADD CONSTRAINT "agent_deployments_agentConfigId_fkey"
    FOREIGN KEY ("agentConfigId") REFERENCES "public"."AIAgentConfig"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "public"."agent_deployments"
    ADD CONSTRAINT "agent_deployments_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "public"."connections"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
