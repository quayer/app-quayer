-- AlterTable: Add geoAlertMode to Organization
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "geoAlertMode" TEXT NOT NULL DEFAULT 'off';

-- AlterTable: Add countryCode to DeviceSession
ALTER TABLE "DeviceSession" ADD COLUMN IF NOT EXISTS "countryCode" TEXT;

-- CreateIndex: userId + countryCode for geo lookup
CREATE INDEX IF NOT EXISTS "DeviceSession_userId_countryCode_idx" ON "DeviceSession"("userId", "countryCode");

-- AlterEnum: Add SECURITY to NotificationType
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SECURITY';
