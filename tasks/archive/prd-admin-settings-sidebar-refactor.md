# PRD: Admin Settings Refactor + Sidebar Collapse + Org-Switching

## Introdução

O painel admin acumulou dívida técnica e UX ao longo do desenvolvimento: 8 abas de settings carregadas com `dynamic()` (bom), mas com inconsistências de API, uma feature escondida (ApiKeys dentro de Security), OAuth com UI fantasma, e um sidebar que empilha 12 links admin visíveis simultaneamente. Além disso, o admin nunca teve capacidade de trocar de organização — o `OrganizationSwitcher` explicitamente o bloqueia (`if (user.role === 'admin') return null`).

Este PRD cobre: **crítica das 8 abas**, **sidebar colapsável**, **org-switching para admin**, e **bugs técnicos prioritários**.

---

## Diagnóstico Brutal — 8 Abas de Settings

| # | Aba | Status | Problema | Decisão |
|---|-----|--------|----------|---------|
| 1 | **UAZapi** | Funcional ✅ | Nenhum | Manter |
| 2 | **Webhook** | Funcional ✅ | Usa `fetch('/api/v1/')` direto — todas as outras usam Igniter `system-settings.*` | **Corrigir padrão de API** |
| 3 | **Email** | Funcional ✅ | Nenhum crítico | Manter |
| 4 | **AI** | Funcional ✅ | Nenhum crítico | Manter |
| 5 | **Concatenação** | Funcional ✅ | Apenas 4 campos simples. Aba inteira para 4 toggles é desproporcional | **Avaliar merge com Sistema** |
| 6 | **OAuth** | Parcial ⚠️ | Só Google funciona. GitHub, Microsoft, Apple mostram UI fantasma "em breve" — enganoso | **Limpar UI: ocultar providers não implementados** |
| 7 | **Segurança** | Funcional ✅ | `ApiKeysSettings` embutido dentro — é uma feature completa (CRUD, escopos, expiração) escondida em sub-seção | **Promover ApiKeys para tab própria** |
| 8 | **Sistema** | Funcional ✅ | Botão "Inicializar Padrões" sem diálogo de confirmação — destrói configurações do sistema | **Adicionar confirmação** |

**9ª aba oculta:** `ApiKeysSettings.tsx` existe como componente separado mas é renderizado dentro de `SecuritySettings` — não aparece como tab independente.

---

## Diagnóstico — Sidebar Admin

**Estado atual:** 4 grupos `NavMain` separados por `SidebarSeparator`, sempre expandidos, 12 links visíveis permanentemente. Quando o admin também é membro de org (`currentOrgId != null`), o sidebar mostra os 12 links admin **mais** Communication + CRM + Features + Settings da org — cerca de 20 links sem separação visual clara.

**Problema central:** Não há colapso. O admin não consegue "focar" em uma seção. A hierarquia visual dos 4 grupos é boa, mas tudo está sempre aberto.

**Solução:** Envolver os 4 grupos admin em um `Collapsible` do shadcn/ui com header "Administração" colapsável. Os sub-grupos internos continuam como estão (label + itens). Estado padrão: expandido.

---

## Diagnóstico — Org-Switching para Admin

**Estado atual:** `OrganizationSwitcher` retorna `null` para `user.role === 'admin'`. Admin tem `currentOrgId` no JWT mas **não tem como trocá-lo pela UI**.

**Implicação:** Quando admin é membro de org (ex: criador da plataforma que também usa a ferramenta), as rotas `/conversas`, `/contatos` usam `currentOrgId` para filtrar dados. Se o admin tiver 2 orgs, fica preso na primeira.

**Decisão:** Permitir que admin use o `OrganizationSwitcher` — remover o bloqueio por `role === 'admin'`. A lógica de switch (`api.auth.switchOrganization.mutate`) já funciona corretamente, só a UI está bloqueada.

---

## Goals

- Admin sidebar colapsável mantendo os 4 sub-grupos internos
- ApiKeys como tab própria (US-002)
- OAuth sem UI fantasma de providers não implementados (US-003)
- Webhook usando padrão Igniter (US-004)
- Confirmação no "Initialize Defaults" (US-005)
- `window.location.reload()` substituído por `router.refresh()` (US-006)
- Admin pode trocar de organização (US-007)

---

## User Stories

### US-001: Sidebar admin colapsável com sub-grupos
**Descrição:** Como admin, quero poder colapsar toda a seção de administração no sidebar para ter mais espaço visual quando estou nas rotas de org (conversas, contatos).

**Acceptance Criteria:**
- [ ] A seção admin é envolvida em um `Collapsible` shadcn/ui com label "Administração" e ícone chevron
- [ ] Estado padrão: expandido (`defaultOpen={true}`)
- [ ] Quando colapsado, os 4 sub-grupos (Administração, Acesso & Identidade, Monitoramento, Sistema) ficam ocultos
- [ ] Os 4 sub-grupos internos e seus separadores são preservados quando expandido
- [ ] O estado de colapso persiste via `localStorage` (key: `admin-sidebar-collapsed`)
- [ ] Typecheck passa
- [ ] Verificar no browser: colapsar/expandir funciona, estado persiste ao recarregar

### US-002: ApiKeys como tab própria no settings
**Descrição:** Como admin, quero encontrar o gerenciamento de API Keys como uma tab direta no settings, não enterrada dentro de Segurança.

**Acceptance Criteria:**
- [ ] Nova tab "API Keys" adicionada entre "Segurança" e "Sistema"
- [ ] `ApiKeysSettings` removido de dentro de `SecuritySettings` e movido para `TabsContent value="api-keys"`
- [ ] Import dinâmico `dynamic()` adicionado para `ApiKeysSettings` com `TabSkeleton` como fallback
- [ ] Ícone: `KeyRound` de lucide-react
- [ ] Tab label em português: "API Keys"
- [ ] SecuritySettings não quebra (sem o componente filho)
- [ ] Typecheck passa
- [ ] Verificar no browser: tab aparece, CRUD de API keys funciona

### US-003: OAuth — limpar UI fantasma
**Descrição:** Como admin, quero que a aba OAuth mostre apenas o Google (funcional), sem criar expectativa falsa de providers não implementados.

**Acceptance Criteria:**
- [ ] GitHub, Microsoft, Apple: removidos da UI ou substituídos por um card "Em desenvolvimento — indisponível no momento" com visual claramente desabilitado (opacity-50, cursor-not-allowed, sem campos de input)
- [ ] Alternativa aceita: um único card "Outros providers" com badge "Roadmap" e lista de ícones como preview
- [ ] Google continua funcionando normalmente (toggle, credenciais, redirect URI)
- [ ] Typecheck passa
- [ ] Verificar no browser: OAuth tab não confunde mais com campos desabilitados sem explicação

### US-004: Webhook settings — migrar para Igniter
**Descrição:** Como desenvolvedor, quero que WebhookSettings use o mesmo padrão Igniter das outras 7 abas para consistência e type-safety.

**Acceptance Criteria:**
- [ ] `fetch('/api/v1/system-settings/webhook', ...)` substituído por `api.system-settings.getByCategory.useQuery({ category: 'webhook' })` (ou endpoint equivalente existente)
- [ ] `fetch('/api/v1/system-settings/webhook', { method: 'POST' })` substituído por mutation Igniter correspondente
- [ ] Se o endpoint Igniter não existir: criar procedure no `system-settings` controller (NÃO criar nova rota REST)
- [ ] Comportamento idêntico ao atual (mesmos campos, mesma validação)
- [ ] Typecheck passa

### US-005: SystemInfo — confirmação antes de "Inicializar Padrões"
**Descrição:** Como admin, quero ser avisado antes de reinicializar os padrões do sistema pois isso sobrescreve todas as configurações.

**Acceptance Criteria:**
- [ ] Botão "Inicializar Padrões" abre `AlertDialog` do shadcn/ui antes de executar
- [ ] Dialog mostra: título "Reinicializar configurações padrão?", descrição "Esta ação sobrescreve todas as configurações do sistema com os valores padrão. Esta ação não pode ser desfeita.", botão "Cancelar" e "Confirmar" (variant destructive)
- [ ] A mutation `system-settings.initializeDefaults` só é chamada após confirmação
- [ ] Typecheck passa
- [ ] Verificar no browser: clicar em "Inicializar Padrões" abre o dialog antes de executar

### US-006: Settings page — substituir window.location.reload()
**Descrição:** Como admin, quero que o botão "Atualizar" nas configurações recarregue os dados via React Query, não via reload de página.

**Acceptance Criteria:**
- [ ] `onClick={() => window.location.reload()}` substituído por `router.refresh()` do Next.js (preserva estado do client) OU por invalidação do query client (`queryClient.invalidateQueries()`)
- [ ] Se usar `queryClient`: importar `useQueryClient` de `@tanstack/react-query` e chamar `invalidateQueries({ queryKey: ['system-settings'] })` (ou o queryKey real)
- [ ] O botão "Atualizar" continua visível e funcional
- [ ] Typecheck passa

### US-007: Admin pode trocar de organização
**Descrição:** Como admin que também é membro de organização, quero poder trocar o contexto de organização igual usuários comuns, para navegar corretamente nas rotas /conversas, /contatos etc.

**Acceptance Criteria:**
- [ ] Em `OrganizationSwitcher.tsx`: remover o guard `if (!user || user.role === 'admin') return null`
- [ ] O guard de "1 organização ou nenhuma" é mantido (`organizations.length <= 1`)
- [ ] Admin que não tem organização: switcher não aparece (comportamento correto)
- [ ] Admin com 1+ org: switcher aparece normalmente no footer do sidebar
- [ ] A lógica de switch (`api.auth.switchOrganization.mutate`) já funciona — não requer mudança no backend
- [ ] Typecheck passa
- [ ] Verificar no browser: admin com múltiplas orgs consegue trocar

---

## Non-Goals

- Não refatorar o layout das rotas `/admin/*` (breadcrumb, header)
- Não criar novos endpoints de backend para settings (aproveitar os existentes)
- Não migrar admin para layout sem sidebar global
- Não implementar GitHub/Microsoft/Apple OAuth (só limpeza visual)
- Não criar "impersonation" de org para admin (só reutilizar o switch existente)
- Não alterar schema Prisma

---

## Considerações Técnicas

**Collapsible sidebar:** shadcn/ui tem `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`. O `app-sidebar.tsx` já importa de `@/client/components/ui/sidebar`. O estado de colapso pode usar `useState` + `localStorage` para persistência.

**ApiKeys tab:** O componente `ApiKeysSettings` já existe em `src/client/components/admin-settings/ApiKeysSettings.tsx`. É só mover o `dynamic()` import e o `TabsContent`.

**Webhook Igniter:** Verificar se existe `system-settings.getWebhook` ou `system-settings.getByCategory` com `category: 'webhook'`. Se não existir, adicionar no controller antes de migrar o frontend.

**window.location.reload():** Está em `src/app/admin/settings/page.tsx` linha 153. Usar `router.refresh()` é suficiente pois revalida todos os Server Components.

**OrganizationSwitcher:** O guard está na linha 34-37 (useEffect) e 94-96 (render). Ambos precisam ser removidos.

---

## Métricas de Sucesso

- Admin consegue colapsar a seção admin e ter foco visual nas rotas de org
- ApiKeys encontrável em menos de 2 cliques (vs atual: Settings → Segurança → scroll)
- Zero UI fantasma no OAuth tab
- Zero `window.location.reload()` nos componentes admin
- Admin com múltiplas orgs consegue fazer switch

---

## Questões em Aberto

1. **Concatenação** (4 campos apenas): manter como tab ou fundir com "Sistema"? — decidir antes de implementar
2. **Ordem final das tabs** após adicionar ApiKeys: UAZapi, Webhook, Email, AI, Concatenação, OAuth, Segurança, API Keys, Sistema — 9 tabs no total. A ScrollArea já suporta mais tabs sem quebrar layout.
3. **Admin sem org:** se admin nunca se associou a uma org, o switcher não aparece e os menus de Communication/CRM também não. Isso é comportamento correto? Documentar.
