-- CreateEnum (only if not exists)
DO $$ BEGIN
  CREATE TYPE "IpRuleType" AS ENUM ('ALLOW', 'BLOCK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DeviceSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "location" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IpRule" (
    "id" TEXT NOT NULL,
    "type" "IpRuleType" NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT,
    "createdById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeviceSession_userId_idx" ON "DeviceSession"("userId");
CREATE INDEX IF NOT EXISTS "DeviceSession_ipAddress_idx" ON "DeviceSession"("ipAddress");
CREATE INDEX IF NOT EXISTS "DeviceSession_lastActiveAt_idx" ON "DeviceSession"("lastActiveAt");
CREATE INDEX IF NOT EXISTS "DeviceSession_isRevoked_idx" ON "DeviceSession"("isRevoked");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IpRule_ipAddress_idx" ON "IpRule"("ipAddress");
CREATE INDEX IF NOT EXISTS "IpRule_type_idx" ON "IpRule"("type");
CREATE INDEX IF NOT EXISTS "IpRule_organizationId_idx" ON "IpRule"("organizationId");
CREATE INDEX IF NOT EXISTS "IpRule_isActive_idx" ON "IpRule"("isActive");

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IpRule" ADD CONSTRAINT "IpRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IpRule" ADD CONSTRAINT "IpRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
