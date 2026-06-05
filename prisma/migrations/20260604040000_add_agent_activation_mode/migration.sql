-- Orayon — ACTIVATION MODES no ingest de mensagens.
-- Controla QUAIS mensagens inbound (IN) disparam a IA, por agente.
-- AIAgentConfig é PascalCase (sem @@map) → tabela public."AIAgentConfig".
-- Backward-compat: DEFAULT 'all' = comportamento atual (toda inbound dispara).
-- Colunas idempotentes (IF NOT EXISTS) para tolerar replays do migrate.

-- ── AIAgentConfig: modo de ativação + keywords ───────────────────────────────
ALTER TABLE "AIAgentConfig"
  ADD COLUMN IF NOT EXISTS "activationMode" TEXT NOT NULL DEFAULT 'all';

ALTER TABLE "AIAgentConfig"
  ADD COLUMN IF NOT EXISTS "activationKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
