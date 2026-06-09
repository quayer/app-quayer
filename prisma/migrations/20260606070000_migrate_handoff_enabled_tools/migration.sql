-- Fase 2 do handoff unificado: migração de DADOS (DML, sem DDL).
-- Garante que todo agente que dependia dos aliases notify_team/dispatch_to_agent
-- passe a ter transfer_to_human no enabledTools — preparando a remoção dos aliases
-- (próximo PR) sem que nenhum agente perca a capacidade de handoff.
--
-- NÃO-DESTRUTIVO: só faz array_append (não remove os nomes de alias; isso fica
-- para o passo final, depois que os aliases saírem do código).
-- IDEMPOTENTE: o WHERE exclui quem já tem o canônico, então reaplicar é no-op.
-- Equivale a scripts/migrate-handoff-tools.ts no modo padrão (sem --drop-aliases).

UPDATE "AIAgentConfig"
SET "enabledTools" = array_append("enabledTools", 'transfer_to_human')
WHERE ('notify_team' = ANY ("enabledTools") OR 'dispatch_to_agent' = ANY ("enabledTools"))
  AND NOT ('transfer_to_human' = ANY ("enabledTools"));
