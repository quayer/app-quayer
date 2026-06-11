---
Criado: 2026-06-10
Atualizado: 2026-06-10
Revisar em: ao iniciar /break desta spec, ou mudança no step-engine/cards do Builder
Relacionados:
  - specs/jornada-builder-v2/spec.md
  - src/server/ai-module/builder/state/next-pending-step.ts
  - src/server/ai-module/builder/cards/builder-state.ts
  - docs/builder/CARDS_REVIEW_2026-06.md
---

# Plano Técnico — Jornada Builder v2: "Configure por exceção"

Este plano constrói SOBRE os quick-wins já shipped em 2026-06-10 (derivação de capacidades em `src/server/ai-module/builder/deploy/enabled-tools-derivation.ts`, `set_project_basics` ampliado em `src/server/ai-module/builder/tools/set-project-basics.tool.ts`, prefills, reopen-from-summary em `src/client/components/projetos/chat/active-step-card.tsx`, fonte única de progresso em `use-project-readiness.ts` + `readiness-adapters.ts`, ativação+silêncio encadeados, agenda honesta em `apply-card-submit.ts`/FR-11, nome curto de projeto). Nada disso é re-planejado — é dependência.

## 1. Stack & dependências

**Zero dependências npm novas.** Tudo usa o que já existe no repo:

- **Step-engine**: TypeScript puro + Zod (padrão de `src/server/ai-module/builder/state/next-pending-step.ts` — função pura, sem IO).
- **Estado**: `builderState` JSONB em `BuilderProjectConversation` (Prisma, `prisma/schema.prisma` linha 1884) via `parseBuilderState`/`patchBuilderState` (`src/server/ai-module/builder/cards/builder-state.ts`).
- **API**: Igniter.js composer pattern (`src/server/ai-module/builder/builder.controller.ts` compõe `*.routes.ts`).
- **Feature flag**: idiom de `src/lib/feature-flags/auth-v3.ts` (env `off | on | percentage:N` + cookie override + hash SHA-256 estável) — novo arquivo `src/lib/feature-flags/builder-v2.ts`, env `BUILDER_JOURNEY_V2`, cookie `builder-v2-override`. Seed do percentage = `organizationId` (coorte estável por org: agências não misturam jornadas entre projetos).
- **Jobs**: nenhum job novo. O pipeline assíncrono existente (`src/server/services/jobs/source-enrich.queue.ts`) permanece como está.
- **Telemetria**: Prisma + serviço fire-and-forget (seção 6). `src/server/services/telemetry.ts` exporta `null` (Igniter telemetry desligado) e Sentry (`src/instrumentation.ts`) só captura erros — nenhum dos dois serve para funil de produto; não adicionamos lib de analytics (seria dep nova sem justificativa forte).

## 2. Modelo de dados

### 2.1 Única migration: tabela `BuilderJourneyEvent` (NFR-04)

Novo modelo Prisma (padrão leve de `BuilderToolCall`, linha 1994 do schema — sem FKs pesadas, índices enxutos):

- `id String @id @default(uuid())`
- `organizationId String` — multi-tenant duro (NFR-01); toda query filtra por ele
- `projectId String` — BuilderProject.id (sem FK relacional, igual BuilderToolCall.messageId)
- `journeyVersion Int` — 1 | 2, congelado no evento
- `event String @db.VarChar(60)` — vocabulário fechado em TS (seção 6.2)
- `metadata Json?` — NUNCA contém telefone/PII (NFR-02; ver seção 5)
- `createdAt DateTime @default(now())`
- Índices: `@@index([organizationId, event, createdAt])` (funil por org), `@@index([projectId, createdAt])` (linha do tempo por projeto)
- `@@map("builder_journey_events")`

Migration: um único `CREATE TABLE` + índices. Eventos podem repetir (ex.: reconexão de QR); o funil agrega por `MIN(createdAt)` por (projectId, event) — sem unique constraint.

**Cascata obrigatória (CLAUDE.md, regras críticas):** esta migration exige atualizar `docs/ERD.md` + a tabela de modelos Prisma do `CLAUDE.md` na MESMA onda (Onda 0).

### 2.2 Extensões do `builderState` (Zod, JSONB — SEM migration)

Em `src/server/ai-module/builder/cards/builder-state.ts`, mudanças 100% aditivas (o `parseBuilderState` backfilla legados, padrão já provado nas Ondas D/E/G1):

1. **`journeyVersion: z.union([z.literal(1), z.literal(2)]).default(1)`** — a chave de rollout POR PROJETO. Decidido contra coluna em `BuilderProject`: (a) o engine puro já consome `BuilderState` — nenhum campo extra no `StepEngineContext`; (b) zero migration; (c) consulta ops de convergência é viável via JSONB (`builderState->>'journeyVersion'`). O risco de não-indexável é aceitável: a única query por versão é operacional (sunset), não hot path. **Seed nos DOIS caminhos de criação de projeto** (`projects.repository.ts`): `createWithInitialMessage` (cria conversa+builderState) E `duplicateProject` (linhas 564-575 — cria BuilderProject SEM conversa/builderState; sem tratamento, um clone de projeto v2 cairia no default 1 quando a conversa fosse criada lazy = downgrade silencioso + reset de jornada). Regra: clone de projeto v2 herda v2 — o ponto de criação lazy da conversa deve receber a versão herdada, não o default. Ambos os caminhos emitem `journey_started` (seção 6.2).
2. **`capturedProposals` (namespace top-level)** — FR-02, generalização do invariante de `sourceIngestion.proposed`: valores PROPOSTOS por captura de conversa, que NUNCA flipam sentinels e só viram owned no submit do card correspondente. **Naming decidido**: `capturedProposals`, NÃO `proposals` — o builderState já tem `proposal` (singular, proposta de nome/descrição do agente, `builder-state.ts` linhas 29-32); um plural a um caractere de distância seria armadilha de leitura/review. Shape por domínio (todos opcionais): `capturedProposals: { persona?: {name?, tone?, greeting?}, services?: {offered?: string[]}, hours?: {preset?}, pricing?: {items?}, handoff?: {mode?, reason?}, activation?: {mode?} }`. O `reason` do handoff carrega a justificativa da proposta por nicho regulado (decisão 1 da seção 9 da spec; fonte: sub-agente `src/server/ai-module/builder/sub-agents/niche-researcher/` via `tools/research-niche.tool.ts`). **Limpeza no submit é remoção EXPLÍCITA**: o `deepMerge` de `patchBuilderState` ignora `undefined` e nunca deleta chaves (`builder-state.ts` linhas 377-394) — "limpar" o domínio confirmado exige helper `clearCapturedProposals(state, domain)` (spread sem a chave do domínio), mesmo precedente do clear de `minTicketCents` em `applyPricing` (`apply-card-submit.ts` linhas 464-469). Proibido confiar no patch para limpar.
3. **5 sentinels novos em `confirmationsSchema`**: `businessIdentity`, `testDrive`, `knowledge`, `media`, `publishedNextSteps` (todos `default(false)`; resolvidos só server-side, padrão da doc do arquivo).

### 2.3 Modelos que NÃO mudam

- `AgentTool` (linha 1792): custom tools/integrações já vivem aqui (type `CUSTOM`, `@@unique([organizationId, name])`) — verificado: NÃO existe modelo `CustomTool`; o Integration Builder está fora de escopo (spec §7) e a superfície de Capacidades só LISTA os `AgentTool` existentes.
- `BuilderProject.metadata` permanece intocado.
- `AIAgentConfig.enabledTools` continua sendo escrito SÓ pela derivação shipped (set-merge de `enabled-tools-derivation.ts`).

## 3. API Igniter

Módulo: `builder` (`src/server/ai-module/builder/builder.controller.ts`, path `/builder`). Todas as actions com `authOrApiKeyProcedure({ required: true })` — o idiom real de TODAS as rotas do módulo builder (`card-submit.routes.ts:71`, `chat.routes.ts:101`, `identity.routes.ts:55`, `provision-whatsapp.routes.ts:30`); `authProcedure` é outro procedure (core/auth) e não deve ser usado aqui. Toda query filtrada por `organizationId` (padrão de `readiness-resolver.ts` e `apply-card-submit.ts`).

### 3.1 `getReadiness` (MODIFICAR — additivo) — `src/server/ai-module/builder/chat/chat.routes.ts` + `state/readiness-resolver.ts`

- `Readiness` (em `state/readiness.types.ts`) ganha campo opcional `journey?: { version: 2; activePhaseId: PhaseId; phases: Array<{ id: PhaseId; title: string; steps: ReadinessStep[]; status: 'done'|'active'|'pending' }> }`. `PhaseId = 'conhecer'|'revisar'|'testar'|'lancar'`. Os campos v1 (`step`, `steps`, `completenessPct`, `isDeployReady`, `blockers`, `fieldOwnership`, `builderState`) permanecem SEMPRE populados — consumidores v1 (banner `build-journey-banner.ts`, adapters da Overview) não quebram.
- `StepId` union estendido (aditivo): `business_identity`, `agent_review`, `test_drive`, `whatsapp_connect`, `published_next_steps`, `knowledge`, `media`. Verificado por grep: NÃO existe switch exaustivo sobre `StepId` — consumidores usam lookup tolerante (`card-registry.tsx` `Partial<Record<StepId>>`, `readiness-adapters.ts` map genérico, banner renderiza step genericamente); a extensão é segura por construção (risco R3).
- `StepEngineContext` ganha DOIS sinais novos (ambos no `Promise.all` do resolver, linhas 74-97 — counts indexados):
  - `hasLiveDeployment: boolean` — count de `BuilderDeployment` status `live` por projectId+org.
  - `hasConnectedWhatsAppInstance: boolean` — count de `Connection` com `organizationId` + `channel: 'WHATSAPP'` + **`status: 'CONNECTED'`** + **`projectId` do projeto** (a Connection criada pelo provisioning carrega `projectId`, `provision-whatsapp.routes.ts:83`). É o sinal de "conectou de verdade" do step `whatsapp_connect`. NÃO reusar `hasWhatsAppInstance`: o sinal existente conta QUALQUER Connection WHATSAPP da org sem filtro de status (`readiness-resolver.ts:85-88`) e o provisioning cria a Connection com status `DISCONNECTED` ANTES do scan (`provision-whatsapp.routes.ts:76-90`) — o step se auto-completaria no instante em que o QR fosse gerado, ou já nasceria done se a org tem conexão de outro projeto. O status só vira `CONNECTED` via webhook UAZ (`resolve-connection.ts:66-73, 156`). O blocker `channel` do v1 PERMANECE no sinal antigo `hasWhatsAppInstance` (NFR-03: v1 intocada).
- O resolver ramifica: `state.journeyVersion === 2 ? nextPendingStepV2(state, ctx) : nextPendingStep(state, ctx)`.

### 3.2 Engine v2 (NOVO, puro) — `src/server/ai-module/builder/state/journey-v2.ts`

Exporta `QUAYER_PHASES` e `nextPendingStepV2`. REUSA de `next-pending-step.ts`: `computeBlockers`, `FIELD_OWNERSHIP` (já exportados, linhas 331/372), o shape `StepDefinition` (exportar a interface, hoje local), `confirmed`/`hasText` (hoje locais às linhas 56-89 — extrair para `state/step-helpers.ts` compartilhado; proibido duplicar). Fases:

- **Conhecer**: `objective` (livre, igual v1) → `business_identity` (isDone: `confirmations.businessIdentity` OU `confirmed('source')` — site/IG satisfaz, FR-03 dá caminho equivalente) → `source_ingestion` (opcional, mantém o comportamento de override do slot ativo, linhas 132-147 do v1).
- **Revisar**: `agent_review` (composto; isDone: `persona && services && hours` confirmados — SEM sentinel novo, deriva dos 3 existentes) → `agent_approval` (cria agente+prompt, card inline legado mantido) → `knowledge` (opcional; isDone: existe fonte/texto OU `confirmations.knowledge`) → `media` (opcional; isDone: `imagesCount>0` em alguma fonte OU `confirmations.media`). Capacidades (handoff/pricing/calendar) NÃO são steps na v2 — são opt-in pela superfície de Capacidades (seção 4.3); os sentinels/handlers existentes continuam funcionando quando os cards são abertos por lá.
- **Testar**: `test_drive` (isDone: `confirmations.testDrive`; gate SOFT — decisão 2 da spec §9: o escape "Publicar sem testar" também flipa).
- **Lançar**: `activation` (prefill default `mode='all'`, FR-14; silenciados já encadeados via `onSubmitCard` shipped) → `whatsapp_connect` (DETERMINÍSTICO: `isDone: (s, ctx) => ctx.hasConnectedWhatsAppInstance`, sem sentinel — FR-15; ver 3.1: status `CONNECTED` + projectId, nunca o sinal de presença) → `summary` (gate de deploy, igual v1) → `published_next_steps` (terminal opcional; surfa quando `ctx.hasLiveDeployment && !confirmations.publishedNextSteps`, padrão de override do `silenced_contacts`).

`completenessPct` continua monotônico (mesma fórmula `computeCompletenessPct` sobre os steps aplicáveis das fases). `isDeployReady` = required steps das fases 1-4 (exceto terminal) + zero blockers — mesmo contrato.

### 3.3 Card-submit (MODIFICAR — registry aditivo + split do handler) — `cards/card-submit.schemas.ts` + `cards/handlers/`

O registry per-card (doc do schemas: "W3 adds a new card by registering one entry") recebe 4 payloads novos; o union discriminado e o exhaustiveness guard do handler (`apply-card-submit.ts:935-944`) forçam os branches.

**Split obrigatório ANTES de adicionar handlers**: `apply-card-submit.ts` está com ~876 linhas — acima do MÁXIMO de 800 para service em `docs/FILE_SIZE_GUIDELINES.md` (que manda: edição >30 linhas em arquivo acima do máximo → extrair a parte tocada, precedente do webhook UAZ citado no próprio guideline). Plano de extração: `handlers/apply/{persona,services,hours}.ts` (os atuais `applyAgentPersona`/`applyServices`/`applyBusinessHours`, hoje funções locais não-exportadas nas linhas 327-417, viram exports puros reutilizados pelo card composto) + `handlers/apply/journey-v2.ts` (handlers novos: `business_identity`, `agent_review`, `test_drive`, `published_next_steps`) — o entrypoint `apply-card-submit.ts` fica só com o switch/dispatch e os helpers transversais.

1. **`business_identity`**: `{ cardKey, name: string(1..80), address?: string(1..300), description?: string(1..500) }` → grava `project.name` (+ espelha `builder_projects.name`, mesmo padrão transacional de `set-project-basics.tool.ts` linhas 149-202), `identity.*`, limpa `capturedProposals` do domínio via `clearCapturedProposals` (remoção explícita — seção 2.2), flipa `businessIdentity`.
2. **`agent_review`** (composto, FR-05): `{ cardKey, persona: <shape de agentPersonaPayloadSchema.persona>, offered, notOffered, hours: <shape de business_hours>, disclosure?: { mode: 'ai_explicit'|'human_passthrough'|'custom', customText? } }` → handler compõe os exports puros de `handlers/apply/{persona,services,hours}.ts` num ÚNICO write (1 `updateMany` org-scoped), flipando `persona`+`services`+`hours` e limpando `capturedProposals.{persona,services,hours}` via clear explícito. O bloco opcional `disclosure` (vindo da seção avançada — 4.5) é aplicado NO MESMO handler, server-side, reusando os helpers puros de `@/lib/agent-identity-card` (`normalizeIdentityCard` + `mergeIdentityCardIntoMetadata` sobre `BuilderProject.metadata.identityCard`) — 1 POST real, sem segundo request ao PATCH `/builder/identity/:projectId`. Como no ordering v2 o agente ainda NÃO existe no agent_review (agent_approval vem depois), a injeção no prompt acontece na criação: `create_agent` aplica `injectDisclosureIntoPrompt(metadata.identityCard)` ao materializar o systemPrompt (ver 4.5). Horários prefillados com default "sempre aberto" (decisão 3 da spec §9) — o default vive no componente, não no handler. **Trade-off decidido**: card composto novo em vez de orquestrar os 3 cards em sequência — 1 confirmação em vez de 3 (NFR-07: máx 1 decisão obrigatória por superfície), 1 ACK turn em vez de 3, e os cards individuais continuam existindo para o reopen FR-17 ("Ajustar persona" reabre só persona). Alternativa rejeitada: encadear via `onSubmitCard` (padrão ativação→silenciados) — manteria 3 confirms e contradiz "proposta consolidada" da FR-05.
3. **`test_drive`**: `{ cardKey, action: 'tested' | 'skip' }` → flipa `testDrive`; ACK distinto para skip (LLM não promete que o agente foi validado). **Auto-flip no caminho REAL do usuário**: o CTA "Abrir teste" leva à tab Testar, que usa `POST /projects/:id/playground/stream` (`playground.routes.ts:46-55` — stateless, não persiste mensagens); portanto o flip automático acontece no `playgroundStream`: no primeiro turno bem-sucedido do projeto, write atômico fail-open (try/catch, nunca quebra o stream) flipando `testDrive` se ainda false. `run-playground-test.tool.ts` (tool de cenários do meta-agente, raramente acionada pelo card) flipa pelo MESMO helper compartilhado. O clique "Já testei" permanece como fallback manual.
4. **`published_next_steps`**: `{ cardKey, action: 'ack' }` → flipa `publishedNextSteps` (card é informativo; o ack só o tira do slot).

`knowledge`/`media` (opcionais) reusam o padrão `silenced_contacts`: payload `{ cardKey, action: 'ack' }` flipando o sentinel — OU são satisfeitos por dados reais (fontes/imagens), sem card obrigatório.

### 3.4 `getCapabilities` (NOVO query) — `src/server/ai-module/builder/capabilities/capabilities.routes.ts`

`GET /builder/projects/:id/capabilities` — composição leitora para a superfície de Capacidades (FR-06/07), sob `authOrApiKeyProcedure({ required: true })`: `{ customTools: Array<{id, name, description, isActive}> (AgentTool type CUSTOM org-scoped), mediaImagesCount, calendarConnected (reusa hasActiveCalendarConnection de enabled-tools-derivation.ts), knowledgeSourceCount }`. O estado dos toggles (transferir/preços/agenda) NÃO vem daqui — deriva do `builderState` que o readiness já entrega (NFR-05: zero fetch extra para prefill). Nenhuma escrita: toda escrita passa pelo card-submit existente (FR-09: sem segunda superfície de decisão).

### 3.5 Tools do meta-agente

- **`propose_field_values` (NOVA)** — `src/server/ai-module/builder/tools/propose-field-values.tool.ts`: irmã da `set_project_basics` (mesmo write atômico `$transaction` read-modify-write org-scoped), mas grava SÓ `capturedProposals.*` (zod com max-lengths por campo; whitelist de domínios). Description instrui: "use quando o usuário mencionar horários/serviços/preços/transferência em texto livre — a proposta aparece prefillada no card para CONFIRMAÇÃO; nunca confirme por ele". É o motor da FR-02 junto com a precedência de prefill (seção 4.2).
- **`set_project_basics`** permanece para os campos `livre` de FIELD_OWNERSHIP (shipped).
- **`journey-rules`** (`prompts/journey-rules.ts`, consumido por `build-journey-banner.ts`): adicionar regra para a fase Conhecer usar `quick_reply_chips` nas perguntas de texto livre (decisão: MANTER os chips — schema+handler+componente já existem end-to-end, verificado em `card-submit.schemas.ts`/`apply-card-submit.ts` linhas 917-924/`quick-reply-chips-card.tsx`; deletar seria jogar fora exatamente o que a FR-01 precisa para reduzir digitação).
- O banner (`build-journey-banner.ts`) ganha render v2-aware: quando `readiness.journey` existe, o cabeçalho `# PRÓXIMO PASSO` inclui a fase ativa ("Fase 2 de 4 — Revisar") — mudança puramente aditiva no renderer puro.

### 3.6 QR determinístico — provision UMA vez + rota nova de refresh

`POST /builder/channel/provision-whatsapp` NÃO é idempotente: cada chamada cria instância UAZAPI + linha `Connection` NOVAS (`uazapiService.createInstance` :49 + `db.connection.create` :76) — re-chamar para "Gerar novamente" multiplicaria instâncias órfãs no broker. E o único refresh de QR existente hoje é `POST /api/v1/instances/share/[token]` (route.ts:69-117), que é público (gateado só por shareToken) e expira em 15min. Portanto o card `whatsapp_connect`:

- (a) chama o provisioning existente **UMA única vez**, apenas quando o projeto ainda não tem `Connection` (lookup por `projectId` org-scoped);
- (b) regenera QR de conexão EXISTENTE via **rota nova autenticada** `POST /builder/channel/refresh-qr` (body `{ connectionId }`, `authOrApiKeyProcedure` + filtro `organizationId`), espelhando a lógica do `POST share/:token` (novo QR na UAZAPI + renova `shareTokenExpiresAt`).

A detecção de "conectou" é `ctx.hasConnectedWhatsAppInstance` do readiness (seção 3.1 — `status: 'CONNECTED'` setado pelo webhook UAZ em `resolve-connection.ts`), exibida no card por autodetecção (seção 4.4). O blocker `channel` do v1 segue na fonte antiga (FR-18 sem contradição: v1 não muda).

## 4. Frontend

Rotas: NENHUMA nova — tudo vive em `/projetos/[id]` (workspace client-side, `src/client/components/projetos/workspace.tsx`). Todos os componentes novos são client components (o workspace inteiro é client; sem RSC novo).

### 4.1 Cards novos (registrar em `chat/cards/card-registry.tsx` + `STEP_TO_CARD`)

| Card | Arquivo novo | stepId | Estados |
|---|---|---|---|
| `business_identity` | `cards/business-identity-card.tsx` | `business_identity` | prefill de `identity.*`/`project.name`/`capturedProposals`; vazio = formulário em branco com hint |
| `agent_review` | `cards/agent-review-card.tsx` + seções extraídas `cards/review/{persona,services,hours}-section.tsx` | `agent_review` | prefill: owned > capturedProposals > default ("sempre aberto" nos horários); badge "sugerido da conversa" em valores vindos de `capturedProposals` (distinção proposed/owned: campo owned confirmado renderiza sem badge); seção avançada de disclosure (4.5) |
| `test_drive` | `cards/test-drive-card.tsx` | `test_drive` | CTA primário "Abrir teste" (troca para tab Testar via `onTabChange`), secundário "Já testei", escape explícito "Publicar sem testar" (decisão 2 §9); disabled com motivo enquanto `!agentExists` (FR-20) |
| `whatsapp_connect` | `cards/whatsapp-connect-card.tsx` | `whatsapp_connect` | loading (provisioning chamado UMA vez, só sem Connection do projeto — 3.6a), QR visível + "Gerar novamente" (rota `refresh-qr`, 3.6b — re-apresentável, FR-15), erro com retry honesto (NFR-06), conectado (autodetecção via `hasConnectedWhatsAppInstance` no readiness unificado com polling — 4.4). Reusa o visual de `chat/whatsapp-qr-card.tsx` (que permanece para o tool-result inline legado v1) |
| `published_next_steps` | `cards/published-next-steps-card.tsx` | `published_next_steps` | FR-16: testar do celular (deep-link wa.me), ver Atividade (onTabChange), como pausar |

Limites: cada card ≤300 linhas — o `agent_review` é orquestrador fino; a lógica de formulário vem das seções extraídas dos 3 cards existentes (`agent-persona-card.tsx`, `services-offered-card.tsx`, `business-hours-card.tsx`), que passam a importar as mesmas seções (zero duplicação).

### 4.2 Precedência de prefill (FR-02)

Regra única, helper puro `cards/prefill.ts`: `owned confirmado > capturedProposals.<domínio> > default`. O `ActiveStepCard` (`chat/active-step-card.tsx`) já entrega o `builderState` completo via `resolveBuilderState` — os `capturedProposals` chegam de graça no mesmo payload (NFR-05: zero latência extra).

### 4.3 Superfície de Capacidades (FR-06/07) — seção da Visão geral

**Decisão: seção da Overview, NÃO tab nova.** Trade-off: a Overview já é a fonte única de progresso (consome o readiness unificado de 4.4, shipped) e a v2 REDUZ abas (FR-19) — uma tab nova andaria na contramão; e a seção fica visível na primeira tela do painel quando a fase 2 abre. Alternativa rejeitada: tab "Capacidades" — fragmentaria de novo o que a spec quer unificar.

- `preview/tabs/overview/components/capabilities-section.tsx`: linhas com interruptor — Conhecimento (SEMPRE ativo, sem toggle, link para tab Conhecimento — FR-07), Transferir para humano (estado de `builderState.handoff.mode`; proposta de nicho regulado renderiza toggle pré-ligado com badge + reason de `capturedProposals.handoff`), Preços (`pricing.items`/`disclosureStyle`), Agenda (`handoff.alsoSchedule` + `calendar.status` + `calendarConnected` do `getCapabilities`), Fotos (derivado de `mediaImagesCount`), Integrações (lista `customTools`; empty state "nenhuma integração").
- Ligar um toggle EXPANDE inline o card correspondente (mesmos componentes `handoff-card.tsx`/`pricing-card.tsx`/`calendar-connect-card.tsx`, submit pelo MESMO endpoint card-submit — FR-09: nenhuma re-decisão paralela). **Roteamento do submit é OBRIGATORIAMENTE pela mesma função `submitCard` do `use-chat-stream`** (içada junto com o readiness em 4.4, ou via evento `builder:submit-card`): cada submit dispara um turno LLM completo (`ensureBuilderAgent` + `buildSseResponse`, `card-submit.routes.ts:120-155`) e o flip de estado persiste ANTES do stream (`:102-106`), mas as mensagens do chat são estado local do `use-chat-stream` — um consumidor paralelo do stream deixaria o chat aberto SEM o ACK até reload (histórico dessincronizado) e descartaria o turno LLM pago. Consumo único do stream + append do ACK no histórico vivo resolvem os dois. O estado técnico final continua derivado na saga (shipped, `enabled-tools-derivation.ts`).
- Extração client-safe: `derive{Pricing,Handoff,Calendar}ToolChanges` + `reconcileEnabledTools` saem de `deploy/enabled-tools-derivation.ts` (que importa `database`/Prisma) para `deploy/enabled-tools-derivation.pure.ts` (dependency-free), re-exportadas do arquivo original (imports existentes intactos; testes `enabled-tools-derivation.test.ts` seguem verdes). A seção usa as puras para mostrar "o que o agente vai saber fazer" sem segunda fonte de verdade.

### 4.4 UI progressiva (FR-19) + readiness unificado

- **Içar e UNIFICAR o readiness**: hoje existem DUAS queries independentes do mesmo endpoint — `useProjectReadiness` (Overview) e o `READINESS_QUERY` interno de `use-chat-stream.ts` (:78, :202-207; refetch só em SSE finish/card submit, sem polling). O içamento unifica: `workspace.tsx` vira o dono ÚNICO da query de readiness (1 fetch); `PreviewPanel`/`OverviewTab` E o `ChatPanel`/`use-chat-stream` recebem `readiness` + `refetchReadiness` por prop/context (estender `TabRenderContext` em `preview/tab-registry.tsx`), removendo o `READINESS_QUERY` duplicado. Os triggers existentes do chat (refetch em SSE finish e pós-submit) passam a chamar o refetch içado — comportamento preservado.
- **Polling do QR no hook unificado**: o hook içado ganha `refetchInterval` de 5s APENAS enquanto o step ativo é `whatsapp_connect` (senão mantém focus+turno+triggers, shipped). Sem a unificação o polling não funcionaria: o card pinado no CHAT lê o readiness do `use-chat-stream`, não do `use-project-readiness` — polling só na Overview nunca atualizaria o card. É assim que a "autodetecção" de conectado (4.1) de fato acontece; sem WebSocket novo.
- **`tab-registry.tsx`**: novo campo opcional `visibleWhen?: (ctx: { project; readiness }) => boolean`. Em projetos v2 (`readiness.journey` presente), tabs não-acionáveis ficam INVISÍVEIS (filtradas, não locked): Visão geral/Conhecimento/Mídias aparecem na fase Revisar; Testar quando `agentExists`; Publicar pelo `deploy-gate.ts` compartilhado (shipped); Atividade mantém `requiresPublished`; Config/Avançado a partir de Revisar. Em v1, o comportamento locked atual permanece intocado (NFR-03).
- **Chat fullscreen na fase Conhecer**: `workspace.tsx` renderiza só o `ChatPanel` (sem split) enquanto `journey.activePhaseId === 'conhecer'`; o split revela com transição na entrada da fase Revisar. Branch estritamente atrás de `readiness.journey` para zero impacto no v1.

### 4.5 Limpezas (FR-21)

- **IdentityTab REMOVIDA**: `preview/tabs/identity/identity-tab.tsx` é superfície duplicada de persona/tom embutida na `prompt-tab.tsx` (linhas 23/73) gravando `AgentIdentityCard` via `identity/identity.routes.ts`. O único campo não-duplicado (disclosure `ai_explicit`/`human_passthrough`/`custom` + aceite legal) migra como seção avançada do card `agent_review`, aplicado pelo handler do PRÓPRIO card-submit (1 POST — seção 3.3 item 2), reusando server-side os helpers de `@/lib/agent-identity-card`. **Quem consome o disclosure é o `systemPrompt` do `AIAgentConfig` diretamente** via `injectDisclosureIntoPrompt` (hoje em `identity.routes.ts:102-114`, executado só `if (project.aiAgentId)`) — NÃO o sub-agente prompt-writer (verificado: `AgentIdentityCard` não é lido por ele). Como no v2 o disclosure é decidido ANTES de o agente existir, `create_agent` passa a aplicar `injectDisclosureIntoPrompt(metadata.identityCard)` ao criar o systemPrompt — consistente nas duas ordens (decidir antes ou depois do agente). O endpoint PATCH `/builder/identity/:projectId` permanece para edição pós-criação. Deleção do arquivo requer aprovação (seção 9) + doc em `docs/deprecated/` (cascata CLAUDE.md).
- **Saudação dona única**: `persona.greeting` (ownership `card` em FIELD_OWNERSHIP, linha 341) é a única fonte — VERIFICADO: o prompt-writer já lê `builderState.persona.greeting` (`prompt-writer/builder-context.ts:31, 146, 212-213`); nenhum template gera saudação paralela.
- **`quick_reply_chips` MANTIDO** (ver 3.5) — passa a ser usado de fato na fase 1.

## 5. Segurança

- **Auth/roles**: todas as rotas novas/alteradas sob `authOrApiKeyProcedure({ required: true })` (idiom real do módulo builder — ver §3); sem novos papéis — admin/master da org operam o Builder como hoje.
- **Multi-tenant (NFR-01)**: toda query nova filtra `organizationId` (padrão verificado em `apply-card-submit.ts` — findUnique + check explícito + `updateMany` org-scoped; e `readiness-resolver.ts`). `getCapabilities`, `refresh-qr` (connectionId sempre resolvido org-scoped) e `BuilderJourneyEvent` seguem o mesmo padrão.
- **Validação**: Zod no boundary + re-sanitização server-side dos payloads novos (espelhar `sanitizeStringList`/clamps de `apply-card-submit.ts`); `capturedProposals` com max-lengths e whitelist de domínios — o LLM nunca grava shape arbitrário.
- **Sentinels nunca vêm do body** (regra dura existente da doc de `confirmationsSchema`): os 5 novos flipam só via `applyConfirmation` server-side.
- **CSRF**: double-submit já aplicado às mutations (shipped) — os 4 cards novos passam pelo mesmo POST card-submit.
- **Rate limit / QR**: o provisioning NÃO é idempotente (cria instância UAZAPI + Connection a cada chamada) — por isso o card o chama UMA única vez (3.6a) e a regeneração usa a rota `refresh-qr` autenticada e org-scoped (3.6b), com throttle client de 30s no botão "Gerar novamente". `propose_field_values` é limitada pelo próprio turn-loop do meta-agente (mesma classe de `set_project_basics`).
- **Criptografia**: nada novo — tokens de calendário já em AES-GCM (`src/lib/crypto.ts`, usado em `OrganizationProvider` AUXILIARY) e `webhookSecret` já criptografado (`create-custom-tool.tool.ts` linha 244).
- **LGPD (NFR-02)**: `BuilderJourneyEvent.metadata` proibido de conter telefones/nomes de contatos — contrato do `trackJourneyEvent` aceita só um shape tipado sem campos livres de PII; números nunca saem do `builderState`.
- **SSRF**: sem novas superfícies de fetch arbitrário (guards existentes `isWebhookUrlSafe` e `safeFetch` em `ai-agents/knowledge/text-extraction.ts` intactos).

## 6. Observabilidade

### 6.1 Logs estruturados
Prefixo `[journey-v2]` nos warns/infos novos (resolver branch, seed de versão na criação, fallbacks), seguindo o estilo `[chatRoutes.sendMessage]`/`[deploy/enabled-tools]` existente. Sentry continua capturando exceções (instrumentation.ts).

### 6.2 Funil (NFR-04) — `src/server/services/journey-events.ts`
`trackJourneyEvent({ organizationId, projectId, journeyVersion, event, metadata? })` — fire-and-forget, try/catch interno, NUNCA lança (padrão `hasActiveCalendarConnection` fail-open). Vocabulário fechado (union TS): `journey_started` (emitido nos DOIS caminhos de criação — `createWithInitialMessage` E `duplicateProject`, `projects.repository.ts`; ver seed em 2.2), `identity_done` (submit business_identity OU accept de source), `review_done` (submit agent_review), `agent_created` (tool create_agent), `test_done` / `test_skipped` (test_drive ou auto-flip do playgroundStream), `channel_connected` (transição para `CONNECTED` detectada no webhook UAZ, `resolve-connection.ts`), `published` (saga → status live, `deploy-flow.orchestrator.ts`), `next_steps_ack`. Funil = `MIN(createdAt)` por (projectId, event). Decisões rejeitadas: reusar `AuditLog` (semântica de auth, poluiria índices e não carrega journeyVersion); lib externa de analytics (dep nova sem justificativa).

### 6.3 Auditoria existente
`BuilderToolCall` já loga toda invocação de tool do meta-agente (inclui as novas `propose_field_values`); nenhum trabalho extra.

## 7. Testes

### 7.1 Vitest (unit, por função — co-localizados `*.test.ts`)
- `state/journey-v2.test.ts`: ordem das fases; `business_identity` satisfeito por `confirmations.source`; `test_drive` flipado por tested E por skip; `whatsapp_connect` done APENAS por `ctx.hasConnectedWhatsAppInstance` (presença de Connection DISCONNECTED NÃO completa); `published_next_steps` surfa só com `hasLiveDeployment`; completeness monotônico; `isDeployReady` exige blockers zerados (reusa `computeBlockers`).
- `state/next-pending-step.test.ts` (existente) DEVE permanecer verde sem edição — prova de que v1 está intocado (NFR-03).
- `cards/builder-state.test.*`: `journeyVersion` default 1; `capturedProposals` parse/backfill legado; `clearCapturedProposals` remove só o domínio dado (deepMerge nunca deleta — teste de regressão do invariante); sentinels novos default false.
- `cards/handlers/` novos branches: `agent_review` flipa exatamente persona+services+hours em 1 write, limpa `capturedProposals` explicitamente e aplica disclosure opcional no `metadata.identityCard`; `business_identity` espelha nome no projeto; `test_drive` skip vs tested (copy do ACK); auto-flip do `playgroundStream` é fail-open (erro de DB não quebra o stream); sanitização (lengths, trims).
- `deploy/enabled-tools-derivation.test.ts` (existente) segue verde após a extração `.pure.ts` (só re-export).
- `lib/feature-flags/builder-v2.test.ts`: parse on/off/percentage + override cookie + hash estável (espelho do auth-v3).
- `services/journey-events.test.ts`: nunca lança em erro de DB; rejeita metadata com chaves fora do contrato.
- `projects.repository`: `duplicateProject` de projeto v2 herda `journeyVersion: 2` (sem downgrade silencioso) e emite `journey_started`.
- `tab-registry`: `visibleWhen` v2 filtra (invisível) vs v1 locked (regressão).

### 7.2 Playwright (E2E, por fluxo — fixtures: org seedada + cookie `builder-v2-override=on`)
- `builder-v2-com-site.spec.ts`: 2 perguntas → fonte aceita → agent_review prefillado → teste responde → publicar (critérios §8 itens 1 e 3).
- `builder-v2-sem-site.spec.ts`: business_identity pela conversa → agente de teste responde "onde fica?" (item 2).
- `builder-v2-capacidades.spec.ts`: conhecimento sempre-on; transferir OFF por default publica e responde sozinho; ligar roleta expõe config inline e o ACK aparece no chat aberto (consumo único do stream — 4.3); (itens 4-5).
- `builder-v2-lancamento.spec.ts`: teste oferecido antes da ativação; "Publicar sem testar" funciona; QR re-apresentável até conectar SEM criar segunda instância (refresh-qr); pós-publicação mostra próximos passos (itens 8, 9, 13).
- `builder-v2-progressivo.spec.ts`: primeira tela só conversa; tabs aparecem por fase; nenhum tab visível-porém-bloqueado em v2 (item 12).
- `builder-v1-regressao.spec.ts`: flag off → jornada v1 completa intocada (NFR-03).

## 8. Riscos & alternativas

1. **Dois step-engines divergindo para sempre** — mitigação: v2 importa `computeBlockers`/`FIELD_OWNERSHIP`/helpers do v1 (proibido fork desses primitivos; lint de revisão no /break) + plano de convergência da seção 10 (Onda 7). Alternativa rejeitada: migrar estados v1→v2 no MVP — a spec (§9 decisão 4) decidiu explicitamente contra; risco de perda de decisões confirmadas > benefício.
2. **SSE do card-submit consumido fora do chat** (Capacidades/Overview) — dois agravantes: (a) cada submit dispara um turno LLM completo (`ensureBuilderAgent` + `buildSseResponse`, `card-submit.routes.ts:120-155`) — toggle vira custo/latência LLM por clique; (b) o flip de estado é seguro (persiste ANTES do stream, :102-106), mas as mensagens do chat são estado local de `use-chat-stream` — consumidor paralelo deixaria o histórico sem o ACK até reload. Mitigação PRINCIPAL: roteamento obrigatório pela mesma `submitCard` do chat (4.3) — consumo único + ACK no histórico vivo (chat = log da configuração). Validação de que o stream fecha limpo sem consumidor fica no /break apenas como fallback defensivo. Alternativa rejeitada: endpoint paralelo sem SSE — duplicaria o protocolo de escrita.
3. **Ampliar `StepId` quebra switches exaustivos** — risco mitigado por construção: grep completo não encontrou switch exaustivo sobre `StepId`; adapters atuais (`stepsToStages`, registry `STEP_TO_CARD` com `Partial<Record<StepId>>`) usam lookup tolerante (retornam undefined). Re-grep barato antes da Onda 1 como cinto de segurança.
4. **Polling lento para detectar QR conectado** — mitigação: intervalo 5s no hook de readiness UNIFICADO (4.4) só enquanto o step ativo é `whatsapp_connect` — alcança o card pinado no chat, que é onde a detecção importa. Alternativa rejeitada: WebSocket novo — custo desproporcional, o hot path getReadiness é barato (counts indexados).
5. **Card composto estoura limite de linhas** — mitigação: seções extraídas reutilizadas pelos cards individuais; e o handler entra em `handlers/apply/journey-v2.ts` (split de 3.3), não no entrypoint já acima do guideline. Alternativa rejeitada: duplicar formulários — viola zero-código-morto/duplicação.
6. **`capturedProposals` alucinados pelo LLM** — mesmo invariante do `sourceIngestion.proposed` (nunca flipa sentinel; confirmação humana obrigatória) + zod estrito. Risco residual: proposta errada prefillada — o usuário edita antes de confirmar (é exatamente o "configure por exceção").
7. **Conhecimento sempre-on: o vínculo da KnowledgeCollection NÃO existe na saga e o lazy-wiring tem gap** — verificado: a saga de deploy não vincula collection nenhuma (zero matches de `ragCollectionId`/`useRAG` em `builder/deploy/`; o comentário de `playground-stream.ts:104-106` "o vínculo acontece na saga de deploy" está STALE). O vínculo real é lazy em `wireCollectionToProject` (`knowledge-helpers.ts:67-86`), que só seta `ragCollectionId`+`useRAG` `if (project.aiAgentId)` (:80). Na v2 a fonte é colada na fase Conhecer ANTES do agente existir (agent_approval é fase 2) e `create-agent.tool.ts` não faz backfill — o agente publicado ficaria SEM RAG (gate do runtime: `prepare-agent-call.ts:208`); é o P0 "playground sem RAG" sistematizado pela v2. Mitigação (Onda 4): ADICIONAR o vínculo — backfill no `create_agent` (ler `project.metadata.knowledgeCollectionId` e setar `ragCollectionId`+`useRAG`) E passo `materialize_knowledge` na saga (rede dupla, idempotente); corrigir o comentário stale do `playground-stream.ts`.
8. **Fullscreen fase 1 regride layout v1** — branch estritamente atrás de `readiness.journey !== undefined` + spec E2E de regressão v1.
9. **`journeyVersion` em JSONB não indexado** — única query por versão é operacional (sunset/convergência), aceitável; se virar hot path, promover a coluna é migration trivial futura.

## 9. Aprovação necessária (CLAUDE.md)

- [ ] **Mudança no schema Prisma**: novo modelo `BuilderJourneyEvent` (`builder_journey_events`) + migration (seção 2.1). É a ÚNICA mudança de schema do plano. **Cascata obrigatória**: atualizar `docs/ERD.md` + tabela de modelos Prisma do `CLAUDE.md` na mesma onda.
- [ ] **Deleção de arquivos**: `src/client/components/projetos/preview/tabs/identity/identity-tab.tsx` (+ remoção do embed em `prompt-tab.tsx`) — Onda 6. **Cascata obrigatória**: criar `docs/deprecated/IDENTITY_TAB.md` (feature removida — regra do CLAUDE.md).
- [ ] **Novas deps npm**: NENHUMA.
- [ ] **Env var nova**: `BUILDER_JOURNEY_V2` (off|on|percentage:N) + cookie `builder-v2-override` — documentar em `.env.example`. **Cascata obrigatória**: atualizar `docs/infra/SECRETS.md` (regra `.env.example` → SECRETS.md do CLAUDE.md).

## 10. Fases de entrega (ondas shippáveis — input do /break)

**Onda 0 — Fundações dark (flag + funil).** `builder-v2.ts` flag; `journeyVersion` no zod + seed nos DOIS caminhos de criação (`createWithInitialMessage` $transaction E `duplicateProject` com herança da versão + criação lazy da conversa respeitando a versão herdada — 2.2); migration `BuilderJourneyEvent` + cascata `docs/ERD.md` + tabela do CLAUDE.md; env em `.env.example` + cascata `docs/infra/SECRETS.md`; `trackJourneyEvent` + evento `journey_started` nos dois caminhos. *Pronto quando*: tudo invisível ao usuário, v1 intocada, suíte verde, evento gravado na criação E na duplicação, docs em cascata atualizadas.

**Onda 1 — Engine v2 + leitura.** `journey-v2.ts` + extensão de `StepId`/`Readiness.journey` + `hasLiveDeployment` E `hasConnectedWhatsAppInstance` no resolver (3.1) + branch por versão; adapters da Overview renderizam fases quando `journey` presente; banner v2-aware. *Pronto quando*: projeto com cookie override navega as 4 fases usando os cards existentes mapeados; `next-pending-step.test.ts` inalterado e verde.

**Onda 2 — Conhecer.** Card `business_identity` (schema+handler+componente+registry); chips instruídos em `journey-rules`; evento `identity_done`. *Pronto quando*: E2E "sem site" passa (agente responde "onde fica?").

**Onda 3 — Revisar.** Split de `apply-card-submit.ts` em `handlers/apply/*` (3.3 — pré-requisito do guideline de tamanho); namespace `capturedProposals` + `clearCapturedProposals` + tool `propose_field_values` + card composto `agent_review` (com extração de seções; horários default "sempre aberto"; disclosure como seção avançada aplicada no mesmo handler + `injectDisclosureIntoPrompt` no `create_agent`; proposta de handoff por nicho regulado via `research_niche`). *Pronto quando*: 2 perguntas → proposta consolidada prefillada; nenhum dado pedido duas vezes (critério §8 item 3); evento `review_done`.

**Onda 4 — Capacidades.** Extração `.pure.ts`; `getCapabilities`; `capabilities-section.tsx` na Overview (conhecimento sempre-on; toggles abrem cards inline; submits roteados pela `submitCard` do chat — 4.3); **vínculo do conhecimento ADICIONADO** (risco 7): backfill no `create_agent` + passo `materialize_knowledge` na saga + correção do comentário stale em `playground-stream.ts`; steps opcionais `knowledge`/`media`. *Pronto quando*: critérios §8 itens 4-6 verificáveis ponta a ponta, incluindo agente publicado COM RAG quando a fonte veio antes do agente.

**Onda 5 — Testar + Lançar.** Cards `test_drive` (escape explícito + auto-flip no `playgroundStream` fail-open + `run_playground_test` pelo helper compartilhado), `whatsapp_connect` (provision uma-vez + rota nova `POST /builder/channel/refresh-qr` + autodetecção via `hasConnectedWhatsAppInstance`), `published_next_steps`; unificação do readiness (workspace dono único, `READINESS_QUERY` do chat removido) + polling 5s condicionado ao step (4.4); activation prefill default; eventos `test_*`/`channel_connected`/`published`. *Pronto quando*: critérios §8 itens 8, 9 e 13 passam no E2E; "Gerar novamente" não cria instância nova no broker.

**Onda 6 — UI progressiva + limpeza.** `visibleWhen` no tab-registry (v2 invisível, v1 locked intacto); fullscreen fase Conhecer; remoção da IdentityTab (aprovação) + `docs/deprecated/IDENTITY_TAB.md` + disclosure já vivendo no agent_review (Onda 3); saudação dona única (já verificada no prompt-writer — 4.5). *Pronto quando*: critério §8 item 12 + zero código morto (FR-21) + doc deprecated criada.

**Onda 7 — Rollout & convergência.** `percentage:10 → 50 → 100` para projetos NOVOS (seed=organizationId); dashboard/queries do funil; monitorar drafts v1 ativos (query JSONB por `journeyVersion`); quando drafts v1 ativos = 0 por 60 dias: remover `QUAYER_STEPS`-only paths, o branch do resolver e o flag (issue de sunset criada já nesta onda). *Pronto quando*: 100% de projetos novos em v2 com funil medindo as metas da spec §2; plano de sunset registrado.

## Veredito do crítico

**Verdict:** `precisa_revisao` → **13 issues incorporadas** neste plano final (12 correções obrigatórias + 1 decisão de naming: `capturedProposals` escolhido e propagado). Principais correções absorvidas: sinal de conexão real do WhatsApp (`hasConnectedWhatsAppInstance` com status `CONNECTED`+projectId, em vez do count de presença); provisioning não-idempotente → provision uma-vez + rota nova `refresh-qr` autenticada; conhecimento sempre-on exige ADICIONAR backfill/materialize (não há gate a remover — lazy wiring só com `aiAgentId`); polling do QR no readiness UNIFICADO (o card pinado lê o hook do chat, não o da Overview); split de `apply-card-submit.ts` (876 linhas > máx 800); disclosure em 1 POST real via handler do agent_review + `injectDisclosureIntoPrompt` no create_agent (prompt-writer NÃO consome o identity card); clear explícito de `capturedProposals` (deepMerge nunca deleta); seed/`journey_started` também no `duplicateProject`; cascatas CLAUDE.md (ERD/SECRETS/deprecated); `authOrApiKeyProcedure` como idiom correto; auto-flip do testDrive no `playgroundStream` (caminho real do usuário); submits de Capacidades roteados pela `submitCard` do chat (consumo único do SSE).

**Confirmações do crítico (16, resumidas):** custom tools vivem em `AgentTool` (sem modelo `CustomTool`); citações de linha do schema corretas (builderState:1884, BuilderToolCall:1994, BuilderDeployment live+índice); `parseBuilderState` aditivo/backfill seguro; registry per-card aceita os 4 payloads sem reescrever dispatch (quick_reply_chips existe end-to-end — manter é correto); apply* são funções locais e o refactor proposto é o necessário; `StepId` ampliável com segurança (lookup tolerante em todos os consumidores); primitivos do engine exigem exatamente a extração planejada (`step-helpers.ts`); padrão transacional do `set_project_basics` confere para `propose_field_values`; extração `.pure.ts` justificada; flag idiom auth-v3 + decisão por tabela própria de eventos bem fundamentadas; `getReadiness`/resolver org-scoped como descrito (NFR-05 ok); IdentityTab é embed duplicado real; prompt-writer já lê `persona.greeting`; workspace/tab-registry comportam `visibleWhen` aditivo; decisões 1-4 da spec §9 refletidas 1:1; quick-wins shipped existem como descrito — o plano constrói sobre, não re-planeja.
