-- Migration: add Builder Projects tables
-- Created: 2026-04-09
--
-- Adds the 4 tables needed by the Quayer Builder (meta-agent that
-- helps users create WhatsApp AI agents conversationally):
--   - builder_projects
--   - builder_project_conversations
--   - builder_project_messages
--   - builder_prompt_versions
--
-- Enums used:
--   - BuilderProjectType
--   - BuilderProjectStatus
--   - BuilderProjectMessageRole
--   - BuilderPromptVersionCreatedBy

-- ═══════════════════════════════════════════════════════════════════
-- Enums
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "BuilderProjectType" AS ENUM ('ai_agent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BuilderProjectStatus" AS ENUM ('draft', 'production', 'paused', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BuilderProjectMessageRole" AS ENUM ('user', 'assistant', 'tool', 'system_banner');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BuilderPromptVersionCreatedBy" AS ENUM ('chat', 'manual', 'rollback');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- builder_projects
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "builder_projects" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "type"           "BuilderProjectType" NOT NULL DEFAULT 'ai_agent',
  "name"           VARCHAR(255) NOT NULL,
  "status"         "BuilderProjectStatus" NOT NULL DEFAULT 'draft',
  "aiAgentId"      TEXT UNIQUE,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "archivedAt"     TIMESTAMP(3),

  CONSTRAINT "builder_projects_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "builder_projects_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION,
  CONSTRAINT "builder_projects_aiAgentId_fkey"
    FOREIGN KEY ("aiAgentId") REFERENCES "AIAgentConfig"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "builder_projects_org_type_status_idx"
  ON "builder_projects" ("organizationId", "type", "status");

CREATE INDEX IF NOT EXISTS "builder_projects_user_updated_idx"
  ON "builder_projects" ("userId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "builder_projects_archived_idx"
  ON "builder_projects" ("archivedAt");

-- ═══════════════════════════════════════════════════════════════════
-- builder_project_conversations (1:1 com builder_projects)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "builder_project_conversations" (
  "id"             TEXT PRIMARY KEY,
  "projectId"      TEXT NOT NULL UNIQUE,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "stateSummary"   TEXT,
  "lastMessageAt"  TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "builder_project_conversations_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "builder_projects"("id") ON DELETE CASCADE,
  CONSTRAINT "builder_project_conversations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE NO ACTION,
  CONSTRAINT "builder_project_conversations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION
);

CREATE INDEX IF NOT EXISTS "builder_project_conversations_org_user_idx"
  ON "builder_project_conversations" ("organizationId", "userId");

-- ═══════════════════════════════════════════════════════════════════
-- builder_project_messages
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "builder_project_messages" (
  "id"             TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "role"           "BuilderProjectMessageRole" NOT NULL,
  "content"        TEXT NOT NULL,
  "toolCalls"      JSONB,
  "toolResults"    JSONB,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "builder_project_messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "builder_project_conversations"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "builder_project_messages_conv_created_idx"
  ON "builder_project_messages" ("conversationId", "createdAt");

-- ═══════════════════════════════════════════════════════════════════
-- builder_prompt_versions
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "builder_prompt_versions" (
  "id"            TEXT PRIMARY KEY,
  "aiAgentId"     TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "content"       TEXT NOT NULL,
  "description"   VARCHAR(500),
  "createdBy"     "BuilderPromptVersionCreatedBy" NOT NULL DEFAULT 'chat',
  "publishedAt"   TIMESTAMP(3),
  "publishedBy"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "builder_prompt_versions_aiAgentId_fkey"
    FOREIGN KEY ("aiAgentId") REFERENCES "AIAgentConfig"("id") ON DELETE CASCADE,
  CONSTRAINT "builder_prompt_versions_publishedBy_fkey"
    FOREIGN KEY ("publishedBy") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "builder_prompt_versions_agent_version_key"
  ON "builder_prompt_versions" ("aiAgentId", "versionNumber");

CREATE INDEX IF NOT EXISTS "builder_prompt_versions_agent_published_idx"
  ON "builder_prompt_versions" ("aiAgentId", "publishedAt");
