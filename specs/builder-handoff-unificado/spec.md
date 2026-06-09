---
Criado: 2026-06-09
Atualizado: 2026-06-09
Revisar em: ao concluir a Onda 2 (ou 2026-07-09)
Relacionados:
  - docs/builder/MELHORIAS_BLUEPRINT.md
  - src/server/ai-module/builder/cards/builder-state.ts
  - src/server/ai-module/builder/state/next-pending-step.ts
---

# Spec — Handoff unificado do Chat Builder

## 1. Resumo executivo

Fundir os 4 cards de "passagem para humano" do Chat Builder (`qualification_action`,
`qualification_steps`, `team_structure`, `handoff_pairing`) num **único card `handoff`
de 4 seções**, com um modelo de 3 modos claros (solo / roleta / departamentos) e um
toggle ortogonal "também agenda" — reduzindo a jornada e tirando o viés de vendas.

## 2. Problema & Motivação

- **Viés de SDR/vendas:** o `qualification_action` força TODO agente — inclusive
  suporte/FAQ — a escolher entre `notify_team` / `book_appointment` / `lead_only`,
  vocabulário de funil de venda que não cabe em vários casos.
- **Duplicação real:** o WhatsApp do atendente é coletado **duas vezes** — em
  `team_structure` e de novo em `handoff_pairing` — confundindo o usuário.
- **Jornada fragmentada:** 4 paradas para configurar uma única decisão ("como o
  agente passa o bastão"). O conceito de **3 modos** (solo/roleta/departamentos) é
  mais direto para o dono de negócio.
- **Por que agora:** o backend de runtime (routing self/department/queue, round-robin
  atômico, warm transfer F0) **já existe** — falta só a UI/estado de design-time se
  alinharem a ele. Custo baixo, valor alto.
- **Impacto esperado:** menos fricção (4 cards → 1), menos abandono no meio da
  configuração, e o Builder deixa de tratar todo agente como vendedor.

## 3. Usuários afetados

- **Founder / dono do negócio** (persona principal, leigo) — configura o agente no
  Chat Builder.
- **Operador / atendente** (membro da roleta) — recebe o lead via warm transfer.
- **Lead/cliente final** — indiretamente (recebe a mensagem de abertura no handoff).

Permissões: usuário autenticado da organização dona do projeto (escopo
`organizationId`). Sem novos papéis.

## 4. User Stories

- Como **dono de um salão**, quero dizer "eu mesmo atendo" (solo) e que o bot me
  avise no meu próprio WhatsApp, para não precisar montar equipe.
- Como **dono de uma clínica com recepção**, quero distribuir os leads em rodízio
  entre as atendentes (roleta), para dividir o atendimento de forma justa.
- Como **dono de um e-commerce com times**, quero que a IA leia o assunto e mande
  para o departamento certo (departamentos), para o lead cair em quem resolve.
- Como **dono de um FAQ/suporte**, quero poder NÃO configurar passagem para humano
  (só conversa), para não ser forçado a um caminho de venda que não existe.
- Como **dono que agenda**, quero marcar "também agenda" em qualquer modo, para o
  agente marcar na agenda sem me obrigar a escolher um modo específico.

## 5. Requisitos Funcionais

- **FR-01** — Um único card `handoff` substitui os 4 cards/etapas antigos na jornada.
- **FR-02** — O card tem 4 seções: (1) modo; (2) roster (condicional); (3) roteiro de
  qualificação; (4) "também agenda" + mensagem de abertura.
- **FR-03** — Modos: `solo`, `roleta`, `departamentos` e `nenhum` (só conversa).
- **FR-04** — A seção de roster (membros + WhatsApp) só aparece em `roleta` e
  `departamentos`; em `solo`/`nenhum` fica oculta.
- **FR-05** — O WhatsApp/pareamento de cada atendente é coletado **uma única vez** na
  seção de roster (acaba a duplicação team_structure × handoff_pairing).
- **FR-06** — O roteiro de qualificação (lista de perguntas) é editável dentro do card,
  como seção 3 (não é mais um passo separado).
- **FR-07** — O toggle "também agenda" é **ortogonal ao modo**: pode estar ligado em
  qualquer modo, e é ele que decide se o card de Calendário aparece depois.
- **FR-08** — Conversas em andamento (estado salvo no formato antigo) são **migradas**
  para o novo modelo sem perder dados nem re-exibir o passo já resolvido.
- **FR-09** — Mapeamento de migração: `notify_team` → `roleta` se há membros, senão
  `solo`; `book_appointment` → `solo` + `alsoSchedule=true`; `lead_only` → `solo`.
  Os `steps` (roteiro) e o `openingMessage` são preservados.
- **FR-10** — A materialização no deploy continua: `solo` → routing `self`;
  `roleta`/`departamentos` → routing `department`; `nenhum` → sem handoff; `alsoSchedule`
  liga a agenda.

## 6. Requisitos Não-Funcionais

- **Multi-tenant:** todo estado e materialização escopados por `organizationId`
  (inalterado).
- **Sem mudança de contrato de runtime:** o runtime de handoff não muda; só o
  design-time (estado + card + saga) se realinha.
- **Sem migration Prisma:** o estado vive em `BuilderProjectConversation.builderState`
  (JSONB). A migração é em código (`parseBuilderState`), nunca lança.
- **Determinismo:** o step-engine continua puro/determinístico; o gate de tsc +
  `next-pending-step.test.ts` verde é obrigatório antes de qualquer commit.
- **LGPD:** o aviso de base legal do warm transfer (cliente recebe msg do número do
  atendente) é preservado na seção de roster/abertura.

## 7. Fora de escopo

- Mexer no runtime de handoff (já existe e fica como está).
- Migration Prisma (o estado é JSONB).
- Classificador automático de assunto para o modo `departamentos` (a IA escolhe o
  departamento por prompt; classificador fica para depois).
- As demais ondas do blueprint (arquétipo, dual-input, pausa 24h, etc.).

## 8. Critérios de aceitação

- [ ] A jornada mostra **1 card `handoff`** no lugar dos 4 antigos.
- [ ] `solo`/`nenhum` não pedem roster; `roleta`/`departamentos` pedem.
- [ ] WhatsApp do atendente é pedido **uma vez**.
- [ ] "também agenda" controla a aparição do card de Calendário, independente do modo.
- [ ] Conversa em andamento (estado antigo) **não re-exibe** o passo e **não perde**
      dados após o deploy (migração verificada).
- [ ] Deploy materializa corretamente: solo→self, roleta/departamentos→department,
      alsoSchedule→agenda.
- [ ] `npx tsc --noEmit` verde e `next-pending-step.test.ts` reescrito e verde.
- [ ] Os 4 cards antigos são removidos (sem código morto).

## 9. Perguntas em aberto

> Todas têm um default recomendado; o `/plan` pode prosseguir com eles salvo objeção.

- **Q1 — Modo `nenhum`:** incluir "só conversa" como modo válido (agente que não passa
  para humano)? **Recomendado: SIM** (desbloqueia FAQ/suporte sem viés de venda).
- **Q2 — Legado `book_appointment` sem membros:** mapear para `solo` + `alsoSchedule=true`.
  **Recomendado: SIM** (era o dono recebendo + agenda).
- **Q3 — `handoff` é passo obrigatório?** **Recomendado: SIM** (precisa escolher um modo,
  mesmo que `nenhum`) — mantém o determinismo do step-engine.

---

**Próximo passo:** `/plan` (plano técnico) — pode prosseguir com os defaults de Q1-Q3.
