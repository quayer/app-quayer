-- Migration: Add Agent Studio tables (prompt versions, tools, deployments)
-- Resolves: P2021 "relation public.agent_prompt_versions does not exist"
-- AIAgentConfig already exists from init migration; this adds the 3 related tables + 4 enums

-- ── Enums ───────────────────────────────────────────────────────────────────────

CREATE TYPE "PromptVersionStatus" AS ENUM ('ACTIVE', 'TESTING', 'ARCHIVED');
CREATE TYPE "AgentToolType" AS ENUM ('BUILTIN', 'CUSTOM', 'MCP');
CREATE TYPE "AgentDeployMode" AS ENUM ('CHAT', 'N8N', 'CLAUDE_CODE');
CREATE TYPE "AgentDeployStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DRAFT');

-- ── Agent Prompt Versions ───────────────────────────────────────────────────────

CREATE TABLE "agent_prompt_versions" (
  "id"              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agentConfigId"   TEXT NOT NULL REFERENCES "AIAgentConfig"("id") ON DELETE CASCADE,
  "version"         INTEGER NOT NULL,
  "systemPrompt"    TEXT NOT NULL,
  "isActive"        BOOLEAN NOT NULL DEFAULT false,
  "status"          "PromptVersionStatus" NOT NULL DEFAULT 'ARCHIVED',
  "changelog"       TEXT,
  "createdBy"       TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "totalMessages"   INTEGER NOT NULL DEFAULT 0,
  "totalTransfers"  INTEGER NOT NULL DEFAULT 0,
  "totalCost"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avgResponseTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "agent_prompt_versions_agentConfigId_version_key"
  ON "agent_prompt_versions"("agentConfigId", "version");
CREATE INDEX "agent_prompt_versions_agentConfigId_idx"
  ON "agent_prompt_versions"("agentConfigId");
CREATE INDEX "agent_prompt_versions_isActive_idx"
  ON "agent_prompt_versions"("isActive");

-- ── Agent Tools ─────────────────────────────────────────────────────────────────

CREATE TABLE "agent_tools" (
  "id"              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId"  TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "type"            "AgentToolType" NOT NULL DEFAULT 'CUSTOM',
  "parameters"      JSONB,
  "webhookUrl"      TEXT,
  "webhookSecret"   TEXT,
  "webhookTimeout"  INTEGER NOT NULL DEFAULT 10000,
  "isActive"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "agent_tools_organizationId_name_key"
  ON "agent_tools"("organizationId", "name");
CREATE INDEX "agent_tools_organizationId_idx"
  ON "agent_tools"("organizationId");
CREATE INDEX "agent_tools_type_idx"
  ON "agent_tools"("type");

-- ── Agent Deployments ───────────────────────────────────────────────────────────

CREATE TABLE "agent_deployments" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agentConfigId"  TEXT NOT NULL REFERENCES "AIAgentConfig"("id") ON DELETE CASCADE,
  "connectionId"   TEXT NOT NULL REFERENCES "connections"("id") ON DELETE CASCADE,
  "mode"           "AgentDeployMode" NOT NULL DEFAULT 'CHAT',
  "status"         "AgentDeployStatus" NOT NULL DEFAULT 'DRAFT',
  "config"         JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "agent_deployments_agentConfigId_idx"
  ON "agent_deployments"("agentConfigId");
CREATE INDEX "agent_deployments_connectionId_idx"
  ON "agent_deployments"("connectionId");
CREATE INDEX "agent_deployments_status_idx"
  ON "agent_deployments"("status");
