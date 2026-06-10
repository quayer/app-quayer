-- Fix de drift schema↔banco (homol/prod) — 2026-06-10
--
-- Contexto: o snapshot init (20250101000000_init) é PULADO pelo prisma/migrate.js
-- em DBs existentes, então colunas que só existem no snapshot nunca chegaram a
-- homol/prod. Além disso, 20260605000400_add_config_hash criou a coluna em
-- snake_case (config_hash) mas o campo no schema NÃO tem @map — o Prisma Client
-- espera "configHash". Efeitos em homol (comprovados por log/SQL):
--   - prisma.chatSession.findFirst sem select quebra ("column does not exist")
--   - TODA gravação de agent_runtime_decisions falha desde 2026-06-05
--     (observabilidade morta) e claimRuntimeTurn fail-open (dedup desligado)
-- Idempotente de propósito: precisa valer em homol, prod E em DBs locais que
-- já tenham qualquer um dos dois estados.

-- 1) ChatSession.pinnedAgentVersion (existia só no snapshot init)
ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "pinnedAgentVersion" INTEGER;
CREATE INDEX IF NOT EXISTS "ChatSession_pinnedAgentVersion_idx"
  ON "ChatSession" ("pinnedAgentVersion");

-- 2) agent_runtime_decisions: config_hash (snake_case, errado) -> configHash
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'agent_runtime_decisions'
               AND column_name = 'config_hash')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'agent_runtime_decisions'
               AND column_name = 'configHash') THEN
    ALTER TABLE "agent_runtime_decisions" RENAME COLUMN "config_hash" TO "configHash";
  ELSE
    ALTER TABLE "agent_runtime_decisions" ADD COLUMN IF NOT EXISTS "configHash" TEXT;
  END IF;
END $$;
