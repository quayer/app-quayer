-- Custo de serviços externos por turno (STT/TTS/embedding) em JSONB.
-- Additive, nullable: linhas existentes ficam NULL, sem backfill, sem data-loss.

-- AlterTable
ALTER TABLE "agent_runtime_decisions" ADD COLUMN "extServiceCosts" JSONB;
