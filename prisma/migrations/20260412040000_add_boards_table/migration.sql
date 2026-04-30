-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'scratch',
    "data" JSONB NOT NULL DEFAULT '{}',
    "thumbnail" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boards_organizationId_idx" ON "boards"("organizationId");
CREATE INDEX "boards_createdById_idx" ON "boards"("createdById");
CREATE INDEX "boards_folder_idx" ON "boards"("folder");

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "boards" ADD CONSTRAINT "boards_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
