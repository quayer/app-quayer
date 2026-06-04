-- Wave 4b — Google Calendar connect-link. Tabela NOVA e ADITIVA: estado do link
-- público de conexão. O refresh_token NÃO fica aqui (vai encriptado em
-- "OrganizationProvider"/organization_providers, provider='google-calendar').
-- Sem ALTER/DROP em dados existentes — seguro p/ prod sem janela.

CREATE TYPE "CalendarConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'EXPIRED', 'REVOKED');

CREATE TABLE "calendar_connections" (
  "id"                    TEXT NOT NULL,
  "organizationId"        TEXT NOT NULL,
  "builderProjectId"      TEXT,
  "connectToken"          TEXT NOT NULL,
  "connectTokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "status"                "CalendarConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "calendarEmail"         TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "calendar_connections_connectToken_key" ON "calendar_connections"("connectToken");
CREATE INDEX "calendar_connections_organizationId_idx" ON "calendar_connections"("organizationId");
CREATE INDEX "calendar_connections_builderProjectId_idx" ON "calendar_connections"("builderProjectId");
CREATE INDEX "calendar_connections_status_idx" ON "calendar_connections"("status");
CREATE INDEX "calendar_connections_connectToken_idx" ON "calendar_connections"("connectToken");

ALTER TABLE "calendar_connections"
  ADD CONSTRAINT "calendar_connections_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "calendar_connections"
  ADD CONSTRAINT "calendar_connections_builderProjectId_fkey"
  FOREIGN KEY ("builderProjectId") REFERENCES "builder_projects"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;
