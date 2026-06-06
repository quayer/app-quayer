-- Idempotência durável de turno do agente.
-- Coluna nullable + índice único: Postgres permite múltiplos NULL, então turnos
-- sem id de webhook (playground/builder) e linhas pré-existentes coexistem sem
-- backfill. Um 2º dispatch do mesmo turno (mesma chave) colide no índice único.

-- AlterTable
ALTER TABLE "agent_runtime_decisions" ADD COLUMN "decisionIdempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "agent_runtime_decisions_decisionIdempotencyKey_key" ON "agent_runtime_decisions"("decisionIdempotencyKey");
