---
Criado: 2026-06-06
Atualizado: 2026-06-08
Revisar em: quando a Materialização no Runtime for aprovada para implementação
Relacionados:
  - docs/builder/ORAYON_UPLIFT_SPEC.md
  - docs/ERD.md
  - prisma/schema.prisma
  - src/server/ai-module/builder/deploy/deploy-flow.orchestrator.ts
---

# Materialização no Runtime — PLANO

> Plano de design (design-only, sem edição). Fecha a ponte entre a COLETA (cards das ondas A–D, no builderState JSONB) e o RUNTIME (modelos que o agente usa em produção). **Exige migration Prisma** → aprovação antes de implementar. Backlog em [[onda-a-builder-cards]].
>
> ✅ **IMPLEMENTADO (2026-06):** M2 (pricing) + M1 (team/roleta) materializados na saga de deploy. O `dispatch` para humano é hoje a rota `transfer_to_human routing='department'` (roleta envia WhatsApp via uazapi — 6A). O diagnóstico abaixo descreve o estado PRÉ-implementação.

## Diagnóstico

A **saga de deploy não carrega o `builderState`** — então `pricing` e `team` **morrem no JSONB** e nunca chegam ao agente. Estado atual dos modelos de runtime:

- `PriceList` — **sem** `disclosureStyle`, **sem** `minTicketCents`.
- `PriceItem` — **sem** `priceMaxCents`, **sem** `imageUrl`.
- `DepartmentMember` — **sem** `whatsapp`; `userId` é **FK obrigatória** (só aceita usuário da plataforma).
- `dispatch` (antes `notify_team`/`dispatch_to_agent`, hoje `transfer_to_human routing='department'`) — no estado pré-M1 só criava `Notification` **in-app**; não enviava WhatsApp.
- `uazapi-sender` — **já tem** `sendText` e `sendImage` (a base de envio existe).

## Migration (aditiva)

- `PriceList` += `disclosureStyle`, `minTicketCents`.
- `PriceItem` += `priceMaxCents`, `imageUrl`.
- `DepartmentMember` += `whatsapp`, `name`; **relaxa `userId` para nullable** (FK `SetNull`) — pra aceitar membro "nome + WhatsApp" que não é usuário da plataforma. ⚠️ mexe numa FK viva + constraint unique.
- Cascade em `docs/ERD.md` + tabela Prisma no `CLAUDE.md`.

## Mudanças na saga

- O orchestrator passa a ler o `builderState` (`parseBuilderState`); `deploy.contract.ts` ganha `builderState` + **2 passos novos** entre `publish` e `create_instance`: `materialize_pricing` e `materialize_team`.
- Idempotente, org-scoped, com compensações no `rollback.handler.ts`.

## Mudanças no runtime

- `get_pricing`: seleciona e **formata por `disclosureStyle`** (exact / "a partir de" / "entre X–Y" / none) e expõe `imageUrl`. Nunca pode lançar.
- Roleta: **6A** = envia `sendText` via `uazapi-sender` ao membro sorteado (com rate-limit + fallback in-app); **6B** = só materializa o roteamento (mantém in-app). `dispatch` precisa do `departmentId` no prompt.

## Esforço & subdivisão

**M.** Sugestão: **M2 pricing primeiro** (mais isolado, menor risco) → depois **M1 team** (M1a dados/migration+saga · M1b runtime WhatsApp 6A · M1c departamentos no prompt).

## Riscos

- `userId` nullable quebra o `@@unique` e mexe numa FK viva (migração cuidadosa).
- Reconciliação não pode apagar itens de preço **manuais** (só os criados pelo builder).
- Migration antes do código (gate).
- `get_pricing` não pode lançar (fail-safe).
- Envio 6A precisa rate-limit + fallback in-app.
- Sem `departmentId` no prompt, o dispatch cai no fallback.

## Perguntas abertas (decisão antes de codar)

1. **`userId` nullable** no `DepartmentMember` (aceita membro nome+WhatsApp) — **recomendado** — ou manter obrigatório (só usuários)?
2. **WhatsApp** em coluna nova de `DepartmentMember` — **recomendado** — ou reusar `User.phone`?
3. **Roleta 6A vs 6B:** runtime **envia WhatsApp** ao atendente (6A, feature completa) ou **só persiste** o roteamento (6B, in-app, mais seguro)?
4. **`disclosureStyle`** global (em `PriceList`) — **recomendado, espelha o card** — ou por item?
5. **`departmentId`** chega ao dispatch via **prompt** ou via coluna?
6. **Reconciliação:** mexe só nos itens do builder ou na price list inteira da org?
