-- M2 — Materialização do pricing no runtime: campos novos em price_lists/price_items
-- para a saga de deploy gravar o que o card de preço (Onda B) coletou e o get_pricing
-- usar (estilo de divulgação, valor mínimo, faixa 'average', foto do item).
-- Aditivo: defaults/nullable, sem backfill, sem data-loss.

ALTER TABLE "price_lists" ADD COLUMN "disclosureStyle" TEXT NOT NULL DEFAULT 'exact';
ALTER TABLE "price_lists" ADD COLUMN "minTicketCents" INTEGER;

ALTER TABLE "price_items" ADD COLUMN "priceMaxCents" INTEGER;
ALTER TABLE "price_items" ADD COLUMN "imageUrl" TEXT;
