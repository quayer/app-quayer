-- Migration: Add CRM (leads), Communication (campaigns, templates), Features (short_links) models
-- Part of modular architecture reorganization — US-004, US-005, US-006, US-007

-- ── CRM: Leads & Sales Pipeline ──────────────────────────────────────────────

CREATE TABLE "leads" (
  "id"              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId"  TEXT NOT NULL,
  "contactId"       TEXT NOT NULL REFERENCES "Contact"("id") ON DELETE CASCADE,
  "title"           TEXT NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'new',
  "value"           DECIMAL(12,2),
  "expectedCloseAt" TIMESTAMP(3),
  "assignedAgentId" TEXT,
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "leads_organizationId_idx" ON "leads"("organizationId");
CREATE INDEX "leads_contactId_idx" ON "leads"("contactId");
CREATE INDEX "leads_status_idx" ON "leads"("status");

CREATE TABLE "lead_opportunities" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "leadId"      TEXT NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL,
  "value"       DECIMAL(12,2) NOT NULL,
  "stage"       TEXT NOT NULL DEFAULT 'prospecting',
  "probability" INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "lead_opportunities_leadId_idx" ON "lead_opportunities"("leadId");

CREATE TABLE "lead_tasks" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "leadId"      TEXT NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "title"       TEXT NOT NULL,
  "dueAt"       TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "assignedTo"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "lead_tasks_leadId_idx" ON "lead_tasks"("leadId");

-- ── Communication: Campaigns (Dispatch) ──────────────────────────────────────

CREATE TABLE "campaigns" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "connectionId"   TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'draft',
  "scheduledAt"    TIMESTAMP(3),
  "message"        TEXT NOT NULL,
  "mediaUrl"       TEXT,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentCount"      INTEGER NOT NULL DEFAULT 0,
  "failedCount"    INTEGER NOT NULL DEFAULT 0,
  "createdById"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "campaigns_organizationId_idx" ON "campaigns"("organizationId");
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

CREATE TABLE "campaign_recipients" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "campaignId"  TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "contactId"   TEXT,
  "phoneNumber" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "sentAt"      TIMESTAMP(3),
  "error"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "campaign_recipients_campaignId_idx" ON "campaign_recipients"("campaignId");
CREATE INDEX "campaign_recipients_status_idx" ON "campaign_recipients"("status");

-- ── Communication: Message Templates HSM ─────────────────────────────────────

CREATE TABLE "message_templates" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "connectionId"   TEXT,
  "name"           TEXT NOT NULL,
  "category"       TEXT NOT NULL DEFAULT 'UTILITY',
  "language"       TEXT NOT NULL DEFAULT 'pt_BR',
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "headerType"     TEXT NOT NULL DEFAULT 'NONE',
  "headerContent"  TEXT,
  "body"           TEXT NOT NULL,
  "footer"         TEXT,
  "buttons"        JSONB,
  "metaTemplateId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "message_templates_organizationId_idx" ON "message_templates"("organizationId");
CREATE INDEX "message_templates_status_idx" ON "message_templates"("status");

-- ── Features: Short Links ─────────────────────────────────────────────────────

CREATE TABLE "short_links" (
  "id"             TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "originalUrl"    TEXT NOT NULL,
  "slug"           TEXT NOT NULL UNIQUE,
  "clicks"         INTEGER NOT NULL DEFAULT 0,
  "createdById"    TEXT NOT NULL,
  "expiresAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "short_links_organizationId_idx" ON "short_links"("organizationId");

CREATE TABLE "short_link_clicks" (
  "id"          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "shortLinkId" TEXT NOT NULL REFERENCES "short_links"("id") ON DELETE CASCADE,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "countryCode" TEXT,
  "clickedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "short_link_clicks_shortLinkId_idx" ON "short_link_clicks"("shortLinkId");
