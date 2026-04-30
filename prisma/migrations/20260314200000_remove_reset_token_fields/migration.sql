-- Migration: Remove resetToken and resetTokenExpiry from User
-- These fields were used as temporary OTP/verification stores.
-- All verification logic now uses the VerificationCode table exclusively.

ALTER TABLE "User" DROP COLUMN IF EXISTS "resetToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetTokenExpiry";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastOrganizationId";

-- Drop the now-unused index (Prisma will not emit DROP INDEX for removed @@index)
DROP INDEX IF EXISTS "User_resetToken_idx";

-- Extract user preferences to dedicated table (US-002)
CREATE TABLE "UserPreferences" (
  "id"                   TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"               TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "messageSignature"     JSONB,
  "aiSuggestionsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing data: create UserPreferences rows for users that have messageSignature or aiSuggestionsEnabled=false
INSERT INTO "UserPreferences" ("id", "userId", "messageSignature", "aiSuggestionsEnabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, id, "messageSignature", "aiSuggestionsEnabled", NOW(), NOW()
FROM "User"
WHERE "messageSignature" IS NOT NULL OR "aiSuggestionsEnabled" = false;

-- Remove extracted fields from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "messageSignature";
ALTER TABLE "User" DROP COLUMN IF EXISTS "aiSuggestionsEnabled";

-- Drop deprecated models (zero usages in codebase — replaced by CustomRole and SystemSettings)
DROP TABLE IF EXISTS "AccessLevel";
DROP TABLE IF EXISTS "SystemConfig";

-- Rename VerificationCode.email → identifier (stores email OR phone number)
ALTER TABLE "VerificationCode" RENAME COLUMN "email" TO "identifier";
DROP INDEX IF EXISTS "VerificationCode_email_type_idx";
CREATE INDEX "VerificationCode_identifier_type_idx" ON "VerificationCode"("identifier", "type");
