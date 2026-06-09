-- Melhoria #2 do handoff: horário comercial materializado no agente de runtime.
-- O builderState (card business_hours) é copiado para esta coluna no deploy
-- (materialize-team), e o transfer_to_human usa computeBusinessState para devolver
-- `atendimento` (status + orientacao) — o agente diz ao lead quando a equipe responde.
-- Aditivo, nullable, JSONB. Sem backfill (agentes sem horário ficam NULL = sem `atendimento`).

ALTER TABLE "AIAgentConfig" ADD COLUMN "businessHours" JSONB;
