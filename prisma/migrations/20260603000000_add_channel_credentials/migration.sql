-- Wave 2 — Jornada de Canais (3 opções)
-- WhatsApp Cloud API: verify token do webhook (Meta GET challenge)
-- Instagram Direct: credenciais manuais (sem parceria oficial Meta)
-- Colunas nullable — não afetam Connections existentes (UAZAPI).

-- AlterTable
ALTER TABLE "connections" ADD COLUMN "cloud_api_verify_token" TEXT;
ALTER TABLE "connections" ADD COLUMN "ig_account_id" TEXT;
ALTER TABLE "connections" ADD COLUMN "ig_page_access_token" TEXT;
ALTER TABLE "connections" ADD COLUMN "ig_app_secret" TEXT;
ALTER TABLE "connections" ADD COLUMN "ig_verify_token" TEXT;
