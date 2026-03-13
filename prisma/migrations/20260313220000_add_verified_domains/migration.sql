-- CreateTable
CREATE TABLE "verified_domains" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verificationMethod" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "defaultRoleId" TEXT,
    "autoJoin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verified_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verified_domains_organizationId_idx" ON "verified_domains"("organizationId");

-- CreateIndex
CREATE INDEX "verified_domains_domain_idx" ON "verified_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "verified_domains_organizationId_domain_key" ON "verified_domains"("organizationId", "domain");

-- AddForeignKey
ALTER TABLE "verified_domains" ADD CONSTRAINT "verified_domains_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verified_domains" ADD CONSTRAINT "verified_domains_defaultRoleId_fkey" FOREIGN KEY ("defaultRoleId") REFERENCES "custom_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
