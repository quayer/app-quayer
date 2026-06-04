-- Catálogo de preços (DB-first). Fonte da tool get_pricing.
-- Google Sheets sync = fase 2 (molde Google Calendar).

CREATE TABLE "price_lists" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_items" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "description" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_items_pkey" PRIMARY KEY ("id")
);

-- AIAgentConfig: liga o agente à sua lista de preços.
ALTER TABLE "AIAgentConfig" ADD COLUMN "priceListId" TEXT;

CREATE UNIQUE INDEX "price_lists_organizationId_name_key" ON "price_lists"("organizationId", "name");
CREATE INDEX "price_lists_organizationId_idx" ON "price_lists"("organizationId");
CREATE INDEX "price_items_priceListId_isActive_idx" ON "price_items"("priceListId", "isActive");

ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIAgentConfig" ADD CONSTRAINT "AIAgentConfig_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
