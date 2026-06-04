-- Wave 4a — Departamentos + roleta (round-robin) para handoff humano.
-- Department/ChatSession/User/Organization são PascalCase (sem @@map).
-- ⚠️ A FK Department->Organization é NOVA sobre dados existentes: se houver
--    Department com organizationId órfão, este deploy falha (sanear antes).

-- ── [1] Department: estado round-robin + FKs ──────────────────────────────
ALTER TABLE "Department"
  ADD COLUMN "lastAssignedUserId" TEXT,
  ADD COLUMN "lastAssignedAt"     TIMESTAMP(3);

CREATE INDEX "Department_lastAssignedUserId_idx"
  ON "Department"("lastAssignedUserId");

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_lastAssignedUserId_fkey"
  FOREIGN KEY ("lastAssignedUserId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "Department"
  ADD CONSTRAINT "Department_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ── [2] department_members: fila da roleta (User <-> Department) ───────────
CREATE TABLE "department_members" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departmentId"   TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "position"       INTEGER NOT NULL DEFAULT 0,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "department_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "department_members_departmentId_userId_key"
  ON "department_members"("departmentId", "userId");
CREATE INDEX "department_members_organizationId_idx"
  ON "department_members"("organizationId");
CREATE INDEX "department_members_departmentId_idx"
  ON "department_members"("departmentId");
CREATE INDEX "department_members_userId_idx"
  ON "department_members"("userId");
CREATE INDEX "department_members_departmentId_isActive_position_idx"
  ON "department_members"("departmentId", "isActive", "position");

ALTER TABLE "department_members"
  ADD CONSTRAINT "department_members_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "department_members"
  ADD CONSTRAINT "department_members_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "department_members"
  ADD CONSTRAINT "department_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ── [3] ChatSession: FKs de atribuição (colunas já existem) ────────────────
ALTER TABLE "ChatSession"
  ADD CONSTRAINT "ChatSession_assignedAgentId_fkey"
  FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE "ChatSession"
  ADD CONSTRAINT "ChatSession_assignedCustomerId_fkey"
  FOREIGN KEY ("assignedCustomerId") REFERENCES "User"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;
