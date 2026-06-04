-- BYOK por agente: AIAgentConfig escolhe qual chave (OrganizationProvider) usar.
-- null = fallback (isPrimary → priority → primeira ativa). onDelete SetNull:
-- apagar a chave não derruba o agente (volta pro fallback).

ALTER TABLE "AIAgentConfig" ADD COLUMN "organizationProviderId" TEXT;

CREATE INDEX "AIAgentConfig_organizationProviderId_idx" ON "AIAgentConfig"("organizationProviderId");

ALTER TABLE "AIAgentConfig" ADD CONSTRAINT "AIAgentConfig_organizationProviderId_fkey" FOREIGN KEY ("organizationProviderId") REFERENCES "organization_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
