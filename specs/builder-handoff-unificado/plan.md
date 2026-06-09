---
Criado: 2026-06-09
Atualizado: 2026-06-09
Revisar em: ao concluir a Onda 2 (ou 2026-07-09)
Relacionados:
  - specs/builder-handoff-unificado/spec.md
  - docs/builder/MELHORIAS_BLUEPRINT.md
---

# Plano técnico — Handoff unificado do Chat Builder

> Defaults Q1-Q3 da spec assumidos: modo `nenhum` incluído; `book_appointment`→`solo`+`alsoSchedule`;
> `handoff` é passo obrigatório. Ordem CLAUDE.md (sem Prisma): **Zod → interfaces → handlers →
> schemas de rota → frontend → testes**.

## 1. Stack & dependências

- **Reutiliza:** `zod`, Igniter.js (rota de card-submit já existe), React + Tailwind + design tokens,
  `phone-br` (normalização E.164), `useSourceStatusPoll`/padrões de card já existentes.
- **Novas libs:** nenhuma. ✅
- **Drag-to-reorder** do roteiro: reusar o padrão nativo HTML5 já usado em
  `qualification-steps-card.tsx` (será portado para a seção 3 do novo card).

## 2. Modelo de dados

> **Sem mudança no `prisma/schema.prisma`.** O estado vive em
> `BuilderProjectConversation.builderState` (JSONB). A "migração" é em código.

### 2.1 Novo `handoffStateSchema` (em `builder-state.ts`)
```
handoffMode = z.enum(['solo','roleta','departamentos','nenhum'])
handoffStateSchema = z.object({
  mode: handoffMode.optional(),
  alsoSchedule: z.boolean().default(false),
  steps: z.array(z.string()).default([]),        // roteiro de qualificação (fundido)
  departmentName: z.string().optional(),
  departmentType: z.string().optional(),
  members: z.array(teamMemberSchema).default([]), // reusa teamMemberSchema (já tem whatsapp + connectionId)
  openingMessage: z.string().optional(),
})
```
- `builderStateSchema`: adicionar `handoff: handoffStateSchema.default({...})`; **remover**
  `qualification` e `team` (subsumidos). Manter `calendar` (gating muda, schema não).
- `confirmations`: **adicionar** `handoff`; **remover** `qualificationAction`,
  `qualificationSteps`, `team`, `handoffPairing`.

### 2.2 Migração de estado legado (em `parseBuilderState`) — RISCO CRÍTICO
Função pura `migrateLegacyHandoff(raw)` aplicada ANTES do `safeParse`, quando o JSON tem
`qualification`/`team` mas não `handoff`:
- `mode`: `qualification.action==='notify_team'` → `team.members.length>0 ? 'roleta' : 'solo'`;
  `'book_appointment'` → `'solo'`; `'lead_only'` → `'solo'`; ausente → deixa `undefined`.
- `alsoSchedule`: `qualification.action==='book_appointment'` → `true`, senão `false`.
- `steps`: `qualification.steps` (preservado).
- `members`/`departmentName`/`departmentType`/`openingMessage`: copiados de `team`.
- `confirmations.handoff`: `true` se (`qualificationAction` || `qualificationSteps` || `team`)
  estavam confirmados — para a jornada em andamento **não re-exibir** o passo.
- Nunca lança (mantém o contrato `parseBuilderState` → DEFAULT em falha).

## 3. API (Igniter.js)

> **Sem novo controller/rota.** A rota `POST /builder/projects/:id/cards/:cardKey/submit`
> já existe e é campo-agnóstica.

- `card-submit.schemas.ts`: adicionar `handoffPayloadSchema` (discriminatedUnion por `cardKey`);
  **remover** os 4 payloads antigos. Payload: `{ cardKey:'handoff', mode, alsoSchedule, steps[],
  departmentName?, departmentType?, members[], openingMessage? }`.
- `apply-card-submit.ts`: adicionar `applyHandoff(state, payload)` (sanitiza members →
  E.164, dedupe, valida mode); flip `confirmations.handoff`; **remover** os 4 cases antigos
  do switch (atualizar o guard exaustivo `_never`).
- `readiness.types.ts`: union `StepId` — remover `qualification_action`/`qualification_steps`/
  `team`/`handoff_pairing`, adicionar `handoff`.
- `next-pending-step.ts`: fundir as 4 `StepDefinition` numa só (`handoff`); remover os overrides
  `handoffPairingActive`; trocar `needsCalendar` para `state.handoff.alsoSchedule===true`;
  atualizar `REQUIRED_STEPS` e o cálculo de completeness; `FIELD_OWNERSHIP` (campos do handoff = 'card').
- `readiness-resolver.ts`: repassar o `handoff` no `builderState` retornado (sem lógica nova).
- `materialize-team.handler.ts` (saga de deploy): ler `state.handoff.mode`
  (`solo`→routing self, `roleta`/`departamentos`→department, `nenhum`→sem handoff) e
  `alsoSchedule`. Hoje lê `state.team`/`state.qualification` — repontar para `state.handoff`.

## 4. Frontend

- **NOVO** `handoff-card.tsx` (4 seções): (1) seletor de modo (radio solo/roleta/departamentos/nenhum);
  (2) roster condicional (porta o editor de membros do `team-structure-card`, com WhatsApp/connectionId
  por linha — UMA vez); (3) roteiro (porta o editor ordenável do `qualification-steps-card`);
  (4) toggle "também agenda" + textarea de mensagem de abertura. Apresentacional; `onSubmit(payload)`.
- `card-registry.tsx`: registrar `handoff` → `HandoffCard` (StepId `handoff`); corrigir docstring de contagem.
- `cards/types.ts` (FE): `CardKey` union — remover os 4, adicionar `handoff` (a asserção
  `RegisteredCardKey extends CardKey` garante o lockstep em compile-time).
- `chat-panel.tsx`: o `ActiveStepCard` já resolve via `getCardForStep` — sem branch novo, só
  validar o pinned slot.
- `preview-summary-helpers.ts`: consolidar `summarizeQualification` + `summarizeTeam` num
  `summarizeHandoff(state.handoff, state.calendar)`.
- **DELETAR** `qualification-action-card.tsx`, `qualification-steps-card.tsx`,
  `team-structure-card.tsx`, `handoff-pairing-card.tsx`.
- Estados: loading/disabled herdados do `disabled` (streaming); erro de telefone inline (reusa `phone-br`).

## 5. Segurança

- `authProcedure({ required: true })` na rota — inalterado.
- Re-validação server-side no `applyHandoff`: normaliza WhatsApp dos membros (E.164-BR),
  valida `mode` contra o enum, `connectionId` é tenant-scoped (validado no runtime, fail-open).
- Escopo `organizationId` em todo o fluxo — inalterado.
- LGPD: preservar o aviso de base legal do warm transfer na seção de roster/abertura.

## 6. Observabilidade

- `migrateLegacyHandoff`: emitir 1 log estruturado (`builder.handoff.migrated`) quando upgrada
  um estado legado, com o `mode` resultante — para auditar a migração em produção.
- Sem nova tabela de auditoria.

## 7. Testes

- **`next-pending-step.test.ts` (reescrever):** os fixtures `fullyCompletedState`/
  `stateUpToActivation` trocam os 4 sentinels por `handoff`; casos: solo (sem roster),
  roleta (com roster), `alsoSchedule` liga o passo calendar, `nenhum` satisfaz sem roster.
- **NOVO `migrate-legacy-handoff.test.ts` (Vitest):** cada mapeamento de Q1-Q3 + preservação
  de `steps`/`openingMessage` + `confirmations.handoff` herdado (não re-exibe).
- **Card (opcional):** smoke do `handoff-card` (render por modo).
- E2E (Playwright): fora do escopo desta onda (cobertura do fluxo completo vem depois).

## 8. Riscos & alternativas

- **R1 — Migração de estado vivo (ALTO):** mitigado pela `migrateLegacyHandoff` + teste
  dedicado + log. Alternativa rejeitada: "deixar legado quebrar" (re-exibe passo, perde dados).
- **R2 — Compile atômico:** BE (Zod/handler/engine) + FE (types/registry/card) precisam mudar
  juntos para o tsc passar. Mitigação: **1 commit atômico** para o núcleo; prompts/backfill em
  commit separado (não quebram tsc).
- **R3 — Backfill de prompt por org:** `ensureBuilderAgent` usa `update:{}` (não re-aplica o
  system prompt). Script de re-provisionamento por org como passo SEPARADO (não bloqueia o merge).
- **Alternativa rejeitada:** "4º modo Agenda" em vez de toggle ortogonal — perderia
  combinações (roleta+agenda). Decisão da spec mantém o toggle.

## 9. Aprovação necessária

- [ ] Mudanças em `prisma/schema.prisma` — **N/A** (nenhuma).
- [ ] Mudanças em `src/middleware.ts` — **N/A** (nenhuma).
- [ ] Novas dependências npm — **N/A** (nenhuma).
- [x] **Deleção de arquivos de produção** — 4 cards (`qualification-action`, `qualification-steps`,
      `team-structure`, `handoff-pairing`). **Aprovado pelo usuário.**
- [x] **Mudança de contrato de dados (JSONB `builderState`)** + migração de estado legado.
      **Aprovado pelo usuário** (mapeamento Q1-Q3).

---

**Próximo passo:** `/break` — quebrar em tarefas atômicas ordenadas (com o núcleo como 1 task
atômica de compile + tasks de teste/prompt/backfill separadas).
