# 🔧 Plano de Correções Prioritárias - UX

**Data:** 2025-10-04
**Objetivo:** Implementar correções críticas identificadas na auditoria brutal + gaps da arquitetura UX

---

## 📊 STATUS GERAL

### ✅ JÁ IMPLEMENTADO
- [x] Hook `usePermissions` completo e funcional
- [x] Sistema de roles (organizationRole + systemRole)
- [x] AuthProvider com organizationRole
- [x] AppSidebar com lógica correta de roles
- [x] Middleware sem mensagem de erro "forbidden"
- [x] Autenticação JWT funcionando

### ❌ PROBLEMAS CRÍTICOS A CORRIGIR

#### **SPRINT 1 - CRÍTICO (2-3 horas)**

**1. Proteger ações por permissão na página de Integrações** ⭐⭐⭐⭐⭐
- [integracoes/page.tsx:226-229](src/app/integracoes/page.tsx#L226) - Botão "Criar Integração" aparece para todos
- [integracoes/page.tsx:309-323](src/app/integracoes/page.tsx#L309) - Dropdown mostra opções sem permissão
- [integracoes/page.tsx:388-401](src/app/integracoes/page.tsx#L388) - Bulk actions sem proteção

**2. Adicionar Loading States** ⭐⭐⭐⭐⭐
- Todos os modals (create, edit, connect) sem spinner
- Botões permanecem clicáveis durante submit
- Usuário clica múltiplas vezes = registros duplicados

**3. Simplificar Tabela de Integrações** ⭐⭐⭐⭐
- Reduzir de 10 para 6 colunas
- Remover: "Provedor" (sempre o mesmo), "Agentes" (sempre 0), "Criado em" (manter só "Atualizado")
- Manter: Checkbox, Nome, Telefone, Status, Atualizado há, Ações

**4. Adicionar Botão no Header** ⭐⭐⭐⭐
- Botão "Nova Integração" some quando lista não está vazia
- Header deve ter botão permanente (com permissão)

**5. Remover Dados Fake do Dashboard** ⭐⭐⭐⭐
- [dashboard/page.tsx:296-344](src/app/integracoes/dashboard/page.tsx#L296) - Gráficos com dados mockados
- Substituir por dados reais ou remover até ter dados

#### **SPRINT 2 - IMPORTANTE (3-4 horas)**

**6. Criar Componentes Custom Faltantes**
- `StatusBadge` - Badge de status automático (conectado/desconectado)
- `EmptyState` - Estado vazio contextualizado
- `PageHeader` - Header de página com breadcrumb

**7. Melhorar Empty States**
- Contextualizar por permissão
- Explicar o que fazer
- Remover botões se usuário não pode criar

**8. Unificar Nomenclatura**
- Decidir: "Integrações" (recomendado) vs "Instâncias"
- Aplicar em toda a plataforma
- Atualizar API responses se necessário

**9. Implementar Confirmações Visuais**
- AlertDialog para deletar
- Toasts mais informativos
- Feedback de ações assíncronas

#### **SPRINT 3 - MELHORIAS (4-5 horas)**

**10. Melhorar Acessibilidade**
- Adicionar aria-labels em checkboxes
- Focus trap em modais
- Keyboard navigation

**11. Otimizar Performance**
- Debounce em search (500ms)
- Configurar staleTime do React Query (5min)
- Lazy loading de modais

**12. Versão Mobile**
- Tabela → Cards em mobile
- Sidebar collapsible
- Modals scrollable

---

## 🎯 IMPLEMENTAÇÃO IMEDIATA

### **Correção 1: Proteger Botões e Dropdowns**

**Arquivo:** `src/app/integracoes/page.tsx`

**Mudanças:**

```tsx
// No topo do componente
import { usePermissions } from '@/hooks/usePermissions'

// Dentro do componente
const { canCreateInstance, canEditInstance, canDeleteInstance, canSelectBroker } = usePermissions()

// Linha 140-147: Adicionar botão no header
<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
  <div>
    <h1 className="text-3xl font-bold">Minhas Integrações</h1>
    <p className="text-muted-foreground mt-1">
      Visualize suas integrações disponíveis
    </p>
  </div>
  {canCreateInstance && (
    <Button onClick={() => setIsCreateModalOpen(true)}>
      <Plus className="h-4 w-4 mr-2" />
      Nova Integração
    </Button>
  )}
</div>

// Linha 217-230: Empty state contextualizado
{filteredInstances.length === 0 && (
  <div className="text-center py-12">
    <Plug className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
    {canCreateInstance ? (
      <>
        <h3 className="text-lg font-semibold mb-2">
          Comece conectando seu WhatsApp
        </h3>
        <p className="text-muted-foreground mb-4 max-w-md mx-auto">
          Conecte seu número do WhatsApp para enviar e receber mensagens.
          É rápido e seguro!
        </p>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Conectar WhatsApp
        </Button>
      </>
    ) : (
      <>
        <h3 className="text-lg font-semibold mb-2">
          Sem integrações disponíveis
        </h3>
        <p className="text-muted-foreground">
          Entre em contato com o administrador para solicitar acesso.
        </p>
      </>
    )}
  </div>
)}

// Linha 309-323: Dropdown filtrado por permissão
<DropdownMenuContent align="end">
  <DropdownMenuItem onClick={() => handleDetails(instance)}>
    Ver Detalhes
  </DropdownMenuItem>
  {canEditInstance && (
    <DropdownMenuItem onClick={() => handleEdit(instance)}>
      Editar
    </DropdownMenuItem>
  )}
  {canEditInstance && (
    <DropdownMenuItem onClick={() => handleConnect(instance)}>
      {instance.status === 'connected' ? 'Reconectar' : 'Conectar'}
    </DropdownMenuItem>
  )}
  {canEditInstance && (
    <DropdownMenuItem onClick={() => handleShare(instance)}>
      Compartilhar
    </DropdownMenuItem>
  )}
</DropdownMenuContent>

// Linha 388-401: Bulk actions filtrados
{selectedIds.size > 0 && canDeleteInstance && (
  <BulkActionBar
    selectedCount={selectedIds.size}
    totalCount={filteredInstances.length}
    onSelectAll={handleSelectAll}
    onClearSelection={handleClearSelection}
    actions={[
      canEditInstance && {
        label: 'Mover para Projeto',
        icon: <Folder className="h-4 w-4 mr-2" />,
        variant: 'secondary',
        onClick: handleBulkMove,
      },
      canDeleteInstance && {
        label: 'Excluir',
        icon: <Trash2 className="h-4 w-4 mr-2" />,
        variant: 'destructive',
        onClick: handleBulkDelete,
      },
    ].filter(Boolean)}
  />
)}
```

---

### **Correção 2: Simplificar Tabela**

**Arquivo:** `src/app/integracoes/page.tsx`

**Mudanças:**

```tsx
// Linha 247-256: Reduzir colunas
<TableHeader>
  <TableRow>
    <TableHead className="w-12">
      <Checkbox
        checked={selectedIds.size === filteredInstances.length && filteredInstances.length > 0}
        onCheckedChange={(checked) => {
          if (checked) handleSelectAll()
          else handleClearSelection()
        }}
        aria-label="Selecionar todas integrações"
      />
    </TableHead>
    <TableHead>Nome</TableHead>
    <TableHead>Telefone</TableHead>
    <TableHead>Status</TableHead>
    <TableHead>Atualizado há</TableHead>
    <TableHead className="text-right">Ações</TableHead>
  </TableRow>
</TableHeader>

// Linha 259-326: Simplificar células
<TableRow key={instance.id}>
  <TableCell>
    <Checkbox
      checked={selectedIds.has(instance.id)}
      onCheckedChange={() => handleToggleSelect(instance.id)}
      aria-label={`Selecionar ${instance.name}`}
    />
  </TableCell>
  <TableCell className="font-medium">{instance.name}</TableCell>
  <TableCell>{instance.phoneNumber || '-'}</TableCell>
  <TableCell>
    <Badge variant={instance.status === 'connected' ? 'default' : 'secondary'}>
      {instance.status === 'connected' ? (
        <>
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Conectado
        </>
      ) : (
        <>
          <XCircle className="h-3 w-3 mr-1" />
          Desconectado
        </>
      )}
    </Badge>
  </TableCell>
  <TableCell>
    {formatDistanceToNow(new Date(instance.updatedAt), {
      addSuffix: true,
      locale: ptBR,
    })}
  </TableCell>
  <TableCell className="text-right">
    {/* Dropdown já corrigido acima */}
  </TableCell>
</TableRow>
```

---

### **Correção 3: Remover Dados Fake do Dashboard**

**Arquivo:** `src/app/integracoes/dashboard/page.tsx`

**Mudanças:**

```tsx
// Linha 291-345: Remover ou condicionar gráficos
{/* Gráficos - Comentar até ter dados reais */}
{/*
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
  <LineChart ... />
  <BarChart ... />
</div>
*/}

// OU mostrar placeholder
{instances.length > 0 ? (
  <Card className="mt-6">
    <CardHeader>
      <CardTitle>📊 Métricas em Desenvolvimento</CardTitle>
    </CardHeader>
    <CardContent>
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Recurso em Desenvolvimento</AlertTitle>
        <AlertDescription>
          Gráficos de métricas estarão disponíveis em breve.
          Continue usando suas integrações normalmente.
        </AlertDescription>
      </Alert>
    </CardContent>
  </Card>
) : null}
```

---

### **Correção 4: Loading States em Modais**

**Arquivo:** `src/components/whatsapp/create-instance-modal.tsx` (exemplo)

**Padrão a seguir em TODOS os modais:**

```tsx
import { Loader2 } from 'lucide-react'

// No componente
const [isSubmitting, setIsSubmitting] = useState(false)

const handleSubmit = async () => {
  setIsSubmitting(true)
  try {
    // ... código de submit
    await createInstance(data)
    onSuccess()
  } catch (error) {
    // ... error handling
  } finally {
    setIsSubmitting(false)
  }
}

// No botão de submit
<Button
  type="submit"
  disabled={isSubmitting}
>
  {isSubmitting ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Criando...
    </>
  ) : (
    'Criar Integração'
  )}
</Button>
```

---

## 🎨 COMPONENTES CUSTOM A CRIAR

### **StatusBadge Component**

**Arquivo:** `src/components/custom/status-badge.tsx`

```tsx
import { Badge } from '@/components/ui/badge'
import { Circle, CircleOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'connecting'
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = {
    connected: {
      label: 'Conectado',
      icon: Circle,
      variant: 'default' as const,
      iconClassName: 'fill-current',
    },
    disconnected: {
      label: 'Desconectado',
      icon: CircleOff,
      variant: 'secondary' as const,
      iconClassName: '',
    },
    connecting: {
      label: 'Conectando',
      icon: Loader2,
      variant: 'outline' as const,
      iconClassName: 'animate-spin',
    },
  }

  const { label, icon: Icon, variant, iconClassName } = config[status]

  return (
    <Badge variant={variant} className={cn('gap-1', className)}>
      <Icon className={cn('h-3 w-3', iconClassName)} />
      <span>{label}</span>
    </Badge>
  )
}
```

---

### **EmptyState Component**

**Arquivo:** `src/components/custom/empty-state.tsx`

```tsx
import { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="text-muted-foreground mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">{description}</p>
      {action}
    </div>
  )
}
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Sprint 1 - CRÍTICO (hoje)
- [ ] Aplicar proteção de permissões em `/integracoes`
- [ ] Adicionar botão "Nova Integração" no header
- [ ] Simplificar tabela (10→6 colunas)
- [ ] Remover dados fake do dashboard
- [ ] Adicionar loading states em todos modais

### Sprint 2 - IMPORTANTE (amanhã)
- [ ] Criar componentes custom (StatusBadge, EmptyState)
- [ ] Melhorar empty states contextualizados
- [ ] Unificar nomenclatura
- [ ] Implementar confirmações visuais (AlertDialog)
- [ ] Toasts informativos

### Sprint 3 - MELHORIAS (próxima semana)
- [ ] Acessibilidade (aria-labels, focus trap, keyboard)
- [ ] Performance (debounce, staleTime)
- [ ] Versão mobile (cards, sidebar, modals)

---

## 📝 GAPS DA ARQUITETURA UX AINDA NÃO IMPLEMENTADOS

Comparando com `ARQUITETURA_UX_DEFINITIVA.md`:

### Design System
- [ ] Arquivo `design-tokens.css` não existe
- [ ] Paleta de cores OKLCH definida mas não aplicada globalmente
- [ ] Animações definidas mas não implementadas

### Componentes Custom Faltantes
- [ ] `StatusBadge` ✅ (criar agora)
- [ ] `EmptyState` ✅ (criar agora)
- [ ] `PageHeader` (opcional por enquanto)
- [ ] `StatCard` (para dashboards)
- [ ] `ActivityTimeline` (baixa prioridade)
- [ ] `OrgSelector` (só para admin)
- [ ] `QRCodeDisplay` com timer

### Páginas Admin
- [ ] Dashboard admin vazio - falta quick actions, alertas, atividade
- [ ] `/admin/organizations` - falta bulk actions, filtros
- [ ] `/admin/organizations/:id` - não existe (página dedicada)
- [ ] `/admin/sistema` - não existe (config, permissões, logs)

### Páginas Master/Manager
- [ ] Dashboard da org - parcial
- [ ] `/integracoes/:id/settings` - não existe (página dedicada)
- [ ] Projetos - não implementado
- [ ] Equipe - não implementado

### Páginas User
- [ ] Integrações - existe mas sem diferenciação visual
- [ ] Modal QR simplificado - existe mas pode melhorar

---

## 🚀 PRÓXIMOS PASSOS

1. **AGORA:** Implementar Sprint 1 (crítico) - 2-3 horas
2. **HOJE:** Testar com todos os 6 usuários
3. **AMANHÃ:** Sprint 2 (importante) - 3-4 horas
4. **PRÓXIMA SEMANA:** Sprint 3 (melhorias) - 4-5 horas
5. **FUTURO:** Implementar gaps da arquitetura UX (páginas admin, componentes)

---

**STATUS:** Pronto para começar implementação 🚀
