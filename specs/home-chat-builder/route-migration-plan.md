# Route Migration Plan — Quayer Builder v5.3

> **Propósito:** Backup explícito de TODAS as rotas do Quayer atual, com decisão por rota: preservar, mover, consolidar, desligar, ou deletar.
> **Aprovação:** Founder explicitou "tudo que está no admin faz sentido manter" + "deixe um backup dessas do que fizer sentido".
> **Data:** 2026-04-08

---

## Legenda de status

| Símbolo | Significado |
|---|---|
| 🟢 **KEEP** | Preservar intacto |
| 🔄 **MOVE** | Mover pra nova rota (com redirect 308) |
| 🟠 **INLINE** | Vira recurso dentro de projeto (sem página standalone) |
| 🔴 **DISABLE** | Sidebar hidden, backend preservado (reativar depois) |
| ❌ **DELETE** | Deletar permanentemente (com redirect se aplicável) |

---

## 1. Públicas — `src/app/(public)/` — 🟢 TODAS PRESERVADAS

| Rota | Ação | Observação |
|---|---|---|
| `/` | 🟢 KEEP | Landing page |
| `/pricing` | 🟢 KEEP | Planos |
| `/privacidade` | 🟢 KEEP | Privacy policy |
| `/termos` | 🟢 KEEP | Terms of service |
| `/docs/[[...slug]]` | 🟢 KEEP | Fumadocs |
| `/connect` | 🟢 KEEP | Public connection landing |
| `/connect/[token]` | 🟢 KEEP | Public connection flow |
| `/compartilhar/[token]` | 🟢 KEEP | **Share link de QR code — Builder reusa esta!** |

---

## 2. Auth — `src/app/(auth)/` — 🟢 PRESERVAR (já rebrand v3 feito)

| Rota | Ação | Observação |
|---|---|---|
| `/login` | 🟢 KEEP | DS v3 aplicado |
| `/login/verify` | 🟢 KEEP | |
| `/login/verify-magic` | 🟢 KEEP | CRITICAL: wired em email gen |
| `/signup` | 🟢 KEEP | |
| `/signup/verify` | 🟢 KEEP | |
| `/signup/verify-magic` | 🟢 KEEP | CRITICAL: wired em email gen |
| `/verify-email` | 🟢 KEEP | |
| `/onboarding` | 🟢 KEEP | Releases 1-3 completas |
| `/google-callback` | 🟢 KEEP | OAuth handler |
| `/register` | ❌ DELETE | Release 2 Phase D (legacy orphan — 308 → `/signup`) |
| `/forgot-password` | ❌ DELETE | Release 2 Phase D (308 → `/login`) |
| `/reset-password/[token]` | ❌ DELETE | Release 2 Phase D (308 → `/login`) |

---

## 3. Admin (super-admin) — `src/app/admin/` — 🟢 TODAS PRESERVADAS

> **Decisão explícita do founder:** "tudo que está no admin acho que faz sentido manter"

| Rota | Ação | Observação |
|---|---|---|
| `/admin` | 🟢 KEEP | Dashboard super-admin |
| `/admin/organizations` | 🟢 KEEP | Lista tenants |
| `/admin/invitations` | 🟢 KEEP | Convites pendentes |
| `/admin/sessions` | 🟢 KEEP | Sessões JWT ativas |
| `/admin/security` | 🟢 KEEP | Central de Segurança (recém hardened) |
| `/admin/audit` | 🟢 KEEP | Audit log |
| `/admin/notificacoes` | 🟢 KEEP | Notificações sistema |
| `/admin/integracoes` | 🟢 KEEP | Integrações globais |
| `/admin/settings` | 🟢 KEEP | Config plataforma |
| `/admin/billing` | 🟢 KEEP | Revenue/faturamento agregado |
| `/admin/subscriptions` | 🟢 KEEP | Assinaturas |
| `/admin/invoices` | 🟢 KEEP | Faturas emitidas |

---

## 4. Dashboard / Org — PARCIAL

| Rota | Ação | Destino | Observação |
|---|---|---|---|
| `/organizacao` | 🔄 MOVE | `/configuracoes/organizacao` | Merge |
| `/contatos` | 🔴 DISABLE | — | CRM off no MVP; backend preservado |
| `/contatos/[id]` | 🔴 DISABLE | — | Idem |
| `/conversas` | 🔴 DISABLE | — | Inbox fora do MVP; founder: "pessoas atendem no WhatsApp" |
| `/conversas/[sessionId]` | 🔴 DISABLE | — | Idem |

**Nota:** Módulos backend `crm/*` (contacts, attributes, observations, calls, projects CRM, leads, opportunities, tasks) ficam preservados pra reativar no futuro, sem UI exposta.

---

## 5. Integrações — `src/app/integracoes/` — MAJOR REORG

### 5.1 WhatsApp instances (canal principal)

| Rota | Ação | Destino |
|---|---|---|
| `/integracoes` (lista) | 🔄 MOVE | `/configuracoes/canais/whatsapp` |
| `/integracoes/[instanceId]/settings` | 🔄 MOVE | `/configuracoes/canais/whatsapp/[id]` |
| `/integracoes/sessions` | 🔄 MOVE | `/configuracoes/canais/whatsapp/[id]?tab=sessoes` |
| `/integracoes/compartilhar/[token]` | 🔄 MOVE | Merge com público `/compartilhar/[token]` (consolidação) |

### 5.2 Agents (vira projetos)

| Rota | Ação | Destino |
|---|---|---|
| `/integracoes/agents` | 🔄 MOVE | `/projetos?type=ai_agent` (lista filtrada) |
| `/integracoes/agents/new` | ❌ DELETE | Substituído pelo Builder chat (`/projetos/novo`) |
| `/integracoes/agents/[id]` | 🔄 MOVE | `/projetos/[id]` |
| `/integracoes/agents/[id]/playground` | 🔄 MOVE | `/projetos/[id]?tab=playground` |

### 5.3 Settings (vira /configuracoes/*)

| Rota | Ação | Destino |
|---|---|---|
| `/integracoes/settings` | ❌ DELETE | Raiz vazia |
| `/integracoes/settings/organization` | 🔄 MOVE | `/configuracoes/organizacao` |
| `/integracoes/settings/organization/integrations` | 🔄 MOVE | `/configuracoes/integracoes` |
| `/integracoes/settings/roles` | 🔄 MOVE | `/configuracoes/roles` |
| `/integracoes/settings/scim` | 🔄 MOVE | `/configuracoes/scim` |
| `/integracoes/settings/domains` | 🔄 MOVE | `/configuracoes/dominios` |
| `/integracoes/settings/templates` | 🟠 INLINE | Vira recurso dentro dos agentes (no MVP); v1.5 pode ganhar `/recursos/templates` |
| `/integracoes/settings/campaigns` | 🔄 MOVE | `/projetos?type=wa_campaign` (v1.5 quando campanha vira projeto) |
| `/integracoes/settings/billing` | 🔄 MOVE | `/configuracoes/billing` |
| `/integracoes/settings/invoices` | 🔄 MOVE | `/configuracoes/billing/faturas` |

### 5.4 Dashboard + users + admin

| Rota | Ação | Destino |
|---|---|---|
| `/integracoes/dashboard` | ❌ DELETE | Analytics vira aba dentro de cada projeto |
| `/integracoes/conversations` | 🔴 DISABLE | Redirect pra `/conversas` (que tá hidden) |
| `/integracoes/users` | 🔄 MOVE | `/configuracoes/membros` |
| `/integracoes/admin/clients` | 🔄 MOVE | `/admin/organizations` (consolida com super admin) |

---

## 6. Ferramentas — `src/app/ferramentas/` — RECONSOLIDAR

| Rota | Ação | Destino |
|---|---|---|
| `/ferramentas` | ❌ DELETE | Landing page vazia |
| `/ferramentas/chatwoot` | 🔄 MOVE | `/configuracoes/integracoes/chatwoot` |
| `/ferramentas/respostas-rapidas` | 🟠 INLINE | Recurso "Respostas rápidas" dentro do agente |
| `/ferramentas/webhooks` | 🔄 MOVE | `/configuracoes/webhooks` |

---

## 7. User — `src/app/user/` — PARCIAL

| Rota | Ação | Destino |
|---|---|---|
| `/user/dashboard` | ❌ DELETE | Página vazia sem conteúdo relevante |
| `/user/seguranca` | 🔄 MOVE | `/configuracoes/perfil/seguranca` (2FA, WebAuthn, devices) |

---

## 8. Rotas novas (v5.3 Builder)

| Rota | Propósito |
|---|---|
| `/projetos` | Lista de projetos (só agente no v1, expande depois) |
| `/projetos/novo` | Cria novo projeto + redirect (LLM inicia Builder chat) |
| `/projetos/[id]` | Workspace unificado: chat + preview + tabs |
| `/configuracoes` | Shell novo (consolida `/integracoes/settings/*`, `/user/*`, `/organizacao`, `/ferramentas/*`) |
| `/configuracoes/organizacao` | Ex-`/organizacao` + ex-`/integracoes/settings/organization` |
| `/configuracoes/membros` | Ex-`/integracoes/users` |
| `/configuracoes/roles` | Ex-`/integracoes/settings/roles` |
| `/configuracoes/scim` | Ex-`/integracoes/settings/scim` |
| `/configuracoes/dominios` | Ex-`/integracoes/settings/domains` |
| `/configuracoes/billing` | Ex-`/integracoes/settings/billing` |
| `/configuracoes/billing/faturas` | Ex-`/integracoes/settings/invoices` |
| `/configuracoes/canais/whatsapp` | Ex-`/integracoes` (lista instâncias) |
| `/configuracoes/canais/whatsapp/[id]` | Ex-`/integracoes/[instanceId]/settings` |
| `/configuracoes/integracoes/chatwoot` | Ex-`/ferramentas/chatwoot` |
| `/configuracoes/webhooks` | Ex-`/ferramentas/webhooks` |
| `/configuracoes/perfil/seguranca` | Ex-`/user/seguranca` |

---

## 9. Resumo quantitativo

| Status | Count | % |
|---|---|---|
| 🟢 KEEP (intacto) | **29** | ~46% |
| 🔄 MOVE (com redirect 308) | **18** | ~29% |
| 🟠 INLINE (vira recurso) | **2** | ~3% |
| 🔴 DISABLE (sidebar hidden) | **5** | ~8% |
| ❌ DELETE | **9** | ~14% |
| **Total auditado** | **63 rotas** | 100% |

**Rotas novas:** 15 (core do Builder + consolidações).

---

## 10. Ordem de execução da migração

### Fase 1 — MVP v1 (sem tocar nas rotas antigas)
- Criar `/projetos/*` novo
- Criar `/configuracoes/*` novo com redirects 308 das antigas
- Feature flag `NEXT_PUBLIC_HOME_BUILDER` controla visibilidade do novo sidebar
- Rotas antigas continuam funcionando via redirect

### Fase 2 — Cleanup (2-3 semanas depois)
- Verificar analytics: ninguém tá acessando rotas antigas direto?
- Deletar handlers das rotas antigas, manter só redirects
- Remover código do `/integracoes/settings/*`, `/ferramentas/*`, `/user/*`

### Fase 3 — Finalização (após 1 mês)
- Remove os redirects 308 (já esquecidos)
- Cleanup final de imports, types, dead code

---

## 11. Backend preservado (NÃO deletar)

Mesmo com rotas desligadas/deletadas, os módulos backend ficam:

| Módulo backend | Status | Razão |
|---|---|---|
| `src/server/core/*` (auth, permissions, sessions, etc) | 🟢 KEEP | Base do sistema |
| `src/server/ai-module/*` | 🟢 KEEP | **Usado pelo Builder** |
| `src/server/communication/campaigns` | 🟢 KEEP | Reusado em v1.5 |
| `src/server/communication/templates` | 🟢 KEEP | Reusado inline em v1 |
| `src/server/communication/instances` | 🟢 KEEP | WhatsApp connection |
| `src/server/integration/chatwoot` | 🟢 KEEP | `/configuracoes/integracoes/chatwoot` |
| `src/server/crm/*` | 🟢 KEEP **dormant** | UI desligada; reativa quando CRM voltar |
| `src/server/features-module/*` (analytics, audit, logs, webhooks, short-links) | 🟢 KEEP | Transversal, usado em vários projetos |
