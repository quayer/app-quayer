# ✅ Correções Aplicadas no Front-End

Data: 21/10/2025  
Status: 🔧 Em andamento

## 🎯 Problemas Corrigidos

### 1. ✅ Erro 500 ao Criar Integração
**Problema:** `db.instance.count()` falhava porque tabela `Instance` não existe

**Solução:**
- Corrigido `instances.repository.ts` para usar `this.prisma.connection` em vez de `this.prisma.instance`
- Tabela correta no schema é `Connection`, não `Instance`

**Arquivos Modificados:**
- `src/features/instances/repositories/instances.repository.ts`

---

### 2. ✅ Erro ao Carregar Estatísticas Admin
**Problema:** `db.instance.count()` em `/admin/actions.ts` causava erro

**Solução:**
- Corrigido `getDashboardStatsAction()` para usar `db.connection.count()`
- Manteve compatibilidade com interface usando `totalInstances: totalConnections`

**Arquivos Modificados:**
- `src/app/admin/actions.ts` (linha 203)

---

### 3. ✅ Página /conversas Sem Layout
**Problema:** Layout vazio, sem sidebar

**Solução:**
```typescript
// Antes
export default function ConversasLayout({ children }) {
  return <>{children}</>;
}

// Depois
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

export default function ConversasLayout({ children }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 w-full">
        {children}
      </main>
    </SidebarProvider>
  );
}
```

**Arquivos Modificados:**
- `src/app/conversas/layout.tsx`

---

### 4. ✅ Mensagens no Menu Errado
**Problema:** "Mensagens" aparecia no menu de organização, deveria estar em Administração

**Solução:**
- Movido "Mensagens" de `orgMenu` para `adminMenu`
- Agora aparece como submenu de "Administração"
- Removido badge "Admin" (não necessário se está no menu admin)

**Arquivos Modificados:**
- `src/components/app-sidebar.tsx` (linha 72-75)

---

### 5. ✅ Sidebar Labels Dinâmicos
**Problema:** `nav-main.tsx` tinha "Platform" hardcoded

**Solução:**
- Adicionado prop `label` opcional ao componente `NavMain`
- Labels agora são dinâmicos:
  - Admin menu: sem label (null)
  - Organization menu: nome da org ou "Organização"
  - User menu: sem label (null)

**Arquivos Modificados:**
- `src/components/nav-main.tsx` (linha 24, 40)
- `src/components/app-sidebar.tsx` (linha 199, 209-212, 217)

---

## 🔧 Correções em Andamento

### 6. ⏳ Nome da Organização no Sidebar
**Problema:** Mostra "Organização" genérico em vez de "Quayer HQ"

**Status:** Investigando por que `useCurrentOrganization()` não retorna dados

**Possíveis Causas:**
- Endpoint `/organizations/current` retornando erro
- Query do hook não sendo executada
- JWT não tem `currentOrgId` correto

**Próximos Passos:**
- Verificar endpoint funciona via browser console
- Verificar JWT payload tem `currentOrgId`
- Debug do hook `useCurrentOrganization`

---

### 7. ⏳ Remover Dados Mock
**Problema:** Alguns componentes podem estar usando dados mockados

**Status:** Pendente

**Estratégia:**
- Procurar por arrays hardcoded com dados fake
- Substituir por queries reais ou estados vazios
- Garantir mensagens apropriadas quando sem dados

---

## 📊 Testes Necessários

### Backend (API)
- [x] `db.connection.count()` funciona
- [x] `getDashboardStatsAction()` retorna dados corretos
- [ ] Endpoint `/api/v1/instances` (POST) funciona
- [ ] Endpoint `/api/v1/organizations/current` funciona

### Frontend (UI)
- [x] Layout de `/conversas` tem sidebar
- [x] Menu "Mensagens" está em Administração
- [ ] Nome da organização aparece no sidebar
- [ ] Organization Switcher mostra todas as orgs
- [ ] Troca de organização funciona
- [ ] Sem erros 401/500 no console

---

## 🔑 Seed Atualizado

### Admin com Organização
O seed agora cria automaticamente:
- ✅ Admin: `admin@quayer.com`
- ✅ Password: `admin123456`
- ✅ Recovery Token: `123456` (permanente)
- ✅ Organização: "Quayer HQ" 
- ✅ Vínculo: Admin é master da Quayer HQ
- ✅ Onboarding: Completo

### Como Rodar
```bash
npm run db:seed
```

### Variáveis ENV (Customização)
```env
ADMIN_EMAIL=admin@quayer.com
ADMIN_PASSWORD=admin123456
ADMIN_NAME=Administrator
ADMIN_RECOVERY_TOKEN=123456
```

---

## 📁 Arquivos Modificados

1. ✅ `src/features/instances/repositories/instances.repository.ts` - Corrigido instance → connection
2. ✅ `src/app/admin/actions.ts` - Corrigido stats count
3. ✅ `src/app/conversas/layout.tsx` - Adicionado sidebar
4. ✅ `src/components/app-sidebar.tsx` - Mensagens movida + labels dinâmicos
5. ✅ `src/components/nav-main.tsx` - Labels dinâmicos
6. ✅ `prisma/seed.ts` - Admin com organização
7. ✅ `src/features/organizations/organizations.repository.ts` - Removido instances do _count
8. ✅ `src/features/auth/controllers/auth.controller.ts` - Debug logs + normalização de código

---

## 🧪 Próximos Testes

1. Login do admin com recovery token `123456`
2. Verificar sidebar mostra "Quayer HQ"
3. Criar nova integração (deve funcionar sem erro 500)
4. Navegar para /conversas (deve ter sidebar)
5. Verificar menu Mensagens em Administração
6. Testar Organization Switcher
7. Validar todas as rotas sem erros

---

## 🚀 Comandos Úteis

```bash
# Reiniciar servidor
npm run dev

# Rodar seed
npm run db:seed

# Rodar testes E2E
npx playwright test

# Testes específicos
npx playwright test test/e2e/admin-sidebar-validation.spec.ts
```

