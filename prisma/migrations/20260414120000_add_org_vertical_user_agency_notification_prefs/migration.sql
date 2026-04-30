-- AlterTable: Organization — vertical + agentLanguage for Builder IA
ALTER TABLE "Organization"
  ADD COLUMN "vertical" TEXT,
  ADD COLUMN "agentLanguage" TEXT DEFAULT 'pt-BR';

-- AlterTable: User — isAgency flag + profile (language/timezone/avatar)
ALTER TABLE "User"
  ADD COLUMN "isAgency"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "language"  TEXT    DEFAULT 'pt-BR',
  ADD COLUMN "timezone"  TEXT    DEFAULT 'America/Sao_Paulo',
  ADD COLUMN "avatarUrl" TEXT;

-- CreateTable: notification_preferences (per-user channel opt-ins)
CREATE TABLE "notification_preferences" (
    "userId"          TEXT    NOT NULL,
    "emailSecurity"   BOOLEAN NOT NULL DEFAULT true,
    "emailProduct"    BOOLEAN NOT NULL DEFAULT true,
    "emailMarketing"  BOOLEAN NOT NULL DEFAULT false,
    "pushEnabled"     BOOLEAN NOT NULL DEFAULT false,
    "pushMentions"    BOOLEAN NOT NULL DEFAULT true,
    "pushDeployments" BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
