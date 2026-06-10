---
Criado: 2026-06-09
Atualizado: 2026-06-09
Revisar em: mudança no card registry ou preview tabs
Relacionados:
  - src/server/ai-module/builder/cards/card-submit.schemas.ts
  - src/server/ai-module/builder/cards/handlers/apply-card-submit.ts
  - src/client/components/projetos/chat/cards/card-registry.tsx
  - src/client/components/projetos/chat/cards/types.ts
  - src/client/components/projetos/chat/tool-call-card.tsx
  - src/client/components/projetos/chat/active-step-card.tsx
  - src/client/components/projetos/chat/use-chat-stream.ts
  - src/client/components/projetos/preview/tab-registry.tsx
  - src/server/ai-module/builder/state/readiness.types.ts
  - docs/builder/ORAYON_UPLIFT_SPEC.md
  - docs/FILE_SIZE_GUIDELINES.md
---

# Revisão completa — Cards do chat + Preview tabs do Builder (Jun/2026)

Revisão card a card e tab a tab do Builder IA, verificada diretamente no código
em 2026-06-09. Escopo: os 14 `cardKey` do protocolo card-action (backend), os
componentes do registry frontend, os 3 cards inline legados, e as 9 tabs do
preview panel.

**Arquitetura em uma linha:** cards são PRESENTACIONAIS — leem `value`
(BuilderState canônico) e disparam `onSubmit(payload)`; `use-chat-stream.ts` faz
o POST em `/builder/projects/:id/cards/:cardKey/submit` e consome o ACK na mesma
SSE; `apply-card-submit.ts` re-valida server-side, aplica os campos owned no
`builderState` (JSONB de `BuilderProjectConversation`) e flipa o sentinel
`confirmations.*` que o step-engine (`nextPendingStep`) usa para avançar a jornada.

---

## 1. Inventário de cards

14 cardKeys registrados em `CARD_PAYLOAD_SCHEMAS` (card-submit.schemas.ts).
11 no registry frontend (`CARD_REGISTRY`), 3 inline legados em `ToolCallCard`.
"Step" = `StepId` do step-engine (readiness.types.ts, 15 steps no total —
`project_identity` e `objective` são free-text, sem card).

| cardKey | Componente (frontend) | Campos do submit (Zod) | Grava em builderState | Step |
|---|---|---|---|---|
| `agent_approval` | inline em `tool-call-card.tsx` (tool `propose_agent_creation`) | `action: 'confirm'` | só flipa `confirmations.agentApproved` | `agent_approval` |
| `tool_selection` | inline `tool-selection-card.tsx` (tool `propose_tool_selection`) | `action: 'apply'`, `capabilityKeys[≤64]`, `toolKeys[≤64]` | `selectedToolKeys`, `selectedCapabilityKeys` + `confirmations.tools` | `tools` |
| `channel` | inline `channel-selection-card.tsx` (tool `select_channel`) | `action: 'select'`, `channelKey` (enum do catálogo) | `selectedChannelKey` + `confirmations.channel` | `channel` |
| `agent_persona` | `agent-persona-card.tsx` | `persona{ name?, tone?, style?, greeting?, speechMode? }` | `persona.*` + `confirmations.persona` | `persona` |
| `services` | `services-offered-card.tsx` | `offered[]`, `notOffered[]` | `services.offered/notOffered` + `confirmations.services` | `services` |
| `business_hours` | `business-hours-card.tsx` | `preset?`, `schedule` (**z.unknown()**), `timezone?`, `outOfHours?` | `hours.*` + `confirmations.hours` | `business_hours` |
| `pricing` | `pricing-card.tsx` | `items[]{name, priceCents, category?, priceMaxCents?, imageUrl?}`, `currency`, `disclosureStyle`, `minTicketCents?` | `pricing.*` + `confirmations.pricing` | `pricing` |
| `handoff` | `handoff-card.tsx` | `mode` (enum 4), `alsoSchedule`, `steps[]`, `departmentName?`, `departmentType?`, `members[]{userId?, name?, whatsapp?, connectionId?, position}`, `openingMessage?` | `handoff.*` + `confirmations.handoff` | `handoff` |
| `calendar_connect` | `calendar-connect-card.tsx` | `connectionId?`, `status?` (string livre ≤120, inclui `'skipped'`) | `calendar.*` + `confirmations.calendar` | `calendar` |
| `activation_mode` | `activation-mode-card.tsx` | `mode` (**string ≤120, sem enum**), `keywords[]` | `activation.*` + `confirmations.activation` | `activation` |
| `preview_summary` | `preview-summary-card.tsx` | `{}` (confirm-only) | só flipa `confirmations.summary` (gate de deploy) | `summary` |
| `quick_reply_chips` | `quick-reply-chips-card.tsx` (TRANSIENT) | `value` (≤2000) | **nada** — handler ecoa como turno normal, sem persist | — (sem stepId) |
| `source_progress` | `source-progress-card.tsx` | `accept: true`, `edited{ businessName?, services?, audience?, differentiators?, tone?, address?, description? }` | `project.name/objective`, `persona.tone`, `identity.address/description`, `services.offered` (union) + `confirmations.source` | `source_ingestion` (opcional) |
| `silenced_contacts` | `silenced-contacts-card.tsx` | `contacts[≤50]{name?, whatsapp}`, `acknowledged: true` | `silencedContacts.{contacts, acknowledged}` + `confirmations.silencedContacts` | `silenced_contacts` (opcional) |

Há ainda 2 superfícies de card fora do protocolo de submit:
- **WhatsApp QR** (`whatsapp-qr-card.tsx`) — renderizado inline pelo
  `ToolCallCard` no resultado de `create_whatsapp_instance`; sem cardKey/submit.
- **`quick_reply_chips`** está no registry mas é hard-excluído do slot ativo via
  `ACTIVE_STEP_EXCLUDED` (card-registry.tsx) — nunca aparece pinado.

---

## 2. Revisão por card

### 2.1 `agent_approval` (inline legado)
**O que faz:** confirma a proposta de agente (nome + descrição) renderizada no
resultado de `propose_agent_creation`; botão "Criar agente" POSTa
`{action:'confirm'}`; "Ajustar" pré-preenche o composer com texto livre.
**Achados:**
- (MÉDIA) Não usa `CardShell` — chrome duplicado à mão em tool-call-card.tsx.
- (BAIXA) O grid de capacidades ("Mídia/Buffer/Digitando/Idioma/Áudio/Custos")
  é hard-coded no JSX, não derivado de catálogo nenhum — pode divergir do runtime.
**Recomendação:** migrar para o registry com `CardShell`; derivar o grid do
catálogo de capabilities.

### 2.2 `tool_selection` (inline legado)
**O que faz:** multi-select de capacidades/tools; backend re-valida `toolKeys`
contra `BUILTIN_TOOL_NAMES` e descarta spoofed; `capabilityKeys` só são dedupadas
(membership é "enforced pelo FE registry", segundo o próprio comentário).
**Achados:**
- (MÉDIA) `capabilityKeys` não têm validação de catálogo server-side — strings
  arbitrárias ≤120 chars persistem no JSONB (cap de 64 itens mitiga).
- (MÉDIA) Inline fora do registry — mesma dívida do 2.1.
**Recomendação:** validar `capabilityKeys` contra o catálogo curado no handler.

### 2.3 `channel` (inline legado)
**O que faz:** escolha de UM canal; enum Zod derivado de `CHANNEL_CATALOG` +
re-check `isValidChannelKey` no handler (defesa em profundidade correta).
**Achados:** (BAIXA) apenas a dívida de inline/registry. Validação exemplar.
**Recomendação:** migrar para o registry quando tocar no arquivo.

### 2.4 `agent_persona`
**O que faz:** wizard de 2 passos no mesmo CardShell (Passo A: speechMode chips
+ nome/tom/estilo; Passo B: saudação + preview WhatsApp + "Sugerir nova"
determinístico). Campos todos opcionais; `deepMerge` ignora `undefined`.
**Achados:**
- (BAIXA) Passo A usa `role="radiogroup"`/`role="radio"` corretamente.
- (BAIXA) Submeter persona vazia (tudo em branco) flipa o sentinel mesmo assim —
  comportamento intencional ("nunca trava a etapa"), mas vale documentar.
**Recomendação:** nenhum bloqueio; manter.

### 2.5 `services`
**O que faz:** duas chip-lists ("Faz/oferece" brand, "NÃO faz" danger), cap 30
por lista, dedupe case-insensitive no FE + `sanitizeStringList` no back.
**Achados:**
- (BAIXA) Backend não tem cap de itens (`z.array(z.string().min(1))` sem
  `.max()`) nem cap de tamanho por string — diverge do padrão de bounds dos
  outros cards (tool_selection capa 64×120, silenced_contacts capa 50).
**Recomendação:** adicionar `.max()` no Zod (itens e chars) para espelhar o FE.

### 2.6 `business_hours`
**O que faz:** preset 24/7 / comercial / personalizado; editor por dia com
múltiplas pausas (`breaks[]`, G11, retro-compat com `lunch`); `outOfHours`
(reply_notice/silent); preview mini-phone.
**Achados:**
- (ALTA) `schedule: z.unknown()` — o backend persiste **verbatim** qualquer JSON
  do cliente em `hours.schedule`, sem validação de shape NEM cap de tamanho. Um
  body hostil pode inflar o JSONB (os demais campos do protocolo têm bounds
  justamente por isso). O FE coage defensivamente na leitura (`coerceSchedule`
  nunca lança), então a UI não quebra, mas o dado persistido é não-confiável
  para consumidores server-side (saga/prompt-writer).
- (BAIXA) `payload.preset` é string ≤120 no back; o FE só emite os 3 presets.
**Recomendação:** promover `WeeklySchedule` a Zod no back (7 dias × HH:MM ×
breaks ≤4) — o shape já é estável e o FE já escreve só ele.

### 2.7 `pricing`
**O que faz:** tabela BRL em centavos (INT, sem float), disclosureStyle global
(exact/from/average/none), minTicket, foto por item, import de planilha.
Sanitização server-side exemplar: `priceMaxCents` só persiste se `average` e
`max > piso`; `imageUrl` só http(s); minTicket ausente é LIMPO explicitamente
(contorna o deepMerge que pula undefined).
**Achados:**
- (BAIXA) `items` sem `.max()` no Zod (FE capa em 50 linhas; back aceita ∞).
- (BAIXA) Componente 517 linhas — acima do guideline de 300, mas já tem 5
  submódulos extraídos em `pricing/`.
**Recomendação:** `.max(50)` no array; nada mais.

### 2.8 `handoff`
**O que faz:** fusão de 4 cards antigos (modo + roster + roteiro + agenda).
Telefones normalizados E.164-BR com paridade FE
(`phone-br.ts`)/BE (`normalizeWhatsappBr`). `connectionId` por membro habilita
warm transfer; `openingMessage` interpolável `{nome}`.
**Achados:**
- (MÉDIA) **1072 linhas** — 3.5× o teto de 300 do FILE_SIZE_GUIDELINES; é o
  maior card depois do source_progress.
- (BAIXA) `LIST_CONNECTIONS_QUERY` usa resolução defensiva com fallback no-op:
  se a action não existir no client gerado, o picker de instância some
  SILENCIOSAMENTE (soft-fail sem telemetria).
- (BAIXA) `steps`/`members` sem `.max()` no Zod (FE capa steps em 10).
**Recomendação:** extrair seções (roster, roteiro) em submódulos como o pricing
fez; logar/telemetrar o fallback no-op.

### 2.9 `calendar_connect`
**O que faz:** card read-mostly; auto-confirma 1× quando `value.calendar.status`
resolve para connected (ref-guarded por connectionId); escape hatch "Continuar
sem agenda" após 2 tentativas (persiste `status:'skipped'` e flipa o sentinel —
usuário nunca trava); prova social (events-preview) com 1 leitura guardada.
**Achados:**
- (MÉDIA) `status` é string livre (≤120) mapeada por listas de sinônimos em
  DOIS lugares (`resolvePhase` no card + `CALENDAR_SKIPPED_STATUSES` no handler)
  — qualquer string desconhecida não-vazia vira "connecting" para sempre na UI.
  Falta um enum canônico compartilhado.
- (MÉDIA) `EVENTS_PREVIEW_QUERY` tem o mesmo fallback no-op do handoff: client
  não regenerado ⇒ prova social some sem erro nem log (soft-fail confirmado).
- (BAIXA) `onSubmit` disparado dentro de `useEffect` (auto-confirm) — guardado
  corretamente, mas é o único card que submete sem gesto do usuário.
**Recomendação:** enum de status compartilhado FE/BE; telemetria nos fallbacks.

### 2.10 `activation_mode`
**O que faz:** radio 2+2 (comuns sempre visíveis, avançados num expander);
keywords como chips com sugestões determinísticas derivadas do projeto;
`all_except_blacklist` destrava o step `silenced_contacts`.
**Achados:**
- (MÉDIA) **Backend sem enum**: `mode: z.string().min(1).max(120)` aceita
  qualquer string; o FE restringe aos 4 valores de
  `AIAgentConfig.activationMode`, mas um POST direto persiste lixo que a saga
  materializa depois. Contraste: o card `channel` re-valida no handler.
- (BAIXA) Os botões têm `role="radio"` mas **não há container
  `role="radiogroup"`** (handoff, persona, business-hours e pricing-style-tabs
  têm) — leitores de tela não anunciam o grupo.
**Recomendação:** `z.enum(['all','all_except_blacklist','keyword_trigger',
'whitelist_only'])` no back; adicionar o radiogroup.

### 2.11 `preview_summary`
**O que faz:** recap read-only de todas as seções confirmadas + warnings de
"seção genérica" (amber, nunca bloqueia); "Tudo certo, publicar" flipa
`confirmations.summary` (gate do deploy). Confirm-only — zero dados do cliente.
**Achados:** (BAIXA) o "Ajustar" de TODAS as seções roteia pelo mesmo
`onDismiss` (única affordance de reopen do framework) — não reabre o card
específico da seção clicada.
**Recomendação:** evoluir o protocolo de reopen por stepId quando houver demanda.

### 2.12 `quick_reply_chips`
**O que faz:** chips transientes propostos pelo LLM; o handler ecoa `value` como
turno normal de usuário e PULA o persist (state inalterado). Sem stepId, sem
sentinel, hard-excluído do slot ativo.
**Achados:** nenhum relevante. Normalização defensiva dos chips ok.
**Recomendação:** manter.

### 2.13 `source_progress`
**O que faz:** gate de aceite da ingestão "cole seu site/IG". Poll de ~2s em
`GET .../sources/status` até settle; campos PROPOSED (anti-alucinação: só o
aceite do usuário flipa `confirmations.source`, nunca o job); catálogo de fotos
(Onda D3) com poll separado gateado por `imagesAllReady`; estado de erro
explícito quando todas as fontes falham sem síntese.
**Confirmado hoje:** os campos **`address` e `description`** (Onda E) estão
renderizados no front nos DOIS modos — leitura (FieldRow "Endereço"/"Descrição",
linhas 1028-1047) e edição (Inputs com aria-label, linhas 961-980) — e fluem no
`edited` do submit. Backend grava em `identity.address/description`.
**Achados:**
- (MÉDIA) **1104 linhas** — maior arquivo da pasta de cards (teto: 300). Já
  carrega: poll de status, poll de imagens, parsing tolerante, chip-lists e dois
  modos de render.
- (BAIXA) Poll com `catch {}` silencioso (retry no próximo tick) — aceitável
  para blip de rede, mas sem backoff nem contador de falhas; um endpoint 500
  permanente fica pollando a cada 2s até o settle nunca chegar (mitigado pelo
  estado `hasFailedWithoutProposal`, que depende do `status` das fontes, não do
  poll em si).
- (BAIXA) `ChipList` é duplicado quase 1:1 do services-offered-card.
**Recomendação:** extrair polls e parsing para hooks/submódulos (`sources/` já
existe); compartilhar o ChipList.

### 2.14 `silenced_contacts`
**O que faz:** lista (opcional, ≤50) de contatos que o agente nunca responde;
"Confirmar e seguir" e "Não tenho ninguém" ambos ack'am (`acknowledged: true`);
E.164-BR com paridade FE/BE; dedupe por whatsapp no handler.
**Achados:** (BAIXA) leitura defensiva do leaf `silencedContacts` (o tipo pode
não existir ainda) — verificar se a janela de integração já fechou e simplificar.
**Recomendação:** manter; é o card com bounds mais corretos do catálogo.

---

## 3. Inventário de preview tabs

9 tabs em `TAB_REGISTry` (tab-registry.tsx), todas `visibleFor: ['ai_agent']`
exceto `overview` (todos os tipos). `requiresAgent` = LOCKED (visível, cinza,
inclicável) até `project.aiAgent !== null`; `requiresPublished` = HIDDEN até
`isProjectPublished` (`hasWhatsAppConnection || status === 'production'`).

| Tab (value) | Label | Componente | Dados (fonte) | Locked/Hidden por | Editável | Observações |
|---|---|---|---|---|---|---|
| `overview` | Visão geral | `overview-tab.tsx` | derivações de `messages` + `project` + readiness (`use-overview-derivations`) | — | não (leitura + quick actions) | EmptyState quando sem atividade; celebração ao criar agente |
| `prompt` | Prompt | `prompt-tab.tsx` | `project.aiAgent.systemPrompt` (SSR) + `IdentityTab` (fetch próprio) + `VersionHistory` | `requiresAgent` (locked) | sim — autosave debounce 2s (`use-prompt-autosave`) | embute a antiga tab Identidade no topo |
| `knowledge` | Conhecimento | `knowledge-tab.tsx` | `fetch` manual `/api/v1/builder/knowledge/:id` + reload | — | sim — add fonte (PDF/URL/texto), delete, toggle useRAG | poll 3s enquanto processing |
| `media` | Mídias | `media-tab.tsx` | `api.builder.listProjectMedia.useQuery` | — | sim — upload multipart, legenda, soft-delete | funciona pré-agente (collection on-demand) |
| `playground` | Testar | `playground-tab.tsx` | SSE `/projects/:id/playground/stream`, histórico só local | `requiresAgent` (locked) | n/a (chat de teste) | nunca persiste no banco |
| `activity` | Atividade | `_core/activity/activity-tab.tsx` | derivado de `messages` (toolCalls), 50 itens | `requiresPublished` (**hidden**) | não | zero backend próprio |
| `deploy` | Publicar | `deploy-tab.tsx` | tanstack `useQuery` channel (poll 15s até conectar) + `fetch` manual versions | `requiresAgent` (locked) | sim — publicar versão, rollback | wizard 4 passos (Canal → Requisitos → Publicar → Histórico) |
| `credentials` | Config | `credentials-tab.tsx` | `useProviders()` (hook fetch próprio) + `project.aiAgent` | — | sim — chaves BYOK + modelo (`AgentConfigSection`) | link p/ /integracoes |
| `advanced` | Avançado | `advanced-tab.tsx` | `project.runtimeSettings` (SSR) + PATCH `/projects/:id/agent-settings` | `requiresAgent` (locked) | sim — Save manual + toast | buffer, mídia, TTS, idioma |

Não há mais "seções Config/Avançado" dentro de uma tab única: **Config**
(`credentials`) e **Avançado** (`advanced`) são tabs próprias; a seção de
identidade/persona virou bloco no topo da tab Prompt.

---

## 4. Revisão por tab

### 4.1 Visão geral (`overview`)
Dashboard derivado: 3 estados (sem atividade → EmptyState; com mensagens →
StageList derivada dos toolCalls; com agente → overview completo com identidade,
primeira mensagem, prontidão de deploy, quick actions, métricas se != draft).
**Achados:** (BAIXA) tudo derivado de props — sem fetch próprio, atualiza só
quando o workspace re-hidrata o projeto. Coerente com o design, mas herda o
staleness do achado 5.2.

### 4.2 Prompt (`prompt`)
Editor do systemPrompt com autosave (2s), insights, histórico de versões e o
bloco Identidade (autosave PRÓPRIO via PATCH `/builder/identity/:id`).
**Achados:**
- (ALTA) `use-prompt-autosave.ts` faz `api.builder.updatePrompt.mutate(...)` e
  **não invalida nenhum cache** (nem `queryClient.invalidateQueries`, nem
  refetch do projeto): o `project.aiAgent.systemPrompt` vindo do SSR/workspace
  continua stale — Overview ("primeira mensagem"), Playground e Deploy só veem o
  prompt novo após reload da página. Confirmado: o hook só seta `saveState`.
- (MÉDIA) Duas estratégias de autosave coexistem na mesma tela (prompt via
  client Igniter; identidade via `fetch` manual) com indicadores diferentes.
- (BAIXA) Sync de estado com `eslint-disable exhaustive-deps` no `useEffect` —
  funciona, mas é frágil a edição concorrente (chat atualiza o prompt enquanto
  o usuário digita).

### 4.3 Conhecimento (`knowledge`)
Lista fontes RAG + status, add/delete, toggle `useRAG` otimista com reconcile.
**Achados:**
- (MÉDIA) **Erro vira empty state**: o `load()` faz fallback silencioso para
  `{collection:null, sources:[], useRAG:false}` em QUALQUER falha (rede, 401,
  500) — o usuário vê "sem fontes" em vez de um erro (contraste: credentials-tab
  tem Alert de erro explícito).
- (BAIXA) Checkbox nativo de useRAG sem estilização DS nem `aria-describedby`.
- (BAIXA) Fetch manual + setState em vez do client Igniter (ver §5.2).

### 4.4 Mídias (`media`)
Curadoria do catálogo enviável (foto/vídeo/PDF); dono do
`listProjectMedia.useQuery`; filtros locais por tipo e categoria; unwrap
tolerante do envelope (plano OU array-wrapped).
**Achados:** (BAIXA) é a tab mais alinhada ao padrão alvo (Igniter useQuery +
refetch propagado) — usar como referência. O unwrap defensivo do envelope
denuncia inconsistência do client gerado, não da tab.

### 4.5 Testar (`playground`)
Chat stateless via SSE; histórico só em memória; empty state "Aguardando o
Builder" quando sem agente.
**Achados:** (BAIXA) usa o prompt do agente no servidor a cada turno, então não
sofre do staleness do 4.2 — mas o usuário não tem indicação de QUAL versão de
prompt está testando.

### 4.6 Atividade (`activity`)
Timeline das toolCalls do meta-agente derivada de `messages` (50 mais recentes),
labels PT-BR por tool, collapsible de args.
**Achados:** (BAIXA) `TOOL_LABELS` é um registry manual — tools novas caem num
fallback genérico; ok, mas drifta em silêncio. Hidden até publicar é coerente
(sem conteúdo pré-publish).

### 4.7 Publicar (`deploy`)
Wizard 4 passos; canal via tanstack `useQuery` com poll 15s que para ao
conectar; publish via rota real da saga (`/deploy/publish-version`); invalida
`project-channel` ao anexar canal.
**Achados:**
- (BAIXA) `loadVersions` (useCallback) e o `useEffect` de mount têm o corpo
  **duplicado** linha a linha (fetch + parse + fallback) — o effect podia chamar
  o callback.
- (BAIXA) Versions via `fetch` manual com falha silenciosa (`setVersions([])`)
  — mesmo padrão de erro-vira-vazio do knowledge.
- (BAIXA) Mistura 3 idiomas de data na mesma tab: tanstack useQuery (channel),
  fetch+setState (versions), invalidateQueries por queryKey string.

### 4.8 Config (`credentials`)
Modelo curado + chaves BYOK por provedor; estados de erro e backendMissing com
Alerts explícitos; badge "Em uso" no provedor ativo.
**Achados:** (BAIXA) melhor tratamento de erro entre as tabs — referência para o
4.3. `useProviders` ainda é hook de fetch próprio (ver §5.2).

### 4.9 Avançado (`advanced`)
Runtime settings (buffer, mídia, TTS, idioma) com merge de defaults, Save
manual + toast, CSRF headers no PATCH.
**Achados:**
- (BAIXA) Único formulário do workspace com save MANUAL (prompt e identidade
  são autosave) — inconsistência deliberada ou não, confunde a expectativa.
- (BAIXA) Badge "Agente publicado" hard-coded no header mesmo quando o agente
  ainda não publicou (a tab destrava com `requiresAgent`, não published).

---

## 5. Inconsistências de padrão (transversais)

### 5.1 Cards inline vs registry
3 cards (`agent_approval`, `tool_selection`, `channel`) vivem em
`ToolCallCard`/arquivos irmãos, fora de `CARD_REGISTRY`, sem `CardShell`, e são
acionados pelo NOME DA TOOL no stream (não pelo step-engine). Consequências:
chrome duplicado, dois caminhos de render para o mesmo protocolo de submit, e
`getCardDescriptor` retorna `undefined` para 3 keys válidas do backend (o
type-assert em types.ts só garante a direção backend⊆frontend).

### 5.2 Data-fetching heterogêneo entre tabs (confirmado)
Cinco idiomas coexistem: (a) Igniter `useQuery` — media, version-history;
(b) tanstack `useQuery` manual — deploy/channel; (c) `fetch`+`useState` —
knowledge, identity, deploy/versions, advanced; (d) hook custom de fetch —
credentials (`useProviders`); (e) poll manual `setTimeout`/`setInterval` —
source_progress (2s), knowledge (3s), deploy (15s). Nenhuma invalidação cruzada:
salvar o prompt não refaz o channel; submit de card invalida só o readiness
(`use-chat-stream.ts:363`), nunca o projeto.

### 5.3 Erro silencioso vira estado vazio
knowledge-tab, deploy/versions e os fallbacks no-op de hooks
(`EVENTS_PREVIEW_QUERY`, `LIST_CONNECTIONS_QUERY`) degradam para vazio sem
sinalizar nada ao usuário nem telemetria. credentials-tab e o estado
`hasFailedWithoutProposal` do source_progress mostram o caminho certo.

### 5.4 Empty states e save indicators divergentes
"Aguardando o Builder criar o agente" aparece em 3 implementações distintas
(PromptEmptyState, inline no DeployTab, inline no Playground) com layouts
diferentes. Indicadores de save: autosave com ticker "salvo há Ns" (prompt),
autosave próprio (identity), botão+toast (advanced), otimista sem indicador
(knowledge useRAG).

### 5.5 Bounds assimétricos nos schemas Zod
Cards com caps rígidos (tool_selection 64×120, silenced_contacts 50,
contacts/whatsapp 40) convivem com arrays ilimitados (`services.offered`,
`pricing.items`, `handoff.steps/members`) e com o `schedule: z.unknown()` —
todos gravando no mesmo JSONB.

### 5.6 Tamanho de arquivo
`source-progress-card.tsx` (1104) e `handoff-card.tsx` (1072) estouram em 3.5×
o teto de 300 linhas de componente do FILE_SIZE_GUIDELINES; `business-hours-card`
(608), `calendar-connect-card` (565) e `pricing-card` (517) também passam.

---

## 6. Backlog priorizado (impacto × esforço)

### ALTA
1. **Invalidar caches após autosave do prompt** (`use-prompt-autosave.ts`):
   refetch/invalidate do projeto (e do readiness) no `onSave` — hoje Overview,
   Deploy e o workspace inteiro ficam stale até reload. Impacto alto (dado
   visível errado), esforço baixo.
2. **Validar `business_hours.schedule` no backend**: substituir `z.unknown()`
   por um Zod de `WeeklySchedule` (7 dias, HH:MM regex, ≤4 breaks/dia). Impacto
   alto (integridade do JSONB + consumidores server-side), esforço baixo — o
   shape já está congelado em `schedule-shape.ts`.
3. **Enum server-side em `activation_mode.mode`** (+ re-validação de
   `capabilityKeys` no tool_selection): fechar os dois últimos campos string
   livres que materializam config de runtime. Esforço trivial.

### MÉDIA
4. **Migrar os 3 cards inline para o CARD_REGISTRY** (CardShell + descriptor),
   eliminando o caminho duplicado de render. Esforço médio, destrava o 5.1.
5. **Padronizar data-fetching das tabs no client Igniter** (começar por
   knowledge e identity, que são fetch+setState puros) + convenção única de
   invalidação pós-mutation. Esforço médio-alto, pagar em parcelas.
6. **Superfície de erro nas tabs que degradam para vazio** (knowledge,
   deploy/versions) + telemetria nos fallbacks no-op de hooks resolvidos em
   module-eval. Esforço baixo.
7. **Extrair submódulos de `source-progress-card` e `handoff-card`** (polls,
   parsing, roster, roteiro) até voltarem ao teto de 300 linhas. Esforço médio.
8. **Unificar empty state "Aguardando o Builder"** num componente compartilhado
   e definir convenção de save indicator (autosave vs manual). Esforço baixo.

### BAIXA
9. `role="radiogroup"` no activation-mode-card; revisar checkbox nativo do
   knowledge-tab (a cobertura de `aria-label` nos cards está boa — 53
   ocorrências —, o gap real é semântica de grupo, não labels).
10. Deduplicar `loadVersions` no deploy-tab (effect chama o callback).
11. `.max()` nos arrays sem bound (services, pricing.items, handoff.steps/members).
12. Derivar o grid de capacidades do `agent_approval` de um catálogo; enum de
    status compartilhado para `calendar_connect`; remover badge "Agente
    publicado" enganosa do advanced-tab.
