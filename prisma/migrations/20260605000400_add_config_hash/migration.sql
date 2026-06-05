-- Migration: add configHash to agent_runtime_decisions (QH-11)
-- Safe: IF NOT EXISTS — idempotent for both fresh and existing databases.
-- Prisma maps camelCase configHash → snake_case config_hash in the table.
ALTER TABLE "agent_runtime_decisions" ADD COLUMN IF NOT EXISTS "config_hash" TEXT;
