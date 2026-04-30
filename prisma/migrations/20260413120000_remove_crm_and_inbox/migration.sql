-- ============================================================================
-- Migration: Remove CRM & Inbox models (Quayer pivot to Builder IA for WhatsApp)
-- Date: 2026-04-13
--
-- Removes:
--   CRM:    Contact, ContactAttribute, Attribute, ContactObservation, Call,
--           Lead, LeadOpportunity, LeadTask, Tabulation, ContactTabulation,
--           SessionTabulation, TabulationIntegration, TabulationSetting,
--           KanbanBoard, KanbanColumn, Label
--   Inbox:  QuickReply, SessionNote, GroupChat, GroupParticipant, GroupMessage
--
-- Kept (Builder still uses):
--   ChatSession, Message (now reference contactPhone as String, not Contact FK)
--   Campaign, CampaignRecipient, MessageTemplate (dormant, Communication module)
--
-- Relations/columns dropped from kept tables:
--   ChatSession.contactId  -> renamed to ChatSession.contactPhone (String)
--   Message.contactId      -> renamed to Message.contactPhone (String)
--   Organization.groupDefaultMode, groupAiResponseMode (GroupMode/GroupAIResponseMode enums)
-- ============================================================================

-- ── Drop foreign keys first (defensive — CASCADE below covers most) ──────────
-- (Using CASCADE on DROP TABLE removes dependent FKs automatically.)

-- ── Drop CRM / Sales tables ─────────────────────────────────────────────────
DROP TABLE IF EXISTS "lead_tasks" CASCADE;
DROP TABLE IF EXISTS "lead_opportunities" CASCADE;
DROP TABLE IF EXISTS "leads" CASCADE;

DROP TABLE IF EXISTS "ContactObservation" CASCADE;
DROP TABLE IF EXISTS "ContactAttribute" CASCADE;
DROP TABLE IF EXISTS "Attribute" CASCADE;

DROP TABLE IF EXISTS "ContactTabulation" CASCADE;
DROP TABLE IF EXISTS "SessionTabulation" CASCADE;
DROP TABLE IF EXISTS "TabulationIntegration" CASCADE;
DROP TABLE IF EXISTS "TabulationSetting" CASCADE;
DROP TABLE IF EXISTS "Tabulation" CASCADE;

DROP TABLE IF EXISTS "KanbanColumn" CASCADE;
DROP TABLE IF EXISTS "KanbanBoard" CASCADE;
DROP TABLE IF EXISTS "Label" CASCADE;

DROP TABLE IF EXISTS "Call" CASCADE;

-- ── Drop Inbox / Conversation-auxiliary tables ──────────────────────────────
DROP TABLE IF EXISTS "session_notes" CASCADE;
DROP TABLE IF EXISTS "quick_replies" CASCADE;
DROP TABLE IF EXISTS "group_messages" CASCADE;
DROP TABLE IF EXISTS "group_participants" CASCADE;
DROP TABLE IF EXISTS "group_chats" CASCADE;

-- ── Transform ChatSession: contactId (FK) -> contactPhone (String) ──────────
-- Drop FK + index on contactId, rename column, add new index.
ALTER TABLE "ChatSession"
  DROP CONSTRAINT IF EXISTS "ChatSession_contactId_fkey";
DROP INDEX IF EXISTS "ChatSession_contactId_idx";
ALTER TABLE "ChatSession"
  RENAME COLUMN "contactId" TO "contactPhone";
-- (column remains TEXT NOT NULL — previously stored Contact.id UUID; on rollforward
-- application code must backfill with Contact.phoneNumber before deploy.)
CREATE INDEX IF NOT EXISTS "ChatSession_contactPhone_idx" ON "ChatSession"("contactPhone");

-- ── Transform Message: contactId (FK) -> contactPhone (String) ──────────────
ALTER TABLE "Message"
  DROP CONSTRAINT IF EXISTS "Message_contactId_fkey";
DROP INDEX IF EXISTS "Message_contactId_idx";
ALTER TABLE "Message"
  RENAME COLUMN "contactId" TO "contactPhone";
CREATE INDEX IF NOT EXISTS "Message_contactPhone_idx" ON "Message"("contactPhone");

-- ── Drop Contact last (after all dependents gone) ───────────────────────────
DROP TABLE IF EXISTS "Contact" CASCADE;

-- ── Drop Organization columns that referenced removed enums ─────────────────
ALTER TABLE "Organization"
  DROP COLUMN IF EXISTS "groupDefaultMode",
  DROP COLUMN IF EXISTS "groupAiResponseMode";

-- ── Drop orphaned enum types (no longer referenced) ─────────────────────────
DROP TYPE IF EXISTS "GroupMode";
DROP TYPE IF EXISTS "GroupAIResponseMode";
DROP TYPE IF EXISTS "CallDirection";
DROP TYPE IF EXISTS "CallStatus";
