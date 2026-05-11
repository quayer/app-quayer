-- ============================================================================
-- Migration: Drop orphan models (Mai/2026 schema cleanup)
-- Date: 2026-05-11
--
-- Removes 6 modelos sem uso em src/ E sem FK relations no schema. Inventário
-- documentado em docs/deprecated/SCHEMA_DORMANT_MODELS.md (Categoria 2).
--
-- Dropped models / tables:
--   WebhookEvent       -> webhook_events           (payment-gateway webhooks, dormant)
--   MessageTemplate    -> message_templates        (WhatsApp templates Meta, dormant)
--   IntegrationConfig  -> "IntegrationConfig"      (generic 3rd-party creds, superseded by OrganizationProvider)
--   EmailTemplate      -> "EmailTemplate"          (replaced by React Email components in lib/email/)
--   DeviceAuthRequest  -> device_auth_requests     (OAuth device flow, never implemented)
--   AIPrompt           -> "AIPrompt"               (replaced by BuilderPromptVersion)
--
-- Dropped enums (only consumed by the removed tables above):
--   WebhookEventStatus
--   IntegrationType
--   DeviceAuthStatus
--
-- Kept:
--   PaymentGateway    -> still used by Subscription + Invoice
--   LogAnalysis       -> still used by /api/v1/logs/analyze[/analyses]
-- ============================================================================

-- ── Drop tables (no FK references inbound — verified via grep on init migration) ─

DROP TABLE IF EXISTS "webhook_events" CASCADE;
DROP TABLE IF EXISTS "message_templates" CASCADE;
DROP TABLE IF EXISTS "IntegrationConfig" CASCADE;
DROP TABLE IF EXISTS "EmailTemplate" CASCADE;
DROP TABLE IF EXISTS "device_auth_requests" CASCADE;
DROP TABLE IF EXISTS "AIPrompt" CASCADE;

-- ── Drop orphan enums (only referenced by the tables above) ──────────────────

DROP TYPE IF EXISTS "WebhookEventStatus";
DROP TYPE IF EXISTS "IntegrationType";
DROP TYPE IF EXISTS "DeviceAuthStatus";
