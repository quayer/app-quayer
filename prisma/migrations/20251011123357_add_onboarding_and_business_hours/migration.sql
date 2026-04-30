-- AlterTable: Add onboarding and business hours fields
-- Organization: Business hours configuration
ALTER TABLE "Organization" ADD COLUMN "businessHoursStart" TEXT,
ADD COLUMN "businessHoursEnd" TEXT,
ADD COLUMN "businessDays" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

-- User: Onboarding and organization management
ALTER TABLE "User" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastOrganizationId" TEXT;
