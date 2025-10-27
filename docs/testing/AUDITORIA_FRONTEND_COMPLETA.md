# 🔍 Auditoria Completa do Front-End - Problemas Encontrados

Data: 21/10/2025
Baseado em: Skill webapp-testing + Testes manuais com Playwright

## 🚨 Problemas Críticos Identificados

### 1. **Sidebar Duplicando "Platform"** ❌

**Problema:**
- Sidebar mostra "Platform" **2 VEZES**
- Uma vez para "Administração" ✅
- Outra para menu de organização ❌

**Evidência no Snapshot:**
```yaml
- generic [ref=e12]:
  - generic [ref=e13]: Platform  ← PRIMEIRA OCORRÊNCIA
  - list [ref=e14]:
    - listitem: Administração...

- generic [ref=e47]:
  - generic [ref=e48]: Platform  ← SEGUNDA OCORRÊNCIA (ERRADO!)
  - list [ref=e49]:
    - listitem: Dashboard...
```

**Deveria Mostrar:**
```
Platform
├── Administração
│   ├── Dashboard Admin
│   ├── Organizações
│   └── ...
└── [NOME DA ORGANIZAÇÃO] ← Quayer HQ
    ├── Dashboard
    ├── Integrações
    └── ...
```

**Arquivo:** `src/components/app-sidebar.tsx`
**Linha:** ~209 (onde usa `selectedOrgName`)

---

### 2. **Nome da Organização Não Aparece** ❌

**Problema:**
- Menu de organização mostra **"Platform"** genérico
- Deveria mostrar **"Quayer HQ"** (nome da organização atual)

**Causa Raiz:**
- `useCurrentOrganization()` pode estar retornando `null` ou dados incorretos
- `selectedOrgName` não está sendo renderizado corretamente

**Evidência:**
- Admin tem `currentOrgId` no banco: `cf378bbb-38af-4c04-9b42-bafd481e7718`
- Mas sidebar mostra "Platform" em vez de "Quayer HQ"

**Arquivos Afetados:**
- `src/components/app-sidebar.tsx` (linha 209)
- `src/hooks/useOrganization.tsx` (verificar query)

---

### 3. **Erros 401/500 no Console** ❌

**Problemas no Console:**
```
[ERROR] Failed to load resource: 401 (Unauthorized) @ http://localhost:3000/...
[ERROR] Failed to load resource: 500 (Internal Server Error) @ http://localhost:3000/...
[ERROR] Erro ao carregar estatísticas: Cannot read properties of undefined (reading 'count')
```

**Possíveis Causas:**
1. Dashboard fazendo chamadas API sem autenticação correta
2. Endpoints retornando 500 (erro no servidor)
3. Statísticas tentando acessar propriedade `count` de objeto `undefined`

**Arquivos para Investigar:**
- `src/app/(admin)/admin/page.tsx` - Dashboard admin
- APIs que retornam 401/500

---

### 4. **Organization Switcher Não Funciona** ❌

**Problema:**
- Quando clica em "trocar organização" não aparece outras
- Pode ser que não haja outras organizações para trocar
- OU o componente não está carregando as organizações corretamente

**Para Testar:**
1. Criar 2+ organizações para o admin
2. Verificar se Organization Switcher mostra todas
3. Testar troca entre organizações
4. Verificar se sidebar atualiza com novo nome

**Arquivo:** `src/components/organization-switcher.tsx`

---

### 5. **Alignment Issues (Layout)** ⚠️

**Problema Relatado pelo Usuário:**
- Algumas páginas estão desalinhadas
- Tanto no sidebar quanto nas páginas

**Screenshots Necessários:**
- [ ] `/admin` - Dashboard admin
- [ ] `/admin/organizations` - Lista de organizações
- [ ] `/integracoes` - Dashboard de integrações
- [ ] `/integracoes/dashboard` - Dashboard alternativo
- [ ] `/conversas` - Página de conversas

---

## 🎯 Plano de Correção

### Fase 1: Corrigir Sidebar (PRIORIDADE ALTA)

**Tarefa 1.1:** Corrigir nome da organização no menu
```typescript
// src/components/app-sidebar.tsx

// ❌ ATUAL: Mostra "Platform" genérico
{data.orgMenu.length > 0 && (
  <NavMain items={data.orgMenu} />
)}

// ✅ CORREÇÃO: Mostrar nome da organização
{data.orgMenu.length > 0 && (
  <>
    {data.selectedOrgName && (
      <div className="px-4 py-2">
        <p className="text-xs font-semibold uppercase">
          {data.selectedOrgName}
        </p>
      </div>
    )}
    <NavMain items={data.orgMenu} />
  </>
)}
```

**Tarefa 1.2:** Verificar `useCurrentOrganization` hook
- Garantir que está fazendo query correta
- Verificar se endpoint `/organizations/current` funciona
- Testar com browser console

**Tarefa 1.3:** Remover duplicação de "Platform"
- Investigar componente `NavMain`
- Verificar se título "Platform" é hardcoded

---

### Fase 2: Criar Múltiplas Organizações para Teste

**Script de Seed para Criar Organizações do Admin:**
```typescript
// No seed.ts, após criar admin:

// Criar 3 organizações diferentes para o admin testar troca
const adminOrgs = [
  {
    name: 'Quayer HQ',
    slug: 'quayer-hq',
    document: '00.000.000/0001-00',
    type: 'pj',
  },
  {
    name: 'Quayer Brasil',
    slug: 'quayer-brasil', 
    document: '11.111.111/0001-11',
    type: 'pj',
  },
  {
    name: 'Quayer Labs',
    slug: 'quayer-labs',
    document: '22.222.222/0001-22',
    type: 'pj',
  },
];

for (const orgData of adminOrgs) {
  const org = await prisma.organization.create({ data: orgData });
  
  await prisma.userOrganization.create({
    data: {
      userId: adminUser.id,
      organizationId: org.id,
      role: 'master',
      isActive: true,
    },
  });
}
```

---

### Fase 3: Testar Organization Switcher

**Testes com Playwright:**
```typescript
test('Organization Switcher shows all orgs', async ({ page }) => {
  // 1. Login como admin
  await loginAsAdmin(page);
  
  // 2. Abrir organization switcher
  const switcherButton = page.locator('[data-organization-switcher]');
  await switcherButton.click();
  
  // 3. Verificar se mostra todas as 3 organizações
  await expect(page.locator('text=Quayer HQ')).toBeVisible();
  await expect(page.locator('text=Quayer Brasil')).toBeVisible();
  await expect(page.locator('text=Quayer Labs')).toBeVisible();
  
  // 4. Trocar para Quayer Brasil
  await page.click('text=Quayer Brasil');
  
  // 5. Verificar se sidebar atualizou
  await expect(page.locator('text=Quayer Brasil')).toBeVisible();
  
  // 6. Verificar se URL mudou (se aplicável)
});
```

---

### Fase 4: Corrigir Erros 401/500

**Investigar Dashboard Admin:**
```typescript
// src/app/(admin)/admin/page.tsx

// Verificar se componentes estão fazendo queries corretas
// Verificar se estão usando authProcedure
// Verificar se endpoints existem e funcionam
```

**Endpoints para Testar:**
```bash
# Estatísticas
curl http://localhost:3000/api/v1/admin/stats \
  -H "Authorization: Bearer <token>"

# Organizações
curl http://localhost:3000/api/v1/organizations/current \
  -H "Authorization: Bearer <token>"
```

---

### Fase 5: Testar Todas as Rotas

**Usando webapp-testing skill:**
```typescript
const criticalRoutes = [
  // Públicas
  '/', '/login', '/register', '/docs',
  
  // Admin
  '/admin', '/admin/organizations', '/admin/clients',
  '/admin/integracoes', '/admin/webhooks', '/admin/logs',
  
  // Organizações
  '/integracoes', '/integracoes/dashboard', '/conversas',
  '/integracoes/settings', '/integracoes/users',
  
  // Configurações
  '/configuracoes/departamentos', '/configuracoes/labels',
  '/configuracoes/tabulacoes', '/configuracoes/webhooks',
];

for (const route of criticalRoutes) {
  // 1. Navigate + networkidle
  await page.goto(`http://localhost:3000${route}`);
  await page.waitForLoadState('networkidle');
  
  // 2. Reconnaissance (screenshot + logs)
  await takeReconnaissance(page, route.replace(/\//g, '-'));
  
  // 3. Verificar erros
  const { errors } = setupErrorCapture(page);
  expect(errors).toHaveLength(0);
  
  // 4. Verificar layout alignment
  await checkLayoutAlignment(page);
}
```

---

## 📊 Checklist de Validação

### Sidebar
- [ ] Nome da organização aparece corretamente (em vez de "Platform")
- [ ] Não duplica menus
- [ ] Admin menu aparece quando é admin
- [ ] Organization menu aparece quando tem organização
- [ ] User menu aparece quando é user comum

### Organization Switcher
- [ ] Mostra todas as organizações do usuário
- [ ] Permite trocar entre organizações
- [ ] Sidebar reflete mudança de organização
- [ ] URL atualiza se necessário

### Layout Alignment
- [ ] Sidebar alinhado corretamente
- [ ] Páginas com padding/margin corretos
- [ ] Cards e componentes alinhados
- [ ] Breadcrumbs funcionando

### Console Errors
- [ ] Sem erros 401 (Unauthorized)
- [ ] Sem erros 500 (Internal Server Error)
- [ ] Sem erros de undefined/null access
- [ ] Sem warnings críticos

---

## 🔧 Próximos Passos

1. ✅ Admin criado com organização (Quayer HQ)
2. ✅ Recovery token funcionando (123456)
3. ⏳ Corrigir sidebar (nome org + duplicação)
4. ⏳ Criar múltiplas organizações para teste
5. ⏳ Testar organization switcher
6. ⏳ Corrigir erros 401/500
7. ⏳ Validar alinhamento de todas as páginas
8. ⏳ Executar suite completa de testes E2E

---

## 📸 Screenshots Capturados

1. `admin-dashboard-sidebar-problem.png` - Sidebar com problemas
   - Mostra duplicação de "Platform"
   - Nome da organização não aparece

