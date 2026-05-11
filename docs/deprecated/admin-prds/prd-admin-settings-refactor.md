# PRD: Admin Settings — Code Splitting Real + Consolidação de Abas

## Contexto Crítico

A página `/admin/settings` já usa `dynamic()` do Next.js, mas **o code splitting está quebrado**:
todos os 7 componentes importam do mesmo barrel `@/client/components/admin-settings/index.ts`.
O webpack vê o barrel como um único módulo e empacota tudo junto — a intenção de carregar cada aba separadamente não funciona.

Além disso, existem 3 bugs ativos identificados na auditoria anterior e a pergunta sobre troca de organização pelo admin está sem resposta de design.

---

## Goals

- Fazer o code splitting funcionar de verdade (cada aba = chunk separado)
- Adicionar 8ª aba "Segurança" consolidando `SecuritySettings.tsx` (já existe, não está exposta)
- Corrigir 3 bugs ativos: `SystemInfo` sem auth, OAuth `googleEnabled` fora do Zod, Confirmação assimétrica no blockAI
- Definir e implementar o fluxo de troca de organização para o admin global

---

## Análise: Faz Sentido Ter 12 Itens no Sidebar Admin?

**Veredicto: Sim, mas com 3 ajustes.**

| Item Sidebar | Status | Observação |
|---|---|---|
| Dashboard | ✅ Mantém | Métricas globais do sistema |
| Organizações | ✅ Mantém | CRUD de orgs, essencial |
| Conexões | ✅ Mantém | Instâncias cross-org (admin view) |
| Sessões | ✅ Mantém | Sessions ativas globais |
| Convites | ✅ Mantém | Invites pendentes globais |
| Roles | ⚠️ Verificar | Existe como stub? Precisa de backend |
| Domínios | ⚠️ Verificar | Stub confirmado, Redis-dependent |
| SCIM | ⚠️ Verificar | Stub, feature futura |
| Notificações | ✅ Mantém | Config de push/email global |
| Auditoria | ✅ Mantuns | Log de eventos do sistema |
| Segurança | ✅ Mantém | IP rules, rate limits |
| Configurações | ✅ Mantém | Settings sistema (8 abas) |

**Recomendação**: Roles, Domínios e SCIM são stubs incompletos. Devem ter banner "Em breve" visível ao invés de página vazia que confunde o admin. Não remover do sidebar — só sinalizar estado.

---

## User Stories

### US-001: Corrigir code splitting real no `/admin/settings`

**Descrição:** Como desenvolvedor, quero que cada aba do settings carregue seu próprio JS chunk, para que o Time to Interactive da página seja menor.

**Problema atual:**
```typescript
// ❌ ERRADO — barrel resolve tudo junto, webpack gera 1 chunk
const ProvedoresSettings = dynamic(
  () => import('@/client/components/admin-settings').then(mod => mod.ProvedoresSettings),
  { ssr: false }
)
```

**Fix esperado:**
```typescript
// ✅ CORRETO — import direto do arquivo, webpack gera chunk separado
const ProvedoresSettings = dynamic(
  () => import('@/client/components/admin-settings/ProvedoresSettings').then(mod => mod.ProvedoresSettings),
  { loading: () => <TabSkeleton />, ssr: false }
)
```

**Acceptance Criteria:**
- [ ] Todos os 8 `dynamic()` importam do arquivo individual, não do barrel `index.ts`
- [ ] Build confirma múltiplos chunks JS para a rota `/admin/settings` (`next build --analyze`)
- [ ] Comportamento visual idêntico ao anterior (skeleton → conteúdo)
- [ ] Typecheck passa

---

### US-002: Adicionar 8ª aba "Segurança" em Settings

**Descrição:** Como admin, quero gerenciar configurações de segurança (rate limit, lockout, força de senha) na mesma página de settings, sem precisar ir a uma segunda rota.

**Contexto:** `SecuritySettings.tsx` já existe em `admin-settings/` mas não está exposta em nenhuma aba. A `/admin/security` é uma página operacional (IP rules ativas). São coisas diferentes:
- **`/admin/security`** = operacional (ver/bloquear IPs, regras ativas)
- **SecuritySettings (aba)** = configuração (definir políticas de rate limit, lockout)

**Acceptance Criteria:**
- [ ] 8ª aba "Segurança" adicionada ao `TabsList` em `/admin/settings`
- [ ] `SecuritySettings` importado via `dynamic()` do arquivo individual
- [ ] Aba tem ícone `Lock` ou `ShieldAlert`
- [ ] Tab value = `"security"` (url: `/admin/settings?tab=security`)
- [ ] Typecheck passa
- [ ] Verificar no browser: aba visível e renderiza sem erro

---

### US-003: Corrigir `SystemInfo` — sem auth headers

**Descrição:** Como admin, quero que o painel "Sistema" mostre informações reais do servidor sem erros de autenticação.

**Problema:**
```typescript
// SystemInfo.tsx faz fetch sem passar cookie de autenticação
const res = await fetch('/api/v1/system-settings')
// → retorna 401 porque adminProcedure() requer cookie accessToken
```

**Fix:**
```typescript
const res = await fetch('/api/v1/system-settings', {
  credentials: 'include', // envia cookie HttpOnly accessToken
})
```

**Acceptance Criteria:**
- [ ] `SystemInfo.tsx` usa `credentials: 'include'` em todos os `fetch()` calls
- [ ] Aba "Sistema" carrega dados reais sem erro 401
- [ ] Typecheck passa

---

### US-004: Corrigir OAuth — `googleEnabled` fora do Zod schema

**Descrição:** Como admin, quero poder ativar/desativar login com Google sem o toggle quebrar silenciosamente.

**Problema identificado:**
```typescript
// AutenticacaoSettings.tsx envia { googleEnabled: boolean }
// Mas o Zod schema do endpoint não inclui googleEnabled → campo ignorado silenciosamente
```

**Fix:**
1. Adicionar `googleEnabled: z.boolean().optional()` no `updateSystemSettingsSchema` no controller
2. Persistir o campo no handler do update

**Acceptance Criteria:**
- [ ] `googleEnabled` adicionado ao Zod schema de update em `system-settings.controller.ts`
- [ ] Toggle de Google OAuth salva e persiste corretamente
- [ ] Typecheck passa

---

### US-005: Confirmação simétrica em Sessions (blockAI / unblockAI)

**Descrição:** Como admin, quero confirmação antes de desbloquear IA em uma sessão, igual ao fluxo de bloqueio.

**Problema:** `blockAI` tem dialog de confirmação, `unblockAI` executa direto sem confirmação — comportamento assimétrico e arriscado.

**Acceptance Criteria:**
- [ ] `unblockAI` em `/admin/sessions` exibe `AlertDialog` de confirmação antes de executar
- [ ] Dialog mostra nome da sessão e propósito da ação
- [ ] Typecheck passa
- [ ] Verificar no browser: dialog aparece ao clicar "Desbloquear IA"

---

### US-006: Stubs de Roles/Domínios/SCIM — banner "Em breve"

**Descrição:** Como admin, quero ver claramente que Roles, Domínios e SCIM são features futuras, não páginas quebradas.

**Acceptance Criteria:**
- [ ] Cada página stub (roles, domains, scim) exibe um banner/card "Em desenvolvimento" com descrição da feature planejada
- [ ] Layout mantém sidebar e breadcrumb normais
- [ ] Typecheck passa

---

### US-007: Org context switcher para admin global

**Descrição:** Como admin global, quero poder trocar qual organização estou visualizando nas páginas org-específicas, sem precisar sair para outra conta.

**Contexto:** Páginas como `/admin/sessions`, `/admin/integracoes`, `/admin/organizations/[id]` mostram dados de uma organização. O admin tem `currentOrgId` no JWT, mas não há UI para trocar.

**Abordagem mínima viável:**
- Adicionar `<OrgSwitcherBadge>` no header de páginas org-específicas
- Ao clicar, mostra dropdown com organizações disponíveis
- Selecionar chama `setCurrentOrg` (endpoint já existe) e faz `router.refresh()`

**Acceptance Criteria:**
- [ ] Org switcher presente no header das páginas: `/admin/sessions`, `/admin/integracoes`, `/admin/organizations`
- [ ] Selecionar org atualiza `currentOrgId` e recarrega dados
- [ ] Org atual exibida no sidebar header (já implementado) atualiza após troca
- [ ] Typecheck passa
- [ ] Verificar no browser: trocar org reflete nos dados da tabela

---

## Functional Requirements

- FR-1: Dynamic imports devem referenciar o arquivo direto, nunca o barrel index
- FR-2: Cada aba do settings deve resultar em chunk JS separado no build
- FR-3: Todos os `fetch()` em componentes admin-settings usam `credentials: 'include'`
- FR-4: `googleEnabled` salvo e lido corretamente via API
- FR-5: BlockAI e unblockAI têm dialogs de confirmação simétricos
- FR-6: Páginas stub exibem estado "em desenvolvimento" ao invés de conteúdo vazio
- FR-7: Admin pode trocar org context em páginas operacionais

## Non-Goals

- Não redesenhar o layout das abas de settings
- Não mover /admin/security (IP rules operacionais) para dentro de settings
- Não implementar Roles/Domínios/SCIM (apenas banners de stub)
- Não fazer SSR nas abas de settings (mantém `ssr: false`)

## Technical Considerations

- Code splitting com barrels: Next.js + webpack não garante split quando usa barrel re-exports mesmo com dynamic(). Import direto ao arquivo é a única forma confiável.
- Barrel `index.ts` pode ser mantido para outros casos (import estático fora de dynamic), mas dynamic() deve sempre apontar para o arquivo individual.
- `credentials: 'include'` funciona em same-origin (localhost e produção). Não requer mudanças no CORS.

## Ordem de Implementação Sugerida

1. US-001 (code splitting) — impacto de performance, zero risco
2. US-003 (SystemInfo auth) — bug crítico, fix de 1 linha
3. US-004 (OAuth schema) — bug de dados
4. US-002 (8ª aba) — nova feature simples
5. US-005 (confirmação sessões) — UX assimétrico
6. US-006 (stubs) — polimento
7. US-007 (org switcher) — maior escopo, pode ser PRD separado

## Open Questions

- US-007: O endpoint `setCurrentOrg` existe? Verificar `src/server/features/auth/` ou `src/server/features/organizations/` para confirmar a rota antes de implementar.
- Roles: existe algum backend para roles customizadas ou é 100% stub?
