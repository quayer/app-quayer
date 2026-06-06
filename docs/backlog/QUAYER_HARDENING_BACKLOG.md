---
Criado: 2026-06-04
Atualizado: 2026-06-05
Revisar em: ao concluir cada fase (P0→P3)
Relacionados:
  - src/server/ai-module/ai-agents/
  - src/server/ai-module/builder/
  - docs/ERD.md
  - prisma/schema.prisma
---

# Quayer Hardening Backlog — "Wave Brutal"

Backlog de melhorias derivado da análise comparativa **Quayer (orquestrador Builder + runtime ai-agents)** vs **Orayon.Profissoes** (SDR Python maduro, usado como referência de produção).

> **Princípio de implementação:** módulos novos e isolados (**≤200 linhas/arquivo**, split por service/handler), preferir **Redis + reuso de campos existentes** a novas migrations. `Message.waMessageId` já é `@unique`; `ChatSession.totalAiCost` já acumula custo/sessão; `AgentRuntimeDecision` já registra telemetria por turno. Só `config_hash` (QH-11) exige migration nova.

## Legenda
- **Prioridade:** P0 (risco de produção) · P1 (concorrência/economia) · P2 (produto) · P3 (compliance/obs)
- **Schema:** ❌ sem migration · ⚠️ migration pequena
- **Estado-alvo nesta wave:** ✅ pronto+testado · 🧱 scaffold funcional + ticket

---

## P0 — Resiliência de borda

### QH-01 · Idempotência de webhook (dedup por `waMessageId`)
- **Problema:** retry/timeout da UAZAPI reentrega o mesmo webhook → agente responde 2x ao lead. Hoje só há `bot-echo-guard`.
- **Solução:** gate de idempotência no início do pipeline inbound. Redis `SET NX` em `wa:dedup:{connectionId}:{waMessageId}` (TTL 24h) como fast-path; `Message.waMessageId @unique` como durabilidade (insert-first). Se já visto → drop silencioso + log.
- **Módulos:** `ai-agents/infra/idempotency.service.ts` (+ test). Integração em `inbound-pipeline.service.ts`.
- **Schema:** ❌ (reusa unique existente) · **Alvo:** ✅
- **Aceite:** mesmo `waMessageId` processado 2x → 1 resposta. Teste cobre concorrência (2 chamadas simultâneas).

### QH-02 · Rate limit de saída (token bucket Redis)
- **Problema:** só há backoff nas chamadas de LLM; nada limita mensagens **enviadas ao WhatsApp** → risco de ban do número.
- **Solução:** token bucket Lua atômico no Redis. 3 buckets: por instância (60 msgs/min), cooldown por contato (0,5 msg/s), por org (1000/h). Fail-open se Redis cair.
- **Módulos:** `ai-agents/infra/rate-limit.service.ts` (+ test). Integração no ponto de envio outbound (UAZ client).
- **Schema:** ❌ · **Alvo:** ✅
- **Aceite:** 100 envios em rajada para 1 instância → throttle a 60/min; buckets independentes por instância/contato/org.

### QH-03 · Hard cap de custo $ por sessão
- **Problema:** runtime só limita tokens do contexto, não o gasto acumulado. Loop de prompt-injection escala custo.
- **Solução:** gate antes da chamada LLM em `prepareAgentCall`. Lê `ChatSession.totalAiCost`; se ≥ limite (default $2.00, configurável por org/agente) → bloqueia turno, seta `aiBlockedUntil`/`aiBlockReason`, notifica. Contador Redis O(1) como fast-path.
- **Módulos:** `ai-agents/infra/hard-caps.service.ts` (+ test). Integração em `agent-runtime.service.ts`.
- **Schema:** ❌ (reusa `totalAiCost`, `aiBlockedUntil`) · **Alvo:** ✅
- **Aceite:** sessão que excede limite não chama LLM; retorna razão clara; limite configurável.

---

## P1 — Concorrência + economia

### QH-04 · Serialização per-contato (advisory lock)
- **Problema:** 2 mensagens próximas do mesmo lead → 2 turnos concorrentes → histórico/resposta fora de ordem. `buffer-concat` mitiga parcialmente.
- **Solução:** `pg_try_advisory_xact_lock(hashtext(org:contactPhone))` em volta do turno. Não-bloqueante: se travado, re-enfileira. Auto-release no commit. No-op em ambiente de teste sem PG.
- **Módulos:** `ai-agents/infra/contact-lock.service.ts` (+ test). Integração no entrypoint do turno.
- **Schema:** ❌ · **Alvo:** ✅
- **Aceite:** 2 turnos simultâneos do mesmo contato serializam; contatos diferentes não bloqueiam.

### QH-05 · Model router cost-aware (mini vs full)
- **Problema:** um modelo único para todo turno. Orayon relata −30% custo roteando por intent.
- **Solução:** função pura `modelForTurn(prevDecision)`. Intents baratos (small_talk, qualificação) → modelo mini; calendar/handoff/raciocínio → full. Deriva intent de `toolsCalled[]` do turno anterior (já em `AgentRuntimeDecision`). Desligável por env.
- **Módulos:** `ai-agents/services/model-router.service.ts` (+ test). Integração na seleção de modelo.
- **Schema:** ❌ · **Alvo:** ✅
- **Aceite:** turno de small-talk usa mini; turno com calendar usa full; flag desliga roteamento.

### QH-06 · Circuit breaker por provider
- **Problema:** só há cooldown fixo de 5min. Sem estados CLOSED/OPEN/HALF_OPEN.
- **Solução:** evoluir `retry-with-fallback` com state machine Redis `circuit:{provider}:{model}`. 5 falhas/60s → OPEN (300s) → HALF_OPEN → CLOSED. Fail-open se Redis cair.
- **Módulos:** `ai-agents/infra/circuit-breaker.service.ts` (+ test). Integração no fallback existente.
- **Schema:** ❌ · **Alvo:** ✅
- **Aceite:** provider com 5 falhas seguidas abre por 5min e salta direto pro fallback; meio-aberto testa 1 chamada.

---

## P2 — Produto e diferencial

### QH-07 · Ferramentas de gestão do agente no Orquestrador Builder (web)
> **Revisado (2026-06-05):** Copilot por WhatsApp **descartado a pedido**. As boas ideias do copilot do Orayon migram para o **Builder web**, onde o dono já edita o agente. O órfão `src/lib/webhook/operator-commands.ts` (adiantado no P0) foi **removido**.
- **Problema:** o Builder hoje regenera o prompt inteiro; falta edição cirúrgica, ensino de conhecimento, undo e visão de desempenho.
- **Solução (novas tools do meta-agente, padrão `builder/tools/`):**
  - `edit_prompt_section` — add/replace/remove uma regra, exemplo (few-shot) ou limitação, sem regenerar tudo (evolui o atual `adjust_prompt_tone`).
  - `teach_agent` — ingerir conhecimento (URL/texto/PDF) na `KnowledgeCollection` do agente (RAG) pelo chat do Builder.
  - `revert_prompt` — voltar para uma `BuilderPromptVersion` anterior (undo/rollback).
  - `agent_insights` — resumo de conversas/leads/custo recentes do agente (consolida ver_conversas/ver_lead/resumo_dia do Orayon, lendo `AgentRuntimeDecision` + `ChatSession`).
- **Módulos:** `builder/tools/{edit-prompt-section,teach-agent,revert-prompt,agent-insights}.tool.ts` + registro no toolset.
- **Schema:** ❌ (reusa `BuilderPromptVersion`, `KnowledgeCollection`, `AgentRuntimeDecision`) · **Alvo:** 🧱 scaffold funcional + testes dos handlers
- **Aceite:** cada tool registrada no Builder toolset, handler lê/grava nos modelos certos, validação Zod, teste unitário.

### QH-08 · Preview fiel (dry-run do runtime real)
- **Problema:** `run_playground_test` é caminho paralelo ao runtime → pode divergir do que roda em produção.
- **Solução:** unificar — playground chama `processAgentMessageStream` em modo `playground` (já existe) com memória/tools mockadas e zero side-effects.
- **Módulos:** `builder/services/faithful-preview.service.ts`; ajustar tools `run-playground-test`/`run-prompt-preview`.
- **Schema:** ❌ · **Alvo:** ✅ (se viável) / 🧱
- **Aceite:** preview usa o mesmo motor do runtime; nenhum write/DB/envio real ocorre.

### QH-09 · TTS outbound (resposta em áudio)
- **Problema:** já há STT inbound (Deepgram); falta fechar o loop com áudio de resposta.
- **Solução (scaffold):** serviço TTS (ElevenLabs/Deepgram BYOK) → gera áudio do reply → upload media UAZ. Opt-in por agente/intent. Split por chunk.
- **Módulos:** `ai-agents/outbound/tts.service.ts` (+ test).
- **Schema:** ❌ (config em `AIAgentConfig`/customFields) · **Alvo:** 🧱 scaffold + ticket
- **Aceite (scaffold):** serviço gera áudio a partir de texto (BYOK), interface de upload definida, flag opt-in.

### QH-10 · Playbooks por nicho + guardrails de profissão regulada
> **Adiado (2026-06-05):** removido do P2 a pedido — vai para wave futura. Permanece no backlog.
- **Problema:** `niche-researcher` é 100% dinâmico; sem biblioteca versionada nem guardrails regulados (saúde/jurídico).
- **Solução:** playbooks Markdown+frontmatter (`required_fields`, `regulated: true`) carregados pelo Builder. `regulated` injeta guardrails no prompt e na validação (liga aos validators `blacklist`/`journey`).
- **Módulos:** `builder/playbooks/` (loader + 3-5 playbooks seed) + hook nos validators.
- **Schema:** ❌ · **Alvo:** 🧱 scaffold + seeds
- **Aceite:** loader lê playbooks; `regulated:true` injeta guardrails; ≥3 nichos seed (genérico, dentista, advogado).

---

## P3 — Compliance / observabilidade

### QH-11 · `config_hash` determinístico no turno
- **Problema:** `AgentRuntimeDecision` grava `promptVersionId` mas não o hash da config efetiva → drift/rollback difícil.
- **Solução:** `configHash = sha256(systemPrompt + tools + model params)` por turno, gravado na decisão. Permite agrupar turnos por config e detectar regressão.
- **Módulos:** `ai-agents/services/config-hash.service.ts`; coluna `configHash` em `AgentRuntimeDecision`.
- **Schema:** ⚠️ 1 coluna (`configHash String?`) · **Alvo:** ✅ módulo + migration gerada (não aplicada em prod)
- **Aceite:** cada decisão registra hash estável; mesma config → mesmo hash.

### QH-12 · Criptografia em repouso dos tokens de calendar
- **Problema:** tokens OAuth de calendar possivelmente em claro no DB.
- **Solução:** cifrar `CalendarConnection` tokens (AES-GCM/Fernet-equiv) com chave em env; transparente no client. Reusa `channel-credentials.crypto` se existir.
- **Módulos:** `ai-agents` ou `core` crypto helper + wrap no acesso ao token.
- **Schema:** ❌ (mesma coluna, valor cifrado) · **Alvo:** ✅ (se já houver helper) / 🧱
- **Aceite:** token gravado cifrado; leitura decifra; dump de DB não vaza token em claro.

### QH-13 · Tracing distribuído cross-worker
- **Problema:** sem trace único webhook→pipeline→runtime→outbound.
- **Solução:** propagar `traceId`/`sentry_trace` da entrada do webhook pelos jobs BullMQ até o envio; spans filhos (LLM/HTTP/DB). Reusa telemetry service (Sentry/OTel).
- **Módulos:** `services/telemetry` helpers + propagação no produtor/consumidor de jobs.
- **Schema:** ❌ · **Alvo:** 🧱 scaffold + ticket
- **Aceite (scaffold):** traceId atravessa ≥1 hop de job; documentado o caminho completo.

---

## Execução (multi-workflow)

| Fase | Workflow | Itens | Estratégia |
|---|---|---|---|
| P0 | `quayer-hardening-p0` | QH-01/02/03 | 3 módulos isolados em paralelo → 1 agente de integração + `tsc` |
| P1 | `quayer-hardening-p1` | QH-04/05/06 | idem |
| P2 | `quayer-hardening-p2` | QH-07/08/09/10 | scaffold em paralelo + tickets |
| P3 | `quayer-hardening-p3` | QH-11/12/13 | módulos + migration gerada |

**Regra de costura:** agentes de *build* só criam arquivos novos (ownership disjunto). Edição dos arquivos centrais (`inbound-pipeline.service.ts`, `agent-runtime.service.ts`) é feita por **um** agente de integração por fase, sequencial. Validação `npx tsc --noEmit` + `npm run lint` ao fim de cada fase. Migrations são **geradas e validadas, não aplicadas em produção**.

---

## Status de execução (atualizado 2026-06-06)

### ✅ Sessão 2026-06-06 — waves de hardening (multi-workflow)
- **RT-04/05/09/10** (runtime): fallback gracioso em `ContextBudgetExhaustedError`, provider cooldown migrado p/ Redis, short-memory TTL atômico, token-budget como `StopCondition`. Commit `c83bbf6`.
- **QH-02 retry/dead-letter** (ver nota abaixo). Commit `c272243`.
- **Worker entrypoint** `scripts/start-workers.ts` — ativa os 3 workers (dev). Commit `e1fab02`. PROD pendente (ver nota abaixo).
- **QH-07d** `revert_prompt` tool (4ª/4 tools do Builder, undo/rollback não-destrutivo). **QH-09** testes do caminho TTS outbound. **QH-13** trace cross-worker no hop do outbound-retry. Commit `8f4df9f`.
- **Auditoria (Wave 1):** 74 itens verificados — 49 done, 6 inert, **0 bugs**. Gaps remanescentes: ativação prod dos workers, **QH-12** (tokens em texto plano — `encryptToken` nunca chamado, segurança), normalização de encoding UTF-16→UTF-8.
- **Validação:** `tsc -p tsconfig.json` 0 · `eslint` 0 · pre-commit vitest verde em todos os commits.

### ✅ P0 concluído e validado
- QH-01/02/03 implementados como módulos isolados em `src/server/ai-module/ai-agents/infra/` (idempotency, rate-limit, hard-caps).
- Integração: webhook `uazapi/route.ts` (dedup 2ª camada por `connectionId:waMessageId`), `outbound.service.ts` (rate limit por instância 60/min), `agent-runtime.service.ts` (hard cap gate antes do LLM + acúmulo de custo no Redis).
- **Validação local:** `npx tsc --noEmit` exit 0 · `npm run lint` ok · Vitest **46/46** (idempotency 13, rate-limit 15, hard-caps 18).
- **Bônus/scope-creep:** `src/lib/webhook/operator-commands.ts` (comandos `@fechar`/`@ia`/`@blacklist`/`@whitelist` por WhatsApp) foi adiantado — é um pedaço do **QH-07**. Hoje está **órfão** (parser não chamado no webhook). A integrar+testar no P2/QH-07.
- **Limitação conhecida (QH-02):** ~~ao estourar o rate limit de instância, a resposta retorna `rateLimited=true` sem reenfileiramento~~ — **resolvido (2026-06-05).** Ao estourar o limite de **instância**, `sendAgentResponse` agenda um retry com `delay=retryAfterMs` (`outbound-retry.queue.ts`, fila BullMQ `quayer:outbound-retry`, piso 1s/teto 60s), com contador `attempt` e cap `MAX_RETRY_ATTEMPTS=5`; ao esgotar (ou sem scheduler injetado, ou falha ao agendar) cai na dead-letter existente (`outbound:deadletter`). Só o escopo **instância** é retentado — os limites de **contato/org** são throttles de produto deliberados (drop-by-design). Worker registrado em `registerAllWorkers`.
  - **Ativação dos workers (parcial — 2026-06-06):** criado o entrypoint dedicado `scripts/start-workers.ts` (+ `npm run start:workers`) que chama `registerAllWorkers` e agenda o cron do session-close, com graceful shutdown. Sobe os 3 workers (`outbound-retry`, `source-enrich`, `session-close`) em qualquer ambiente com o source + `tsx` (dev/local/homol-com-source).
    - **Pendência de PROD (precisa decisão + aprovação de infra):** a imagem de produção é um **Next standalone** (Dockerfile runner copia só `.next/standalone`, sem `src/` nem `tsx`), então `tsx scripts/start-workers.ts` **não roda na imagem prod como está**. Opções: (a) bundlar o entrypoint (esbuild/tsup) num JS único copiado pro runner + serviço `worker` no compose com `command: node worker.js`; (b) imagem de worker separada com source+deps; (c) bootar via `instrumentation.ts` no processo Next (contraria o design "nunca no runtime Next"). Em dev: `OUTBOUND_RETRY_SYNC=1` processa inline sem worker.
