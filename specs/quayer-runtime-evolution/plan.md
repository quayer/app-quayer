---
Criado: 2026-05-11
Atualizado: 2026-05-11
Revisar em: após sprint 1 concluído
Relacionados:
  - CLAUDE.md
  - src/server/ai-module/builder/
  - src/server/ai-module/ai-agents/agent-runtime.service.ts
  - .claude/projects/c--Users-gabri-OneDrive-Documentos----Projetos-app-quayer/memory/project_api_audit_2026_05.md
---

# Quayer Runtime + Builder Evolution — Plano de Melhorias

> Síntese de tudo discutido + investigação multi-agente do source leak do Claude Code (4 áreas: tools, context/memory, API/cache, multi-agent coordination) + análise das edge functions do projeto `produto-granvinhas`.
>
> Cobre **dois lados** do produto:
> - 🤖 **Runtime do agente publicado** (WhatsApp em produção)
> - 🛠️ **Builder AI** (meta-agente design-time + UI)

**Premissa:** spec formal ainda não existe. Este plano é o produto consolidado da conversação e dos relatórios dos sub-agentes. Após aprovação, rodar `/spec` para formalizar e `/break` para decompor em tarefas.

---

## Objetivo

Transformar o **runtime de agentes WhatsApp do Quayer** (hoje minimalista) e o **Builder AI** (hoje sem UX wins importantes) em um sistema production-grade com:
- Otimização agressiva de tokens (prompt caching, microcompact, deferred tools)
- Memória persistente e contextual (curto + longo prazo + vector)
- Multi-agente coordenado com isolation
- Observabilidade fina (cache hits, cost real, retry analytics, tool calls dashboard)
- Resiliência (bot-echo guard, retry+fallback, idempotency, dead-letter)
- Builder UI completo (A/B test, rollback, custom tool tester, MCP channel)

---

# Roadmap por prioridade

## 🔴 P0 — Bloqueadores runtime (sem isso o agente publicado não funciona)

### 1. Webhook UAZapi inbound → runtime
**O que:** Endpoint `POST /api/v1/webhooks/uazapi` que recebe mensagem, resolve `Connection → aiAgentId`, upserta `ChatSession` + `Message INBOUND`, chama `processAgentMessage`, envia resposta via UAZ outbound.
**Por quê:** A saga de deploy do Builder cria instância UAZ + amarra ao agent, mas **não existe o handler que recebe a mensagem do cliente final**. Sem isso, todo o resto é teatro.
**Benefício:** Fecha o loop end-to-end. Agente publicado responde de verdade.
**Inspiração:** padrão `process-message` do granvinhas (9 etapas em pipeline).

### 2. Controller `messages` registrado no router
**O que:** Criar `src/server/communication/messages/messages.controller.ts` com actions de listagem/envio + registrar em `igniter.router.ts`.
**Por quê:** Hoje `src/server/communication/messages/index.ts` está vazio. Sem isso, frontend não consegue ler/escrever mensagens.
**Benefício:** UI pode mostrar histórico, devs operam via Igniter type-safe.

### 3. Bot-echo guard Redis com TTL
**O que:** Após enviar via UAZ/Chatwoot, marcar `quayer:bot_msg:{orgId}:{messageId}` em Redis com TTL 120s. No webhook inbound, checar antes de processar.
**Por quê:** Chatwoot/CRMs não filtram eventos por origem — o eco da mensagem do bot volta como webhook OUT e seria reprocessado em loop.
**Benefício:** Evita loop infinito, custo dobrado, sessões corrompidas e race com humano no painel.
**Inspiração:** `process-callback/services/bot-echo-redis.ts` do granvinhas.

---

## 🟡 P1 — Custo & latência runtime (ganho imediato)

### 4. Prompt caching Anthropic `ephemeral` + TTL latching
**O que:** Adicionar `providerOptions.anthropic.cacheControl: { type: 'ephemeral' }` no system prompt e tools schema. Latch eligibility (5min vs 1h) no início da sessão.
**Por quê:** Hoje toda chamada paga input completo. System prompt do agente é estável entre turnos — caso perfeito de cache.
**Benefício:** **70–90% redução de input cost** em conversas longas. ROI em horas.
**Inspiração:** `src/services/api/claude.ts:358-434` (Claude Code).

### 5. Layered system prompt com cache boundary
**O que:** Estruturar system prompt em camadas: (a) **global cacheable** (identidade, tools, regras genéricas) (b) **session-specific** (contexto do contato, idioma, journey stage). Separar por marker `DYNAMIC_BOUNDARY`.
**Por quê:** Parte estática é idêntica entre todas as conversas de um agente. Reuso entre sessões = cache global.
**Benefício:** Cache hit cross-session. 1ª chamada paga ~5k tokens, próximas ~100 tokens cache_read.
**Inspiração:** `src/utils/api.ts:321-434` + `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` marker.

### 6. Auto-compact (cached + time-based) no runtime publicado
**O que:** Portar `compactMessages` do Builder para `processAgentMessage`. Dois triggers:
- **Cached MC**: quando histórico > N tool calls, deleta mais antigos via `cache_edits` (mantém prompt cache)
- **Time-based MC**: se gap > 30min desde última msg, substitui content de tool_results antigos por `[Old tool result content cleared]` (cache já frio mesmo)

**Por quê:** Sessões WhatsApp ficam idle horas. Quando cliente volta, prompt cache da Anthropic já expirou. Cleanup proativo.
**Benefício:** Conversas longas deixam de quebrar; tokens reaproveitados em sessões intermitentes.
**Inspiração:** `src/services/compact/microCompact.ts` — set `COMPACTABLE_TOOLS` define quais tool results são "barulho" descartável.

### 7. Cost tracking real com tiktoken + LiteLLM pricing
**O que:** Trocar estimativa `chars/4` por `js-tiktoken` real. Trocar `COST_TABLE` hardcoded por LiteLLM pricing dinâmico (background init).
**Por quê:** 20% impreciso em billing. Pricing Mai/2026 já diferente do hardcoded Mar/2026.
**Benefício:** Billing preciso, atualizado automaticamente, breakdown por system/user/history/tool calls.
**Inspiração:** `process-callback/services/cost-calculator.ts` + `pricing.ts` (granvinhas).

### 8. Truncamento de tool results > N chars
**O que:** Cada tool declara `maxResultSizeChars`. Excedeu → trunca com sufixo `…[truncated, X chars omitted]` antes de enviar ao LLM.
**Por quê:** Tool que retorna payload grande (search_contacts com 200 resultados, get_session_history sem limit) explode contexto.
**Benefício:** Previne explosão de contexto; modelo recebe sinal claro de que foi cortado.
**Inspiração:** Claude Code `Tool.ts` `maxResultSizeChars` (FileRead = Infinity, TodoWrite = 100k, Glob = 100k).

---

## 🟢 P2 — Memória runtime

### 9. Wire-up `memory.service.ts` Redis (US-029)
**O que:** Após cada turno, `pushToShortMemory` salva role+content. `loadShortMemory` é primeira fonte em `buildConversationContext` (fallback Postgres se Redis vazio).
**Por quê:** Service já existe e está pronto, mas **não é chamado** pelo runtime.
**Benefício:** Latência -50% no build de contexto; sobrevive a restart Postgres; já tem TTL 24h.

### 10. Auto-memory por contato (extração assíncrona)
**O que:** Sub-agente forked roda no fim de cada turno (não bloqueia resposta). Lê transcript, extrai fatos persistentes ("cliente prefere agendar terça", "tem alergia a X") → grava em tabela `ContactMemory` ou JSON em `Contact.preferences`. Cursor tracking via `lastMemoryMessageUuid` para não reprocessar.
**Por quê:** Hoje o agente "esquece" tudo entre sessões. Long-term memory por contato = experiência muito superior.
**Benefício:** Personalização real, agente "lembra" preferências.
**Inspiração:** `src/services/extractMemories/extractMemories.ts` + forked agent pattern.

### 11. Conditional skills (ativação por contexto)
**O que:** Skills com frontmatter `triggers: ['agendamento', 'preço']` ou `journey_stage: ['qualified']` ficam dormentes até o trigger acontecer. Quando ativadas, injetam guidelines extras no system prompt do turno.
**Por quê:** Hoje system prompt carrega tudo. Carregar contexto vertical (advocacia, barbearia, ecommerce) sob demanda.
**Benefício:** System prompt enxuto + adaptativo. Suporta múltiplas verticais sem inflar tokens.
**Inspiração:** `src/skills/loadSkillsDir.ts` (Claude Code) — path-based activation com gitignore patterns.

---

## 🔵 P3 — Tools inteligentes runtime

### 12. Deferred tools + ToolSearch para tools custom
**O que:** Quando agente tem >10 custom tools (webhook), só os **nomes** vão no prompt. Modelo invoca `tool_search` com `select:nome` ou keyword para puxar schema completo.
**Por quê:** Custom tools schema podem somar 10k+ tokens. Maioria das conversas não usa nenhuma.
**Benefício:** System prompt fica enxuto, agente pode ter biblioteca grande de tools sem custo fixo.
**Inspiração:** `src/tools/ToolSearchTool/` — keyword search com scoring (parts match=10, hint=4, desc=2).

---

## 🟣 P4 — Builder AI (design-time)

### 13. `@quayer/mcp-server` — canal MCP-first
**O que:** Construir o pacote `@quayer/mcp-server` que expõe tools `create_agent`, `deploy_agent`, `list_agents`, `update_prompt`, etc. via protocolo MCP, para o usuário operar o Builder de dentro do Claude Code/Cursor/qualquer cliente MCP.
**Por quê:** A skill `.claude/skills/quayer-builder.md` já assume esse canal mas **não foi construído**. Hoje o fluxo só existe na UI web.
**Benefício:** Devs operam Builder via terminal/IDE (DX premium); abre canal "API-first" da plataforma; viraliza por adoção em comunidades AI dev.
**Referência:** `docs/builder/MCP_CLI_ROADMAP.md`.

### 14. A/B test UI no Builder
**O que:** Painel para criar variantes de prompt com status `TESTING`, distribuir tráfego (hash de sessionId já implementado em `agent-runtime.service.ts:163-169`), comparar métricas (conversion, NPS, transfer_to_human rate) e promover vencedor.
**Por quê:** Runtime **já suporta** variants `TESTING` (split por hash determinístico) mas falta UI para criar/comparar/promover.
**Benefício:** Iteração orientada por dados, sem "achar" que prompt novo é melhor. Já tem 100% da infra backend.
**Esforço estimado:** 3 dias.

### 15. Rollback 1-clique no Builder UI
**O que:** Botão "Reverter para versão X" em cada `BuilderPromptVersion` listada. Chama tool `rollback_prompt_version` (já existe no catálogo do meta-agente) sem precisar conversar com o Builder.
**Por quê:** Handler já existe (`tools/rollback_prompt_version`), falta só UX. Hoje é caminho longo: abrir chat, pedir rollback, esperar meta-agente decidir.
**Benefício:** Recuperação rápida de regressão em produção. UX win imediato.
**Esforço estimado:** 2h.

### 16. Sticky version aviso UX
**O que:** Quando `ChatSession.pinnedAgentVersion ≠` versão ativa do agente (porque sessão fica travada 24h após pin), exibir badge "Sessão em versão antiga (v2, atual é v5)" + opção de force-upgrade.
**Por quê:** Hoje invisível — usuário vê comportamento inconsistente entre sessões.
**Benefício:** Debug muito mais simples + controle granular para support.
**Esforço estimado:** 3h.

### 17. Custom tool tester (sandbox)
**O que:** Antes de publicar um custom tool (webhook), permitir testar com payload mock direto na UI do Builder. Mostra request enviado, response, latência, validação Zod.
**Por quê:** Hoje o usuário só descobre que o webhook tá quebrado em produção (cliente reclama).
**Benefício:** Reduz incidentes pós-deploy; cliente desenvolvedor ganha confiança no produto.
**Esforço estimado:** 1 dia.

### 18. Coordinator mode no Builder (sub-agents paralelos)
**O que:** Habilitar `COORDINATOR_MODE` no system prompt do Builder. Spawn paralelo de sub-agents (niche-researcher + validator + prompt-writer) via `AgentTool({ run_in_background: true })`. Aggregar via `<task-notification>`.
**Por quê:** Hoje sub-agents do Builder rodam **sequenciais** (niche → prompt → validate). Em paralelo = -60% tempo de criação de agente.
**Benefício:** UX do Builder muito mais responsivo; usuário vê progresso de 3 workers em tempo real.
**Inspiração:** `src/coordinator/coordinatorMode.ts:80-110` (Claude Code).

---

## 🟠 P5 — Hardening complementar (resiliência + observabilidade)

### 19. `memoryWindow` dinâmico
**O que:** Em vez de N fixo por agente, calcular memoryWindow pelo orçamento de tokens disponível (descontando system + tools schemas).
**Por quê:** Agente com `memoryWindow: 20` pode estourar contexto se mensagens forem longas, ou desperdiçar quota se forem curtas.
**Benefício:** Aproveitamento ótimo do orçamento; previne `ContextBudgetExhaustedError`.

### 20. Long-term memory com vector store
**O que:** Embedding de mensagens em vector DB (pgvector — Supabase já suporta). Indexar por `contactPhone + organizationId`. Em `buildConversationContext`, recuperar top-K relevantes além das últimas N cronológicas.
**Por quê:** Complementa o #10 (auto-memory de fatos). Vector permite recall por similaridade ("o que ele falou sobre preços" sem ter data).
**Benefício:** Agente recupera contexto histórico relevante mesmo de 3 meses atrás.
**Esforço:** 1 semana.

### 21. Sumarização persistente ao fechar `ChatSession`
**O que:** Quando `ChatSession.status` vira `CLOSED`, sub-agente forked gera summary curto (200 palavras) e salva em `ChatSession.aiAgentContext`. Próxima sessão do mesmo contato carrega esse summary no system prompt.
**Por quê:** Diferente do #10 (fatos persistentes) e do #20 (vector). Aqui é "última conversa em 1 parágrafo" — ótimo para reabertura.
**Benefício:** Agente "lembra do contexto" da última conversa sem reprocessar histórico inteiro.

### 22. Tool result caching (memoize)
**O que:** Tools determinísticas (`send_pricing`, `get_business_hours`) são memoizadas com TTL configurável. Não bate webhook/DB se chamada com mesmo input em janela curta.
**Por quê:** Cliente em conversa pode pedir preço 3 vezes — não faz sentido chamar backend 3 vezes.
**Benefício:** -30% chamadas externas em tools determinísticas; latência menor.

### 23. Dashboard `BuilderToolCall` (telemetria)
**O que:** Tabela `BuilderToolCall` já existe no schema mas não tem UI. Construir dashboard que mostra: tools mais usadas, latência p50/p95, taxa de erro, custo por tool. Filtros por agente, por dia.
**Por quê:** Hoje impossível debugar "qual tool tá lenta" sem inspecionar logs Postgres.
**Benefício:** Observability barata; identifica gargalos pra otimizar.

### 24. Rate limit token/min por agente
**O que:** Budget de tokens/min por agente (configurável). Excedeu → enfileirar próxima mensagem ou retornar mensagem de "muito tráfego, aguarde".
**Por quê:** Hoje agente pode ser DDoS'ado com 1000 msgs/min e queimar BYOK do cliente.
**Benefício:** Proteção contra abuso/runaway cost.
**Diferente do #25** que para loop de raciocínio.

### 25. Token budget per-turn com diminishing returns
**O que:** Tracker por turno. Se `continuationCount >= 3 && delta < 500 tokens && lastDelta < 500` → stop com `diminishingReturns: true`.
**Por quê:** Previne loops infinitos no tool loop (atual `stopWhen: stepCountIs(5)` é limite duro mas não detecta "andou pouco").
**Benefício:** Para de queimar tokens em loop improdutivo. Claude Code citou "1.279 sessions com 50+ falhas queimando 250k API calls/dia" como motivação.
**Inspiração:** `src/query/tokenBudget.ts`.

### 26. Retry + fallback model
**O que:** Em 429/529, exponential backoff até 3 tentativas. Se persistir → fallback para Haiku (configurável por agente). Cooldown 5min no provider primário.
**Por quê:** Hoje runtime já tem cooldown ([agent-runtime.service.ts:90](src/server/ai-module/ai-agents/agent-runtime.service.ts#L90)) mas sem retry inteligente.
**Benefício:** Resiliência sem travar fila WhatsApp; degrada para Haiku em vez de devolver erro.
**Inspiração:** `src/services/api/withRetry.ts` (mas adaptar para timeout WhatsApp ~30s, não persistent mode CLI).

### 27. Prompt cache break detection
**O que:** Snapshot pre-call (system hash + tools hash + betas), análise post-response. Se `cache_read` cair >5% sem mudança detectada → log `cache_break` com motivo (TTL expiry vs server eviction vs prompt change).
**Por quê:** Sem isso, cache miss é invisível — só percebe pelo custo.
**Benefício:** Debug fino de regressões de cache; valida ROI do prompt caching (#4).
**Inspiração:** `src/services/api/promptCacheBreakDetection.ts`.

---

## ⚪ P6 — Backlog (oportunidades menores ou nicho)

| # | Melhoria | Benefício | Inspiração |
|---|---|---|---|
| 28 | Buffer Redis de concatenação (replace `setTimeout` bloqueante) | Cliente fragmenta msg → agente recebe consolidado | `process-message/services/buffer.ts` (com fix queue async) |
| 29 | Tag-based output (`[buttons:]`, `[list:]`, `[carousel:]`) | IA emite UI rica sem tool call estruturado | `process-callback/services/message-splitter.ts` |
| 30 | Language cascade resolver (5 fontes) | Multi-idioma sem pagar LLM detect por msg | `process-message/services/language-detector.ts` |
| 31 | `searchHint` curado em cada tool | ToolSearch matchea por intenção, não por palavra-chave do nome | `Tool.ts:373-378` |
| 32 | Structured output strict mode em tools state-mutating | LLM não inventa campos em `create_lead`, `send_message` | `Tool.ts:470-472` |
| 33 | System-reminder injection proativo após tool result | "Cliente está com 3min de idle", "WhatsApp window expira em 2h" sem queimar tokens | `Tool.ts:275` `criticalSystemReminder_EXPERIMENTAL` |
| 34 | `isConcurrencySafe()` em tools read-only (parallel exec) | Múltiplas leituras em paralelo dentro de 1 turno | `GlobTool.ts:76-87` |
| 35 | Idempotency key no webhook UAZ | Reenvio de webhook não duplica mensagem | granvinhas `wa_message_id` |
| 36 | Dead-letter queue para erros 500 do runtime | Não perder mensagens em falha do LLM | tabela `runtime_errors` |
| 37 | Vision/Audio cache por hash | Mesma imagem/áudio reprocessada = grátis | sha256(media_url) → result |
| 38 | Migrar `database.connection.create` → `instanceService` | Centralizar validação + events em service único | TODO em `create-instance.handler.ts:14-19` |
| 39 | Decisão sobre modelos dormentes (Invitation/Notification/Campaign) | Ressuscitar com controller ou deletar | `docs/deprecated/SCHEMA_DORMANT_MODELS.md` |

---

# Sprints sugeridos

### Sprint 1 (semana 1) — Fechar o loop runtime
- **#1** Webhook UAZapi inbound
- **#2** Controller messages registrado
- **#3** Bot-echo guard Redis

**Saída:** agente publicado responde mensagens reais de WhatsApp.

### Sprint 2 (semana 2) — Redução de custo
- **#4** Prompt caching ephemeral
- **#5** Layered system prompt com boundary
- **#7** Cost tracking tiktoken + LiteLLM
- **#8** Tool result truncation

**Saída:** -70% input cost, billing preciso.

### Sprint 3 (semana 3) — Memória runtime
- **#6** Auto-compact (cached + time-based)
- **#9** Wire-up memory.service Redis
- **#10** Auto-memory por contato (forked)
- **#15** Rollback 1-clique UI (2h, fica no resto da sprint)
- **#16** Sticky version aviso UX (3h)

**Saída:** agente "lembra" entre sessões, conversas longas estáveis, Builder com UX wins rápidos.

### Sprint 4 (semana 4) — Inteligência adaptativa runtime
- **#11** Conditional skills
- **#12** Deferred tools + ToolSearch
- **#25** Token budget diminishing returns
- **#26** Retry + fallback model

**Saída:** runtime resiliente, system prompt enxuto, multi-vertical.

### Sprint 5 (semana 5) — Builder estratégico
- **#14** A/B test UI no Builder
- **#17** Custom tool tester (sandbox)
- **#18** Coordinator mode no Builder

**Saída:** Builder ganha features estratégicas que diferenciam vs concorrentes (n8n, dify, etc).

### Sprint 6 (semana 6) — Memória avançada + observabilidade
- **#20** Long-term memory com vector store (pgvector)
- **#21** Sumarização persistente ao fechar `ChatSession`
- **#23** Dashboard `BuilderToolCall`
- **#27** Prompt cache break detection

**Saída:** observabilidade completa + memória de longo prazo.

### Sprint 7 (semana 7) — Canal MCP + hardening
- **#13** `@quayer/mcp-server`
- **#19** `memoryWindow` dinâmico
- **#22** Tool result caching
- **#24** Rate limit token/min por agente

**Saída:** canal API-first disponível; runtime à prova de DDoS.

### Backlog → P6 (#28-#39): puxar oportunisticamente conforme demanda

---

# Tabela executiva — Benefício em uma linha

## Runtime do agente publicado (12 itens core)

| # | Melhoria | Benefício resumido |
|---|---|---|
| 1 | Webhook UAZ inbound | Agente publicado realmente recebe mensagens |
| 2 | Controller messages | Frontend mostra histórico via API type-safe |
| 3 | Bot-echo guard | Sem loop infinito quando há Chatwoot/multi-channel |
| 4 | Prompt caching ephemeral | **-70-90% input cost** |
| 5 | Layered prompt | Cache global cross-session, 1ª chamada paga, próximas reusam |
| 6 | Auto-compact | Conversas longas e idle não quebram nem explodem custo |
| 7 | Cost tiktoken+LiteLLM | Billing preciso, pricing atualizado automaticamente |
| 8 | Tool result truncation | Previne explosão de contexto por tool ruidosa |
| 9 | Memory Redis | -50% latência de build de contexto |
| 10 | Auto-memory por contato | Agente lembra preferências entre sessões |
| 11 | Conditional skills | Multi-vertical sem inflar system prompt |
| 12 | Deferred tools | Biblioteca grande de tools sem custo fixo |

## Builder AI design-time (6 itens)

| # | Melhoria | Benefício resumido |
|---|---|---|
| 13 | `@quayer/mcp-server` | Canal API-first; devs operam Builder via terminal/IDE |
| 14 | A/B test UI | Iteração de prompt orientada por dados (infra já existe) |
| 15 | Rollback 1-clique | Recuperação rápida de regressão (2h de UX) |
| 16 | Sticky version aviso | Debug visível de sessões travadas em versão antiga |
| 17 | Custom tool tester | Testa webhook antes de publicar (reduz incidentes) |
| 18 | Coordinator mode | -60% tempo de criação de agente (sub-agents paralelos) |

## Hardening complementar (9 itens)

| # | Melhoria | Benefício resumido |
|---|---|---|
| 19 | `memoryWindow` dinâmico | Aproveitamento ótimo do orçamento de tokens |
| 20 | Long-term memory vector | Recall por similaridade (não só cronológico) |
| 21 | Summary ao fechar sessão | "Última conversa em 1 parágrafo" carregado na próxima |
| 22 | Tool result caching | -30% chamadas externas em tools determinísticas |
| 23 | Dashboard BuilderToolCall | Observabilidade fina de tools (latência, erro, custo) |
| 24 | Rate limit token/min | Proteção contra DDoS/runaway BYOK |
| 25 | Token budget diminishing | Para loops improdutivos (Claude Code: 250k API calls/dia salvas) |
| 26 | Retry + fallback model | Resiliência sem travar fila WhatsApp |
| 27 | Prompt cache break detection | Debug fino de cache miss; valida ROI do #4 |

---

# Aprovação necessária (conforme CLAUDE.md)

- [ ] **Mudanças em `prisma/schema.prisma`**:
  - `ContactMemory` (#10) ou JSON em `Contact.preferences`
  - `runtime_errors` (#36)
  - extensão `pgvector` + tabela embeddings (#20)
- [ ] **Mudanças em `src/middleware.ts`**: nenhuma prevista (webhooks UAZ vão em `/api/v1/webhooks/*` que já é público)
- [ ] **Novas dependências npm**:
  - `js-tiktoken` ou `@anthropic-ai/tokenizer` — para #7
  - `ignore` (gitignore patterns) — para #11
  - `pgvector` SDK — para #20
  - `@modelcontextprotocol/sdk` — para #13
- [ ] **Novo pacote npm publicado**:
  - `@quayer/mcp-server` (#13) — workspace separado, publicação NPM
- [ ] **Deleção de arquivos**: nenhuma neste plano (decisão de #39 vem depois)

---

# Riscos & trade-offs

| Risco | Mitigação |
|---|---|
| Prompt caching com modelo errado → cache miss invisível | Implementar **#27** (cache break detection) junto |
| Auto-compact agressivo elimina contexto necessário | `keep_last: 5` configurável + `COMPACTABLE_TOOLS` curada (não compacta memória/skill) |
| Auto-memory salva ruído/PII | Sub-agent com prompt enxuto + tabela `ContactMemory` com TTL + opt-out por contato |
| Bot-echo TTL 120s pode ser baixo p/ Chatwoot lento | TTL configurável por `Connection.config.botEchoTtlMs` |
| Webhook UAZ sem rate limit = DDoS | Upstash rate-limiter por phone_number + auth via secret header |
| Deferred tools confunde modelo treinado sem isso | Habilitar com feature flag por org, gradual rollout |
| `@quayer/mcp-server` exige auth seguro | API key por org (já existe em `core/api-keys/`) + scopes granulares |
| A/B test sem amostra estatística → decisão errada | Mínimo 100 sessions por variant antes de "promover" |
| Vector store (#20) cresce sem limite | Retention policy: deletar embeddings > 6 meses sem uso |
| Coordinator mode com sub-agents pode estourar custo | Budget per-agent (#24 cobre) + max depth 1 |

---

# Próximo passo

```
/spec   # formalizar requisitos detalhados por melhoria (cada item vira sub-spec)
/break  # decompor cada melhoria em tasks atômicas com acceptance criteria
```

**Sugestão de ordem:**
1. Aprovar este plano consolidado
2. `/spec` focado em **Sprint 1** (#1, #2, #3) — itens bloqueadores
3. `/break` os 3 itens em tasks atômicas
4. Implementar Sprint 1
5. Repetir o ciclo `/spec` → `/break` → implement para cada sprint seguinte

**Sprint 1 é hard-block:** sem ele, a saga de deploy do Builder cria uma instância UAZ que nunca chama o runtime. O agente "publicado" não responde.
