---
Criado: 2026-06-09
Atualizado: 2026-06-09
Revisar em: quando a Onda 2 iniciar (ou 2026-07-09)
Relacionados:
  - docs/builder/ORAYON_UPLIFT_SPEC.md
  - src/server/ai-module/builder/state/next-pending-step.ts
  - src/server/ai-module/builder/cards/builder-state.ts
  - src/client/components/projetos/chat/cards/card-registry.tsx
---

# Blueprint de Melhorias do Builder — Plano em Ondas

Plano de execução das melhorias dos cards/etapas do Chat Builder, organizado por
**risco e valor estrutural** (não 1 card = 1 item). Origem: revisão multi-agente
(maps → plan → verify → synthesize) com verificação adversarial contra o código real.

## 0. Princípios transversais

1. **Porta de intenção, não menu.** A entrada do orquestrador é uma pergunta aberta
   ("o que vamos construir?") + roteador — extensível a N fluxos. "Criar agente" é só
   o primeiro fluxo. Menu fixo de tipos fecharia o produto.
2. **Arquétipo inferido, não escolhido.** Tipo de agente (secretária/SDR/closer/
   vendedor/suporte/FAQ) é derivado do texto como chip revisável — condiciona quais
   cards aparecem e o vocabulário. Mata o viés SDR.
3. **Dual-input (anti-trava).** Se o usuário escreve em vez de usar o card, nunca trava:
   o agente interpreta, pré-preenche o card como rascunho e pede confirmação.
4. **Card é atalho DENTRO de um fluxo delimitado**, nunca a decisão de qual fluxo é.

## 1. Cobertura: cada card → onda

| Card | Melhoria | Onda | Tipo |
|---|---|---|---|
| ① identity / ② objective | abertura + arquétipo + fundir | **3** | front+back |
| ③ source_progress | feedback "lendo…" no mesmo turno + erro/retry | **5** | back(chat)+front |
| ④ agent_persona | bloquear confirm vazio · voz no card | **5** (voz dep. Onda 3) | front |
| ⑤ services | renomear "O que faz / não faz" | **3d** | front |
| ⑥ business_hours | "fora do horário" | **3d** | front+state |
| ⑦ pricing | esconder avançado · opcional por arquétipo | **5** (dep. Onda 3) | front+state |
| ⑧⑨⑩⑪ qualif./equipe/pairing | fundir no card **handoff** | **2** | front+back |
| ⑫ calendar_connect | gating via "também agenda" | **2** | state |
| ⑬ activation_mode | esconder modos avançados | **3d** | front |
| ⑭ silenced_contacts | aparecer sempre como opcional | **5** | state |
| ⑮ tool_selection | auto-selecionar pelo arquétipo + migrar p/ registry | **5** (dep. Onda 3) | front+back |
| ⑯ channel | ~~remover~~ | 🚫 **descartado** | — |
| ⑰ agent_approval | ~~fundir no resumo~~ | 🚫 **descartado** | — |
| ⑱ preview_summary | "Ajustar" com deep-link | **3d** | front |
| ⚡ quick_reply_chips | loading após o toque | **5** | front |
| (transversal) dual-input | anti-trava em todas as etapas | **3** | back |
| (aba) Avançado | buffer/multimodal/voz/idioma/typing + pausa | **1** + pausa na **4** | front+back |

**Descartados de propósito (a revisão provou que estavam errados):**
- ⑯ remover Channel — **falso que tenha 1 opção**: `CHANNEL_CATALOG` tem 3 canais
  (cloudapi/uazapi/instagram). Manter.
- ⑰ fundir Aprovação no Resumo — **quebra causalidade**: `agentApproved` é o gate que
  autoriza `create_agent`, que roda ANTES de o summary existir.

## 2. As ondas

### Onda 1 — Aba Avançado ✅ CONCLUÍDA (commit `d824be3`)
Front-only, sem schema. Fix do bug do provider TTS ([agent-runtime-settings.ts:139](../../src/lib/agent-runtime-settings.ts))
que gravava sempre `elevenlabs`; + `maxMessages` editável; + Select de provider coerente
(Deepgram usa `voiceId` como voz Aura); + Alert de credencial dinâmico.

### Onda 2 — Handoff unificado (funde ⑧⑨⑩⑪ → card `handoff` de 4 seções)
Backend de runtime (routing self/department/queue, round-robin, warm transfer) **já existe**.
Decisões aprovadas: **toggle ortogonal "também agenda"** + **roteiro de qualificação fundido**
como 4ª seção.
- Seções do card: (1) modo solo/roleta/departamentos · (2) roster condicional ·
  (3) roteiro de qualificação · (4) "também agenda" + mensagem de abertura.
- Estado: `handoffStateSchema = { mode, alsoSchedule, steps[], department?, members[], openingMessage? }`;
  **1 sentinela** `handoff` no lugar de 4; `needsCalendar = handoff.alsoSchedule`.
- Resolve os 2 bloqueadores que travavam o plano: agenda volta a ser alcançável (toggle
  ortogonal) e `qualification_steps` deixa de ser passo não-contíguo (vira seção do card).
- **Gargalo serial** — é a fonte canônica do schema de handoff; Ondas 3 e 4 rebaseiam sobre ela.
- **[APROVAÇÃO]** muda contrato do `builderState` (JSONB) + `card-submit.schemas.ts` +
  **deleta 4 cards de produção** (`qualification-action`, `qualification-steps`,
  `team-structure`, `handoff-pairing`) + backfill do system prompt.

### Onda 3 — Intenção + arquétipo + dual-input + cleanups seguros
Sub-serializada (3a→3b→3c→3d) por tocar arquivos-núcleo compartilhados.
- **3a dual-input**: `prefill_card_from_text` (texto livre vira rascunho de card; nunca trava).
- **3b arquétipo**: `archetypeStateSchema` + `applies()` por arquétipo (guard legado:
  `confirmed=false` → todos os cards aplicam).
- **3c intenção**: `route_intent` (porta de prioridade máxima).
- **3d cleanups seguros**: ⑤ renomear · ⑬ esconder modos · ⑱ deep-link "Ajustar" ·
  ⑥ "fora do horário".
- **[APROVAÇÃO]** contrato do `builderState` (JSONB) + prompts estáticos (backfill por org).

### Onda 4 — Pausa 24h + subject-router (backend)
- **pause-24h**: ligar `ChatSession.pausedUntil` + `Organization.autoPauseDurationMinutes`
  na decisão de responder (`canDispatchAi`). **Sem migration** (colunas existem). Resolver
  política única (não setar `aiEnabled=false`, senão IA nunca volta) e unidade (15min vs 24h).
- **subject-router**: classificador de assunto p/ DEPARTAMENTOS. **[APROVAÇÃO — única
  migration Prisma]** `Department.routingKeywords Json?` → cascata `docs/ERD.md` +
  tabela Prisma no `CLAUDE.md` + deploy GATED homol→prod.

### Onda 5 — Polish por card (NOVO — fecha a cobertura)
Junta os furos que não eram estruturais. Divide-se por dependência:
- **5a — front-only, sem dependência (worktree-paralelo seguro):**
  - ③ `source-progress-card` — estado de **erro + retry** visível quando a síntese falha.
  - ④ `agent-persona-card` — **bloquear confirm** com persona vazia (exigir nome ou saudação).
  - ⚡ `quick-reply-chips-card` — **loading** após o toque (hoje fica "apertado" mudo).
  - ⑭ `silenced-contacts` — aparecer **sempre como opcional** (não só no modo blacklist).
- **5b — backend de chat (pequeno):**
  - ③ `chat.routes` — emitir o `source_progress` ("lendo seu site…") **no mesmo turno**,
    antes do enqueue do job (mata a dor "colei e não apareceu nada").
- **5c — depende da Onda 3 (arquétipo) existir:**
  - ⑮ `tool_selection` — **auto-selecionar** tools pelo arquétipo + migrar p/ registry.
  - ⑦ `pricing` — esconder avançado + tornar **opcional** por arquétipo.
  - ④ voz dentro do card de Persona quando o arquétipo pede (secretária/closer).

## 3. Portões de aprovação

| Onda | Mudança que exige OK humano |
|---|---|
| **2** | contrato `builderState` (JSONB) · `card-submit.schemas.ts` · deletar 4 cards de produção · backfill prompt |
| **3** | contrato `builderState` (JSONB) · prompts estáticos (backfill) |
| **4** | **migration Prisma** (`Department.routingKeywords`) + cascata ERD/CLAUDE.md + deploy GATED |
| **1, 5** | nenhum (front-only / backend isolado) — só push exige aprovação |

> Nenhuma onda toca `src/middleware.ts`. Só a Onda 4 (subject-router) toca `prisma/schema.prisma`.

## 4. Paralelização vs serialização

**Núcleo serial inegociável (1 escritor por vez, `next-pending-step.test.ts` verde após cada merge):**
`next-pending-step.ts`, `builder-state.ts`, `readiness.types.ts`, `card-submit.schemas.ts`,
`apply-card-submit.ts`, `journey-rules.ts`, `whatsapp-agent-system-prompt.ts`.

**Pode rodar em worktree-paralelo:** Onda 1 (feito), Onda 4 `pause-24h` (backend de webhook),
Onda 5a (cards isolados).

**Sequencial obrigatório:** Onda 2 → Onda 3 (3a→3b→3c→3d) → Onda 4 `subject-router` → Onda 5c
(depende do arquétipo da Onda 3).

## 5. Ordem de execução recomendada

1. ✅ **Onda 1** — feito.
2. **Resolver o WIP paralelo** (CRUD de projetos + `igniter.schema.ts`) para ramificar de base estável.
3. **Onda 5a** (front-only) — pode ir em paralelo, baixo risco, fecha furos de UX visíveis.
4. **Onda 2** (handoff) — gargalo serial, fonte canônica do schema de handoff.
5. **Onda 3** (3a→3b→3c→3d) — rebaseia sobre a Onda 2.
6. **Onda 5c** (tools auto / pricing opcional / voz no card) — depende do arquétipo (Onda 3).
7. **Onda 4** (pausa 24h em paralelo; subject-router após Onda 2/3, com migration aprovada).

## 6. Riscos abertos

- **Budget de tool-loop:** intent-door + arquétipo + dual-input somam +tool-calls no turno
  inicial (`stepCountIs(5)` + `MAX_SESSION_COST_USD=5`). Revisar limite na Onda 3.
- **Orçamento `journey-rules.ts` (<300 tokens):** 3 regras novas no mesmo arquivo podem
  estourar — medir e harmonizar.
- **States legados:** mapear sentinelas antigas→novas em `parseBuilderState` (Onda 2) para
  jornadas em andamento não re-surgirem passos pendentes.
- **pause-24h:** política única (não matar `aiEnabled`) e fonte de unidade autoritativa.
