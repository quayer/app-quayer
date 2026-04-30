-- Migration: Provider Name + Project Scope
-- Created: 2026-04-29
--
-- Changes to organization_providers:
--   1. Add `name` column (friendly label per key, e.g. "Chave Prod")
--   2. Add `builderProjectId` column (null = org-level, set = project override)
--   3. Drop old unique constraint (org + category + provider + priority)
--   4. Add new unique constraint that includes builderProjectId
--   5. Add FK to builder_projects with CASCADE delete
--   6. Add index on builderProjectId

-- ─── 1. Add columns ───────────────────────────────────────────────────────────

ALTER TABLE "organization_providers"
  ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "builderProjectId" TEXT;

-- ─── 2. Drop old unique constraint ───────────────────────────────────────────

ALTER TABLE "organization_providers"
  DROP CONSTRAINT IF EXISTS "organization_providers_organizationId_category_provider_priority_key";

-- ─── 3. Add new unique constraint ────────────────────────────────────────────
-- NULL values are treated as distinct in PostgreSQL unique constraints,
-- so two org-level rows (builderProjectId IS NULL) with different priorities
-- are unique, and a project-level row never conflicts with an org-level row.

ALTER TABLE "organization_providers"
  ADD CONSTRAINT "organization_providers_organizationId_category_provider_builderProjectId_priority_key"
  UNIQUE ("organizationId", "category", "provider", "builderProjectId", "priority");

-- ─── 4. Add FK ────────────────────────────────────────────────────────────────

ALTER TABLE "organization_providers"
  ADD CONSTRAINT "organization_providers_builderProjectId_fkey"
  FOREIGN KEY ("builderProjectId")
  REFERENCES "builder_projects"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- ─── 5. Index ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "organization_providers_builderProjectId_idx"
  ON "organization_providers"("builderProjectId");
