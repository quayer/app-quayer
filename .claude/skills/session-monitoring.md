---
Criado: 2026-06-09
Atualizado: 2026-06-09
Revisar em: mudança em agent_runtime_decisions, logs controllers ou saga de deploy
Relacionados:
  - .claude/skills/quayer-builder.md
  - .claude/skills/infra.md
  - docs/infra/BASELINES.md
---

# Skill: Session Monitoring — auditoria de jornada end-to-end

Auditar QUALQUER sessão (builder ou runtime WhatsApp) de ponta a ponta para mapear
a jornada real do usuário, achar erros e listar oportunidades de melhoria. Usar
sempre que o pedido envolver "monitorar sessão", "auditar jornada", "por que o
agente respondeu X", "acompanhar erro em homol/prod".

## Fontes de verdade (em ordem de uso)

| Fonte | O que tem | Como acessar |
|---|---|---|
| `agent_runtime_decisions` | Observabilidade POR TURNO do runtime (modelo roteado, tools chamadas, custo, configHash, traceId) — sem FK, sobrevive a deletes | SQL via MCP Supabase: `SELECT * FROM agent_runtime_decisions WHERE "sessionId" = $1 ORDER BY "createdAt"` |
| `builder_*` (BuilderProjectMessage, BuilderToolCall, BuilderContextSnapshot, BuilderDeployment) | Jornada DESIGN-TIME: cada mensagem do meta-agente, tool calls (propose_*), snapshots do builderState, deploys | SQL via MCP Supabase, filtrar por `projectId`/`conversationId` |
| Controllers `logs` + `logs-sse` | Logs estruturados da app (8 actions) | `GET /api/v1/logs` (authProcedure) ou SQL |
| `KnowledgeSource.status/error` | Falhas de ingestão de fontes ("pending" eterno = bug clássico) | SQL: `SELECT id, status, error FROM knowledge_sources WHERE "organizationId" = $1` |
| `chat_sessions` | aiBlockedUntil/aiBlockReason (cost cap), takeover de operador | SQL |
| Sentry/OTel | Stack traces, p95 | dashboard Sentry (telemetry em src/server/services/telemetry) |

**traceId é a chave de correlação** (QH-13): nasce no webhook/SSE e atravessa
jobs BullMQ (`_trace` no payload), runtime e logs. Sempre extrair o traceId do
primeiro evento e seguir por ele.

## Protocolo de auditoria de uma sessão (builder)

1. Identificar `projectId` + `conversationId` (perguntar ou buscar por org/data).
2. Reconstituir a linha do tempo: mensagens (`builder_project_messages`),
   tool calls (`builder_tool_calls`) e snapshots de state na ordem cronológica.
3. Para cada card submetido: conferir o patch aplicado no builderState
   (campo owned vs proposed) e se o step-engine avançou (`nextPendingStep`).
4. Fontes: conferir `knowledge_sources.status` + espelho
   `sourceIngestion.imagesStatus` no builderState (fotos) + `proposed` vs `owned`.
5. Prompt: comparar `BuilderPromptVersion` gerada vs validador
   (`validators/whatsapp-prompt-anatomy.ts` — 10 seções). Registrar seções reprovadas.
6. Deploy: `builder_deployments` — steps executados, falhas, compensações.
7. Produzir relatório: jornada passo-a-passo → erros (com evidência) →
   oportunidades de melhoria priorizadas (impacto × esforço).

## Protocolo de auditoria de uma sessão (runtime WhatsApp)

1. Identificar `sessionId`/`contactPhone` (mascarar o telefone em qualquer output).
2. `agent_runtime_decisions` ordenado por data: para cada turno — modelo, tools,
   custo acumulado, latência.
3. Mensagens (`messages`) inbound/outbound na mesma janela; conferir dedup,
   typing indicator, rate limit (429s nos logs do webhook).
4. Handoffs: `transfer_to_human` → Department/roleta → notificação 6A enviada?
5. Custo: somar `totalAiCost` vs cap (QH-03); sessões bloqueadas
   (`aiBlockedUntil IS NOT NULL`) merecem atenção.

## Acesso a homol

- Logs de DB/API: MCP Supabase (`get_logs`, `execute_sql`) — projeto homol.
- Smoke/synthetic: `.github/workflows/smoke-homol.yml` e `synthetic-monitor.yml`.
- Baselines de performance: `docs/infra/BASELINES.md` §8 (comparar p95).

## Regras

- NUNCA logar/exibir telefone completo, tokens ou API keys no relatório
  (usar `maskPhone` de `src/lib/webhook/mask.ts` como referência de formato).
- Toda consulta SQL de negócio filtrada por `organizationId`.
- Relatório final sempre com: jornada (timeline), erros (evidência + severidade),
  melhorias (priorizadas), e queries usadas (reprodutibilidade).
