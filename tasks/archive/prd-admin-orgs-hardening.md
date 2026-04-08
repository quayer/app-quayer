# PRD: Admin Organizations — Security Hardening & Quality Overhaul

## Introduction

Auditoria end-to-end brutal da pagina `/admin/organizations` revelou **6 vulnerabilidades criticas de seguranca**, **6 issues de alta severidade**, **10 medias** e **17 issues de frontend** (bugs, UX, A11Y). Este PRD cobre TODAS as correcoes necessarias, organizadas em fases: seguranca primeiro, depois integridade de dados, frontend bugs, acessibilidade, e simplificacao.

**Origem:** Auditoria de codigo realizada em 2026-03-16 cobrindo:
- `src/app/admin/actions.ts` (server actions)
- `src/app/admin/invitations/actions.ts`
- `src/server/core/organizations/` (controller, repository, schemas, interfaces)
- `src/app/admin/organizations/` (page, dialogs, OrgDetailDialog, UserManageModal)

## Goals

- Eliminar todas as 6 vulnerabilidades criticas de auth bypass em server actions
- Remover vazamento de secrets (API keys) via `getEnvDefaultsAction`
- Garantir isolamento multi-tenant em todas as queries
- Tornar operacoes criticas atomicas (`$transaction`)
- Corrigir todos os bugs de frontend (race conditions, crashes, stale closures)
- Atingir conformidade WCAG 2.1 AA na pagina de organizacoes
- Simplificar codigo (consolidar types, reduzir useState, extrair hooks)

---

## FASE 1: Security — CRITICAL (Deploy imediato)

### US-001: Adicionar auth check em server actions de leitura
**Description:** Como admin, preciso que apenas admins acessem dados de organizacoes via server actions, para evitar que usuarios comuns listem membros, instancias e webhooks de qualquer org.

**Acceptance Criteria:**
- [ ] `listOrgMembersAction` chama `requireAdmin()` antes de qualquer query
- [ ] `listUserOrgsAction` chama `requireAdmin()` antes de qualquer query
- [ ] `listOrgInstancesAction` chama `requireAdmin()` antes de qualquer query
- [ ] `listOrgWebhooksAction` chama `requireAdmin()` antes de qualquer query
- [ ] Cada action retorna `{ success: false, error: 'Unauthorized' }` se nao-admin
- [ ] Testar: usuario com role `user` recebe 403 ao chamar qualquer uma dessas actions
- [ ] Typecheck passa

### US-002: Proteger getEnvDefaultsAction e remover secrets raw
**Description:** Como admin de sistema, preciso que secrets nao sejam retornados em texto claro, para evitar vazamento de API keys via browser devtools.

**Acceptance Criteria:**
- [ ] `getEnvDefaultsAction` chama `requireAdmin()` como primeiro passo
- [ ] Remover campos raw: `openaiApiKey`, `adminToken` (UAZAPI), `googleClientId` raw
- [ ] Retornar APENAS versoes mascaradas (ex: `sk-...abc` para OpenAI, `****` para tokens)
- [ ] Se nenhuma UI usa os valores raw, remover os campos inteiros da response
- [ ] Typecheck passa

### US-003: Proteger actions de invitations
**Description:** Como admin, preciso que a listagem e gestao de convites seja restrita a admins.

**Acceptance Criteria:**
- [ ] `getInvitationsAction` chama `requireAdmin()` como primeiro passo
- [ ] `createInvitationAction` valida role do caller alem do bearer token
- [ ] `resendInvitationAction` valida role do caller
- [ ] `deleteInvitationAction` valida role do caller
- [ ] Testar: usuario com role `user` recebe erro ao chamar qualquer action de invitations
- [ ] Typecheck passa

### US-004: Sanitizar error messages para o client
**Description:** Como desenvolvedor, preciso que erros internos (Prisma, stack traces) nao vazem para o frontend, retornando mensagens genericas.

**Acceptance Criteria:**
- [ ] Criar helper `sanitizeError(error: unknown): string` que retorna mensagem generica
- [ ] Erros Prisma (P2002, P2025, etc) mapeados para mensagens user-friendly em portugues
- [ ] Substituir todos os `error.message` diretos em `actions.ts` pelo helper
- [ ] Substituir em `invitations/actions.ts` tambem
- [ ] Em dev (`NODE_ENV=development`), logar erro original no console do servidor
- [ ] Typecheck passa

---

## FASE 2: Security — HIGH

### US-005: Implementar rate limiting em server actions criticas
**Description:** Como admin de sistema, preciso de rate limiting para evitar brute-force em operacoes sensiveis.

**Acceptance Criteria:**
- [ ] `updateUserSystemRoleAction` limitado a 10 calls/minuto por IP
- [ ] `createInvitationAction` limitado a 20 calls/minuto por IP
- [ ] `createOrganizationAction` limitado a 5 calls/minuto por IP
- [ ] `deleteOrganizationAction` limitado a 5 calls/minuto por IP
- [ ] Usar lib existente `src/lib/rate-limit.ts` ou `src/lib/rate-limit/`
- [ ] Retornar `{ success: false, error: 'Too many requests' }` quando exceder
- [ ] Typecheck passa

### US-006: Protecao contra self-demotion e orfao de org
**Description:** Como admin, preciso de guard rails que impecam que o ultimo admin se demova ou que o ultimo master seja removido de uma org.

**Acceptance Criteria:**
- [ ] `updateUserSystemRoleAction`: se demoting para `user`, verificar se existe pelo menos 1 outro admin
- [ ] Se for o ultimo admin, retornar erro: "Nao e possivel remover o ultimo administrador do sistema"
- [ ] `removeUserFromOrgAction`: verificar se o user sendo removido e o ultimo master da org
- [ ] Se for o ultimo master, retornar erro: "Nao e possivel remover o ultimo master da organizacao"
- [ ] `updateUserOrgRoleAction`: se rebaixando de master, verificar se existe outro master
- [ ] Typecheck passa

### US-007: Trocar hard delete por soft delete em removeUserFromOrgAction
**Description:** Como admin, preciso que remocao de membros seja soft delete para manter audit trail.

**Acceptance Criteria:**
- [ ] `removeUserFromOrgAction` usa `update({ isActive: false })` em vez de `delete()`
- [ ] Queries de `listOrgMembersAction` filtram por `isActive: true`
- [ ] Repository `listMembers()` filtra por `isActive: true`
- [ ] Repository `countMembers()` filtra por `isActive: true`
- [ ] Typecheck passa

---

## FASE 3: Integridade de Dados — MEDIUM

### US-008: Tornar criacao de org atomica com $transaction
**Description:** Como desenvolvedor, preciso que a criacao de org (3 operacoes DB) seja atomica para evitar dados orfaos.

**Acceptance Criteria:**
- [ ] Controller `create` action wrapa em `database.$transaction()`
- [ ] Dentro da transaction: criar org, criar UserOrganization (master), atualizar User.currentOrgId
- [ ] Se qualquer passo falha, tudo faz rollback
- [ ] Testar: simular falha no passo 3 e verificar que org e membership nao existem
- [ ] Typecheck passa

### US-009: Filtrar isActive em todas as queries de organizacao
**Description:** Como admin, preciso que orgs soft-deleted nao aparecam em listagens a menos que eu filtre explicitamente.

**Acceptance Criteria:**
- [ ] `listOrganizationsAction` adiciona `isActive: true` no where (a menos que filtro explicito)
- [ ] Repository `list()` default para `isActive: true` quando nao especificado
- [ ] Repository `listMembers()` filtra `isActive: true` nos membros
- [ ] Verificar: apos soft-delete, org desaparece da tabela
- [ ] Typecheck passa

### US-010: Slug com uniqueness check e fallback
**Description:** Como desenvolvedor, preciso que slugs de org sejam unicos para evitar constraint violations.

**Acceptance Criteria:**
- [ ] `generateSlug()` verifica se slug ja existe no banco
- [ ] Se existir, appenda sufixo numerico (ex: `minha-org-2`, `minha-org-3`)
- [ ] Loop ate encontrar slug disponivel (max 10 tentativas)
- [ ] Se esgotar tentativas, usar `${slug}-${nanoid(6)}`
- [ ] Typecheck passa

### US-011: Alinhar Zod schemas entre actions e controllers
**Description:** Como desenvolvedor, preciso que os schemas de validacao sejam consistentes para evitar bypass.

**Acceptance Criteria:**
- [ ] `createOrganizationAction` schema: `billingType` usa `z.enum(['free','basic','pro','enterprise'])` em vez de `z.string()`
- [ ] `updateOrganizationAction` schema: idem
- [ ] IDs validados como `z.string().uuid()` em todas as actions que recebem ID
- [ ] Interface `OrganizationData` alinhada: incluir `'enterprise'` no tipo `billingType`
- [ ] Typecheck passa

### US-012: Redirecionar listOrganizationsAction pelo controller
**Description:** Como desenvolvedor, preciso que a action de listagem use o controller em vez de query Prisma direta, para garantir validacao e consistencia.

**Acceptance Criteria:**
- [ ] `listOrganizationsAction` chama `api.organizations.list.query()` em vez de `database.organization.findMany()`
- [ ] Remover query Prisma duplicada da action
- [ ] Garantir que paginacao e search continuam funcionando
- [ ] Testar: busca por nome e documento retorna resultados corretos
- [ ] Typecheck passa

---

## FASE 4: Frontend Bugs

### US-013: Corrigir allOrganizations que so mostra pagina atual
**Description:** Como admin, preciso que o dropdown "Adicionar usuario a org" no UserManageModal mostre TODAS as organizacoes, nao apenas as 20 da pagina atual.

**Acceptance Criteria:**
- [ ] Criar `listAllOrganizationsAction` que retorna todas as orgs (id + name apenas)
- [ ] UserManageModal busca lista completa ao abrir (lazy load)
- [ ] Dropdown mostra todas as orgs disponiveis
- [ ] Incluir busca no dropdown se lista > 20 orgs
- [ ] Typecheck passa

### US-014: Corrigir race conditions no OrgDetailDialog
**Description:** Como admin, preciso que abrir/fechar rapidamente o dialog de detalhes nao cause dados stale ou erros.

**Acceptance Criteria:**
- [ ] Implementar cancellation pattern: AbortController ou flag `isMounted`
- [ ] Ao fechar dialog, requests in-flight sao ignorados ao resolver
- [ ] Ao reabrir para org diferente, dados da org anterior nao aparecem
- [ ] useEffect deps corrigidos (comparar por `org?.id` em vez de referencia do objeto)
- [ ] Typecheck passa

### US-015: Corrigir crashes e edge cases
**Description:** Como admin, preciso que a UI nao crasheie em dados inesperados.

**Acceptance Criteria:**
- [ ] `initials()` trata string vazia e null (retorna "?" como fallback)
- [ ] Progress bar de instancias trata `maxInstances = 0` (sem divisao por zero)
- [ ] `billingType.toUpperCase()` com optional chaining e fallback
- [ ] Delete button desabilitado durante request (prevenir double-click)
- [ ] Adicionar `isDeleting` state ao delete flow
- [ ] Typecheck passa
- [ ] Verificar no browser usando dev-browser skill

### US-016: Corrigir stale closures no UserManageModal
**Description:** Como desenvolvedor, preciso que os useEffects tenham deps corretas para evitar bugs sutis.

**Acceptance Criteria:**
- [ ] useEffect em UserManageModal: deps incluem funcoes chamadas ou usar refs
- [ ] `executeSystemRoleChange` wrapped em try/catch para erros de rede
- [ ] Optimistic updates com rollback correto em TODOS os cenarios de erro
- [ ] Typecheck passa

### US-017: Corrigir form state no EditOrganizationDialog
**Description:** Como admin, preciso que reabrir o dialog de edicao mostre dados frescos e limpe erros antigos.

**Acceptance Criteria:**
- [ ] useEffect depende de `[organization, open]` (adicionar `open`)
- [ ] Error state limpo ao abrir dialog
- [ ] Se mesma org reaberta apos cancel, form reseta para valores originais
- [ ] Remover `if (!organization) return null` — renderizar Dialog controlado por `open` prop
- [ ] Adicionar Loader2 spinner no botao de submit (consistencia com CreateDialog)
- [ ] Typecheck passa
- [ ] Verificar no browser usando dev-browser skill

---

## FASE 5: Acessibilidade (WCAG 2.1 AA)

### US-018: Tornar tabela navegavel por teclado
**Description:** Como usuario de leitor de tela, preciso navegar e ativar linhas da tabela de organizacoes via teclado.

**Acceptance Criteria:**
- [ ] TableRow clicavel recebe `tabIndex={0}` e `role="button"`
- [ ] `onKeyDown` handler: Enter e Space ativam `handleOpenDetail`
- [ ] Focus ring visivel em linhas focadas (`:focus-visible` outline)
- [ ] Typecheck passa
- [ ] Verificar no browser usando dev-browser skill

### US-019: Adicionar aria-labels em botoes icon-only
**Description:** Como usuario de leitor de tela, preciso entender o proposito de cada botao mesmo sem ver o icone.

**Acceptance Criteria:**
- [ ] Botao "Gerenciar" no OrgDetailDialog: `aria-label={`Gerenciar ${member.user.name}`}`
- [ ] Botao trash no UserManageModal: `aria-label={`Remover de ${orgName}`}`
- [ ] Botao X de fechar invite form: `aria-label="Fechar formulario de convite"`
- [ ] Botao X de fechar add-org form: `aria-label="Cancelar adicao"`
- [ ] Input document desabilitado no EditDialog: `aria-describedby` linkando ao texto explicativo
- [ ] Typecheck passa

### US-020: Corrigir associacao de labels em selects
**Description:** Como usuario de leitor de tela, preciso que selects tenham labels corretamente associados.

**Acceptance Criteria:**
- [ ] CreateDialog: Select de tipo recebe `aria-label="Tipo de organizacao"`
- [ ] Tab counts no OrgDetailDialog mostram skeleton durante loading em vez de "(0)"
- [ ] Todos os Select components tem `aria-label` ou `id` associado a `<Label htmlFor>`
- [ ] Typecheck passa

---

## FASE 6: Simplificacao & Code Quality

### US-021: Consolidar tipo Organization em arquivo unico
**Description:** Como desenvolvedor, preciso de uma unica fonte de verdade para o tipo Organization.

**Acceptance Criteria:**
- [ ] Criar `src/app/admin/organizations/types.ts` com tipo `Organization` canonico
- [ ] Remover tipo duplicado de `page.tsx` (line 52)
- [ ] Remover interface local de `edit-organization-dialog.tsx` (lines 26-34)
- [ ] Todos os arquivos importam de `types.ts`
- [ ] Typecheck passa

### US-022: Reduzir useState com useReducer na page principal
**Description:** Como desenvolvedor, preciso que o state management da pagina seja mais previsivel e mantenivel.

**Acceptance Criteria:**
- [ ] Consolidar delete state (deleteOrgId, deleteOrgName, showDeleteConfirm) em um unico state `deleteTarget: { id, name } | null`
- [ ] Consolidar pagination state (page, totalPages, total) em um objeto
- [ ] `onSuccess` callbacks usar referencia estavel (`loadOrganizations` diretamente, sem arrow wrapper)
- [ ] Typecheck passa

### US-023: Extrair hook reutilizavel de data fetching
**Description:** Como desenvolvedor, preciso eliminar as 3 funcoes de load identicas no OrgDetailDialog.

**Acceptance Criteria:**
- [ ] Criar hook `useAsyncData<T>(fetcher, deps)` que gerencia loading/data/error
- [ ] OrgDetailDialog usa 3 instancias do hook (members, instances, webhooks)
- [ ] Hook inclui cancellation via AbortController
- [ ] Reduzir de ~10 useState para ~3 hooks
- [ ] Typecheck passa

### US-024: Eliminar import circular de tipo
**Description:** Como desenvolvedor, preciso remover o import de tipo que acopla componentes ao page.tsx.

**Acceptance Criteria:**
- [ ] OrgDetailDialog importa `Organization` de `types.ts` (nao de `../page`)
- [ ] UserManageModal importa `Organization` de `types.ts` (nao de `../page`)
- [ ] Nenhum componente em `components/` importa de `page.tsx`
- [ ] Typecheck passa

---

## Functional Requirements

- FR-1: Todas as server actions em `src/app/admin/actions.ts` devem chamar `requireAdmin()` como primeira instrucao
- FR-2: Nenhuma server action deve retornar valores raw de environment variables
- FR-3: Todas as error responses devem usar mensagens sanitizadas (sem stack traces ou nomes de tabela)
- FR-4: Operacoes multi-step no banco devem usar `$transaction`
- FR-5: Queries de listagem devem filtrar `isActive: true` por default
- FR-6: Zod schemas nas actions devem ser >= restritivos que os schemas nos controllers
- FR-7: IDs recebidos via parametro devem ser validados como UUID
- FR-8: Botoes icon-only devem ter `aria-label` descritivo
- FR-9: Elementos clicaveis interativos devem ser navegaveis por teclado
- FR-10: Types devem ter uma unica fonte de verdade por entidade

## Non-Goals

- Refatorar o controller de organizations para service layer completo
- Adicionar testes E2E para todas as jornadas (fica para PRD separado)
- Redesign visual da pagina (ja feito — troca de Sheet por Dialog)
- Implementar audit logging completo (fica para PRD de auditoria)
- Migrar server actions para route handlers
- Adicionar 2FA para operacoes admin

## Technical Considerations

- `requireAdmin()` ja existe no codebase — usar padrao consistente com outras actions
- `src/lib/rate-limit.ts` ou `src/lib/rate-limit/` ja existe — verificar API antes de implementar
- `$transaction` do Prisma suporta interactive transactions — usar para US-008
- `AbortController` nativo do browser para cancellation de requests
- Manter backward compatibility: nenhuma mudanca de API shape que quebre o frontend

## Success Metrics

- 0 server actions sem auth check no diretorio `/admin/`
- 0 secrets raw retornados para o frontend
- 0 crashes de frontend com dados edge case (empty string, null, zero)
- Tabela navegavel 100% por teclado (Tab + Enter)
- Reducao de ~34 useState para ~15 (via useReducer + hooks)

## Open Questions

- Q1: `verifyAdminAction()` vs `requireAdmin()` — padronizar em qual? (recomendacao: `requireAdmin()` que faz throw)
- Q2: Rate limiting deve ser por IP ou por userId? (recomendacao: por userId autenticado + fallback IP)
- Q3: O `getEnvDefaultsAction` e usado em alguma outra pagina? Se nao, pode ser removido inteiro
- Q4: Devemos adicionar audit log para operacoes admin neste PRD ou separado?
