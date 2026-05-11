# PRD: Refatoração Completa do Módulo Admin

> **Status:** Pronto para implementação
> **Criado em:** 2026-03-14
> **Branch alvo:** `ralph/admin-refactor`

---

## Introdução

O módulo Admin do Quayer tem **13 páginas funcionais** mas com inconsistências críticas de tipo, filtros limitados ao client-side, validações ausentes, e padrões quebrados de UX que afetam a confiabilidade do painel administrativo.

Esta refatoração **não quebra nenhuma feature existente** — corrige defeitos, padroniza padrões e garante que cada página seja confiável em produção.

---

## Problemas Identificados por Categoria

### 🔴 Críticos (quebram dados ou lógica)

| ID | Página | Problema |
|----|--------|----------|
| C-01 | Invitações | Filtro/busca opera só na página atual, não no total de dados |
| C-02 | Notificações | `datetime-local` → ISO sem timezone → notificações agendadas erradas |
| C-03 | Notificações | PUT envia campos parciais → API pode rejeitar ou sobrescrever com null |
| C-04 | Segurança/IP | Nenhuma validação de IP — aceita qualquer string |
| C-05 | Actions.ts | `listOrganizationsAction` não passa filtros para API → busca é client-side paginada |

### 🟡 Importantes (afetam type-safety e manutenção)

| ID | Arquivo | Problema |
|----|---------|----------|
| T-01 | sessions/page.tsx | 6+ casts `as any` para tipos do Igniter Client |
| T-02 | audit/page.tsx | `(api.audit.list.query as any)` — 3 ocorrências |
| T-03 | organizations/page.tsx | `as unknown as Organization[]` — mismatch de tipo da API |
| T-04 | actions.ts | `mode: 'insensitive' as const` — deveria ser tipo Prisma nativo |

### 🟢 Melhorias de UX/DX

| ID | Página | Problema |
|----|--------|----------|
| U-01 | Dashboard | `console.error` em produção, sem toast de erro |
| U-02 | Todos | Stats cards calculados da página atual, não do total real |
| U-03 | Security | Sem feedback visual ao copiar token/URL (catch de clipboard) |
| U-04 | Settings | `window.location.reload()` — hard refresh desnecessário |
| U-05 | Integracoes | `getBrokerLabel()` frágil — string matching manual |
| U-06 | Sidebar | 12 itens soltos sem agrupamento visual — difícil de navegar |

---

## Goals

- Zero `as any` no módulo admin
- Filtros/buscas sempre server-side (não client-side após paginar)
- Stats cards mostram totais reais (não da página atual)
- Validação de IP com regex IPv4/IPv6 na UI antes de submeter
- Timezone correto em todos os inputs datetime
- Sidebar admin com grupos visuais claros
- Cada página com tratamento de erro via toast (sem `console.error` em produção)

---

## User Stories

### US-001: Corrigir busca server-side em Invitações
**Descrição:** Como admin, quero buscar convites por email em todos os registros, não só na página atual.

**Problema atual:** `src/app/admin/invitations/page.tsx` — `getInvitationsAction` traz 20 registros e o filtro roda em JS local. Buscar "joao@" com 500 convites mostra só os que estiverem na página 1.

**Acceptance Criteria:**
- [ ] `getInvitationsAction(search, statusFilter, page, limit)` passa `search` e `status` para a query Prisma
- [ ] Remover filtro client-side nas linhas ~153-164
- [ ] Stats cards (Total, Pendentes, Aceitos, Expirados) consultam contagens reais via `count()` separado
- [ ] Paginação reseta para página 1 ao mudar busca ou filtro
- [ ] Typecheck passes

### US-002: Corrigir timezone em agendamento de Notificações
**Descrição:** Como admin, quero que notificações agendadas respeitem o fuso horário correto.

**Problema atual:** `NotificationsAdminPageClient.tsx` linha ~186 — `new Date(formData.scheduledFor)` sem timezone. Se admin está em GMT-3 e digita "14:00", salva como UTC "14:00" (17:00 local).

**Acceptance Criteria:**
- [ ] Converter `datetime-local` para ISO com offset local: `new Date(value).toISOString()`
- [ ] Ou adicionar campo de timezone com valor padrão do browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
- [ ] Mostrar timezone atual abaixo do input: "Horário: America/Sao_Paulo (GMT-3)"
- [ ] PUT de update envia apenas campos modificados (patch parcial, não objeto completo)
- [ ] Typecheck passes

### US-003: Corrigir busca server-side em Notificações
**Descrição:** Como admin, quero buscar notificações por título em todos os registros.

**Problema atual:** mesmo padrão do US-001 — filtro client-side após paginar.

**Acceptance Criteria:**
- [ ] `GET /api/v1/notifications?search=&type=&page=&limit=` passado para Prisma
- [ ] Remover filtro client-side
- [ ] Stats (Total, Globais, Ativas, Agendadas) usam `count()` real
- [ ] Typecheck passes

### US-004: Validação de IP no formulário de Regras de IP
**Descrição:** Como admin, quero ver erro imediato se digitar IP inválido, não só após a API rejeitar.

**Problema atual:** `security/page.tsx` linha ~560 — sem validação de formato. "abc.def" passa para API.

**Acceptance Criteria:**
- [ ] Validação IPv4 com regex: `/^(\d{1,3}\.){3}\d{1,3}$/` e cada octeto ≤ 255
- [ ] Mostrar mensagem de erro inline abaixo do input: "IP inválido. Ex: 192.168.1.100"
- [ ] Botão "Adicionar" desabilitado enquanto IP inválido
- [ ] Typecheck passes
- [ ] Verificar no browser que o campo exibe erro em tempo real

### US-005: Eliminar `as any` em sessions/page.tsx
**Descrição:** Como desenvolvedor, quero tipos corretos no Igniter Client para não usar `as any`.

**Problema atual:** 6 ocorrências de cast `as any` em `sessions/page.tsx` linhas 245-256. Causado por Igniter Client não exportar tipos das mutations diretamente.

**Acceptance Criteria:**
- [ ] Criar tipo `SessionMutationInput` local derivado dos schemas Zod existentes
- [ ] Substituir todos `as any` por tipos explícitos
- [ ] Repetir para `audit/page.tsx` (3 ocorrências)
- [ ] Zero `as any` em todo o módulo admin
- [ ] Typecheck passes

### US-006: Corrigir Stats Cards com totais reais
**Descrição:** Como admin, quero que os cards de estatísticas mostrem totais reais, não apenas a contagem da página atual.

**Problema atual:** Em invitações, notificações, e security — os cards de stats são calculados sobre os dados em memória (somente a página atual). Ex: Total de Convites mostra "20" porque só carregou 20.

**Acceptance Criteria:**
- [ ] Cada endpoint paginado retorna `meta: { total, totalPending, totalAccepted, totalExpired }` na mesma resposta OU
- [ ] Queries separadas para stats (`?statsOnly=true`) OU
- [ ] Server Actions retornam objeto `{ data, pagination, stats }` com counts reais do Prisma
- [ ] Páginas afetadas: invitations, notificacoes, security
- [ ] Cards mostram número correto independente da página
- [ ] Typecheck passes

### US-007: Substituir console.error por toasts em Dashboard
**Descrição:** Como admin, quero ver um aviso visível se o dashboard falhar ao carregar stats.

**Problema atual:** `admin/page.tsx` linhas 45, 54 — `console.error()` sem feedback visual.

**Acceptance Criteria:**
- [ ] Importar `toast` do `sonner`
- [ ] Substituir `console.error` por `toast.error("Erro ao carregar estatísticas")`
- [ ] Adicionar estado `hasError` para mostrar card de erro no lugar dos stats quando falhar
- [ ] Typecheck passes
- [ ] Verificar no browser que toast aparece em falha de rede

### US-008: Reagrupamento visual do Sidebar Admin
**Descrição:** Como admin, quero navegar o painel com grupos claros para encontrar o que preciso rapidamente.

**Problema atual:** `app-sidebar.tsx` — 12 itens admin em lista plana sem separação visual.

**Nova estrutura proposta:**
```
[GRUPO: Administração]
  Dashboard
  Organizações
  Integrações

[GRUPO: Atendimento]
  Sessões

[GRUPO: Acesso & Identidade]
  Convites
  Roles
  Domínios
  SCIM

[GRUPO: Monitoramento]
  Notificações
  Auditoria
  Segurança

[GRUPO: Sistema]
  Configurações
```

**Acceptance Criteria:**
- [ ] `app-sidebar.tsx` — admin items agrupados com `SidebarGroup` + `SidebarGroupLabel`
- [ ] Labels dos grupos são visíveis e colapsíveis
- [ ] Rota ativa mantém highlight correto
- [ ] Mobile: sidebar fecha ao navegar
- [ ] Typecheck passes
- [ ] Verificar no browser que grupos aparecem com separação visual

### US-009: Corrigir type mismatch em organizations/page.tsx
**Descrição:** Como desenvolvedor, quero tipos consistentes entre Server Action e componente.

**Problema atual:** linha ~105 — `as unknown as Organization[]` indica que `listOrganizationsAction` retorna tipo diferente do que a página espera.

**Acceptance Criteria:**
- [ ] Exportar tipo `OrganizationWithCount` de `actions.ts` com `_count: { userOrganizations: number }`
- [ ] Usar esse tipo no componente sem cast
- [ ] Verificar que `OrgSheet`, `EditOrganizationDialog` usam o mesmo tipo
- [ ] Typecheck passes

### US-010: Corrigir `window.location.reload()` em Settings
**Descrição:** Como admin, quero que o botão Refresh de Configurações atualize só os dados, não a página inteira.

**Problema atual:** `settings/page.tsx` linha 153 — hard refresh perde estado da aba ativa.

**Acceptance Criteria:**
- [ ] Cada aba de settings usa React Query com `queryClient.invalidateQueries()`
- [ ] Botão Refresh chama `queryClient.invalidateQueries({ queryKey: ['admin-settings'] })`
- [ ] Aba ativa preservada após refresh
- [ ] Typecheck passes

### US-011: Corrigir `getBrokerLabel()` frágil em Integracoes
**Descrição:** Como desenvolvedor, quero que o label do broker seja derivado de enum, não de string matching manual.

**Problema atual:** `integracoes/page.tsx` linhas 52-58 — switch de string.

**Acceptance Criteria:**
- [ ] Criar `BROKER_LABELS: Record<BrokerType, string>` usando o enum `BrokerType` do Prisma
- [ ] Substituir a função switch por `BROKER_LABELS[broker] ?? broker`
- [ ] Typecheck passes (garante que novos brokers futuros causarão erro de tipo)

---

## Functional Requirements

- FR-1: Todas as buscas/filtros nas páginas admin devem ser server-side (passados para Prisma)
- FR-2: Stats cards devem exibir contagens reais via `COUNT()` no banco, não `array.length`
- FR-3: Zero uso de `as any` ou `as unknown as X` no módulo admin
- FR-4: Validação de IP na UI antes de submeter ao backend
- FR-5: Timezone explícito em todos inputs `datetime-local`
- FR-6: Sidebar admin com grupos visuais usando `SidebarGroupLabel`
- FR-7: Erros de carregamento mostram toast ao usuário (nunca só `console.error`)
- FR-8: Tipos compartilhados entre Server Actions e Client Components via export explícito
- FR-9: Botão Refresh usa React Query `invalidateQueries`, não `window.location.reload()`
- FR-10: `BrokerType` enum usado em vez de string matching manual

---

## Non-Goals (Fora do Escopo)

- Não refatorar as páginas de onboarding, login, ou dashboard de usuário
- Não migrar de Server Actions para Igniter controllers (mudança de arquitetura)
- Não redesenhar a UI visual das páginas (apenas agrupar sidebar e corrigir bugs)
- Não adicionar novas features (novos módulos admin)
- Não migrar testes (sem testes novos nesta PRD)
- Não alterar schema Prisma

---

## Ordem de Implementação

Execute nesta ordem (cada US é independente após US-005):

```
US-005 → corrige tipos base (desbloqueia outros)
US-009 → corrige types de organizations
US-001 → busca server-side invitations
US-003 → busca server-side notifications
US-002 → timezone notifications
US-006 → stats reais (invitations + notifications + security)
US-004 → validação IP
US-007 → toasts dashboard
US-010 → refresh settings
US-011 → broker label
US-008 → sidebar grupos (último — puramente visual)
```

---

## Considerações Técnicas

### Server Actions — Padrão de Retorno
Todas as actions paginadas devem retornar:
```typescript
type PaginatedResult<T> = {
  data: T[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  stats: Record<string, number>  // contagens reais por status
}
```

### Types Compartilhados
Criar `src/types/admin.ts` com:
```typescript
export type OrganizationWithCount = Organization & {
  _count: { userOrganizations: number }
}
export type SessionWithRelations = Session & { ... }
// etc
```

### Stats com Prisma
Usar `groupBy` ou múltiplos `count()` paralelos:
```typescript
const [total, pending, accepted, expired] = await Promise.all([
  prisma.invitation.count({ where: { organizationId } }),
  prisma.invitation.count({ where: { organizationId, usedAt: null, expiresAt: { gt: now } } }),
  prisma.invitation.count({ where: { organizationId, usedAt: { not: null } } }),
  prisma.invitation.count({ where: { organizationId, usedAt: null, expiresAt: { lte: now } } }),
])
```

---

## Métricas de Sucesso

- `npx tsc --noEmit` passa com zero erros no módulo admin
- Busca por email em invitações retorna resultados de todos os registros (não só página atual)
- Stats cards mostram número correto ao navegar entre páginas
- Nenhum `console.error` em runtime de produção (substituídos por toasts)
- Sidebar admin tem 4-5 grupos visualmente distintos

---

## Open Questions

1. Stats separados por query ou incluídos no mesmo endpoint? (performance vs complexidade)
2. O campo timezone nas notificações agendadas deve ser mostrado ao usuário ou tratado silenciosamente?
3. Sidebar: grupos colapsíveis (clicável para esconder) ou só separadores visuais?
