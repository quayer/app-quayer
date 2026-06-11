-- CreateTable
CREATE TABLE "builder_journey_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "journeyVersion" INTEGER NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "builder_journey_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "builder_journey_events_organizationId_event_createdAt_idx" ON "builder_journey_events"("organizationId", "event", "createdAt");

-- CreateIndex
CREATE INDEX "builder_journey_events_projectId_createdAt_idx" ON "builder_journey_events"("projectId", "createdAt");
