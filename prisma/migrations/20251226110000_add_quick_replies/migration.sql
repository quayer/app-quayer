-- CreateTable
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_replies_organizationId_idx" ON "quick_replies"("organizationId");

-- CreateIndex
CREATE INDEX "quick_replies_createdById_idx" ON "quick_replies"("createdById");

-- CreateIndex
CREATE INDEX "quick_replies_category_idx" ON "quick_replies"("category");

-- CreateIndex
CREATE INDEX "quick_replies_isActive_idx" ON "quick_replies"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "quick_replies_organizationId_shortcut_key" ON "quick_replies"("organizationId", "shortcut");

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
