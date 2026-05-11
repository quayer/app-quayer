# BACKLOG — Pendências reais

> Lista viva, curta, sem narrativa. Atualizada manualmente quando algo entra/sai. Fonte das listas: audit de API (Mai/2026 — em `.claude/projects/.../memory/project_api_audit_2026_05.md`) + análise de tasks/ em 10/Mai/2026.

## 🔴 P0 — Quebram o produto

- [ ] **Religar chat do meta-agente** — `src/client/components/projetos/chat/chat-panel.tsx` é `return null`. Backend pronto em `/builder/projects/:id/chat/{message,messages,compact}`. Sem isso `/projetos/[id]` não funciona.
- [ ] **Corrigir path de publish** — `deploy-tab.tsx:204` chama `/api/v1/builder/projects/publish`; real é `/api/v1/builder/deploy/publish`. Bug de 1 linha. Publicação via UI quebrada.
- [ ] **Religar channel picker** — `channel-picker-section.tsx` é `return null`. Backend `POST/DELETE /builder/projects/:id/channel` pronto.

## 🟡 P1 — Backend pronto, UI ainda não consome

- [ ] **Deploy status + rollback** — UI (`deploy-status-card`) renderiza, mas falta consumer com polling 1500ms. Endpoints `/builder/deploy/:projectId/status` e `/:deploymentId/rollback` prontos.
- [ ] **Decisão `/login/verify-magic` e `/signup/verify-magic`** — rotas existem, plano de cleanup foi superseded sem decisão. Deletar ou manter explicitamente?

## 🟢 P2 — Higiene técnica

- [ ] **Regenerar `igniter.schema.ts`** — desatualizado, causa casts `as unknown as X` em `metrics-card`, `summary-step`, `use-prompt-autosave`, `version-history`.
- [ ] **Server components chamando repository direto** (`getProjectDetail`, `listRecentProjects`) — esquivam validação Zod + auth procedure. Migrar para Igniter actions ou aceitar a exceção explicitamente.
- [ ] **Decisão `/builder/sidebar`** — server components já não usam. Manter para clientes API key externos, ou deletar?
- [ ] **Decisão `logs` leitura** (`features-module/logs/` — 8 endpoints + SSE) — eram do admin removido. Manter só `withApiLogger`?
- [ ] **Verificar onboarding-v3 morto** — `onboarding-v3.tsx:78` chama `/auth/profile` (inexistente). Fluxo `/onboarding` foi removido (`332c76e`). Confirmar arquivo é código morto e deletar.

## 🔵 P3 — Infra blocking (herdado do índice de auth)

- [ ] **PR-2: Monitoramento sintético em prod** — Checkly recomendado. Sem isso, regressão em prod só é detectada por usuário.
- [ ] **PR-3: SLA de rollback + runbook de restore testado** — backups Hetzner existem, restore real nunca foi exercitado.
- [ ] **PR-5: Baselines de conversão auth** — só baselines de latência existem (`docs/infra/BASELINES.md`). Falta signup→primeira ação, OTP success rate, error rate `/api/v1/auth/*`.

## ⚫ Backlog distante (não trabalhar sem decisão de produto)

- CRM (`/contatos`, leads, opportunities, tasks) — desligado no v1 Builder, backend preservado
- Inbox humano (`/conversas`) — desligado no v1 Builder, backend preservado
- Refactor visual `/configuracoes/*` e `/admin/*` para DS v3 — admin removido (`8a05b5e`); configurações sem decisão de prioridade
- Restaurar Invitation/Notification/Notification preferences (modelos Prisma preservados, controllers ausentes)

---

## Convenção desta lista

- Item entra quando descoberto, sai quando entregue (não marcar `[x]` — apenas deletar).
- Se item virar trabalho >1 dia útil ou exigir design upfront, criar PRD curto em `tasks/prd-*.md` e linkar daqui.
- Não rastrear ACs aqui — granularidade é "item resolvido sim/não".
