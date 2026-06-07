-- Fase 2 (final) do handoff unificado: remove os NOMES MORTOS dos aliases
-- notify_team/dispatch_to_agent do enabledTools, agora que as tools foram
-- removidas do código (a capacidade vive em transfer_to_human via routing).
--
-- Roda DEPOIS de 20260606070000 (que adicionou transfer_to_human a esses agentes),
-- então nenhum agente perde a capacidade de handoff.
-- DATA-ONLY (DML), IDEMPOTENTE (array_remove de elemento ausente é no-op; o WHERE
-- limita às linhas afetadas). NÃO toca a AÇÃO de qualificação 'notify_team'
-- (essa vive no builderState/cards, não em AIAgentConfig.enabledTools).

UPDATE "AIAgentConfig"
SET "enabledTools" = array_remove(array_remove("enabledTools", 'notify_team'), 'dispatch_to_agent')
WHERE 'notify_team' = ANY ("enabledTools") OR 'dispatch_to_agent' = ANY ("enabledTools");
