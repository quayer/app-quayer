-- Migration: Builder Architecture Patterns
-- Created: 2026-04-14
--
-- Adds 3 new tables for the Quayer Builder architecture layer:
--   - builder_deployments        (saga state for publish → create-instance → attach)
--   - builder_tool_calls         (observability of meta-agent tool invocations)
--   - builder_context_snapshots  (audit trail of context-budget compactions)
--
-- Enums introduced:
--   - BuilderDeploymentStatus
--   - BuilderToolCallStatus
--   - BuilderContextSnapshotTrigger

-- ═══════════════════════════════════════════════════════════════════
-- Enums
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "BuilderDeploymentStatus" AS ENUM (
    'pending',
    'publishing',
    'instance_creating',
    'attaching',
    'live',
    'failed',
    'rolled_back'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BuilderToolCallStatus" AS ENUM (
    'pending',
    'success',
    'error',
    'approved',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "BuilderContextSnapshotTrigger" AS ENUM (
    'auto',
    'manual',
    'exhausted'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- builder_deployments
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "builder_deployments" (
  "id"              TEXT PRIMARY KEY,
  "projectId"       TEXT NOT NULL,
  "aiAgentId"       TEXT NOT NULL,
  "promptVersionId" TEXT NOT NULL,
  "instanceId"      TEXT,
  "connectionId"    TEXT,
  "status"          "BuilderDeploymentStatus" NOT NULL DEFAULT 'pending',
  "failureStep"     TEXT,
  "failureReason"   TEXT,
  "rolledBack"      BOOLEAN NOT NULL DEFAULT false,
  "startedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"     TIMESTAMP(3),
  "triggeredBy"     TEXT NOT NULL,

  CONSTRAINT "builder_deployments_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "builder_projects"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "builder_deployments_project_status_idx"
  ON "builder_deployments" ("projectId", "status");

CREATE INDEX IF NOT EXISTS "builder_deployments_agent_idx"
  ON "builder_deployments" ("aiAgentId");

CREATE INDEX IF NOT EXISTS "builder_deployments_started_idx"
  ON "builder_deployments" ("startedAt");

-- ═══════════════════════════════════════════════════════════════════
-- builder_tool_calls
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "builder_tool_calls" (
  "id"           TEXT PRIMARY KEY,
  "messageId"    TEXT NOT NULL,
  "toolName"     VARCHAR(100) NOT NULL,
  "input"        JSONB NOT NULL,
  "output"       JSONB,
  "status"       "BuilderToolCallStatus" NOT NULL DEFAULT 'pending',
  "errorMessage" TEXT,
  "tokensIn"     INTEGER,
  "tokensOut"    INTEGER,
  "latencyMs"    INTEGER,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "builder_tool_calls_message_idx"
  ON "builder_tool_calls" ("messageId");

CREATE INDEX IF NOT EXISTS "builder_tool_calls_tool_created_idx"
  ON "builder_tool_calls" ("toolName", "createdAt");

CREATE INDEX IF NOT EXISTS "builder_tool_calls_status_created_idx"
  ON "builder_tool_calls" ("status", "createdAt");

-- ═══════════════════════════════════════════════════════════════════
-- builder_context_snapshots
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "builder_context_snapshots" (
  "id"                TEXT PRIMARY KEY,
  "conversationId"    TEXT NOT NULL,
  "summary"           TEXT NOT NULL,
  "messagesCompacted" INTEGER NOT NULL,
  "tokensBefore"      INTEGER,
  "tokensAfter"       INTEGER,
  "tokensReclaimed"   INTEGER,
  "triggeredBy"       "BuilderContextSnapshotTrigger" NOT NULL DEFAULT 'auto',
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "builder_context_snapshots_conv_created_idx"
  ON "builder_context_snapshots" ("conversationId", "createdAt");
