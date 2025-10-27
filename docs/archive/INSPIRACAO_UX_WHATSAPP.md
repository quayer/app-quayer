# 🎨 INSPIRAÇÃO UX - WhatsApp Conversations

**Fonte:** Screenshot da interface de conversas do WhatsApp Web
**Data de Análise:** 04/10/2025
**Aplicação:** Melhorias para /integracoes e /messages

---

## 📊 PADRÕES IDENTIFICADOS

### 1. **Layout de 2 Colunas (Sidebar + Main)**

#### WhatsApp
```
┌─────────────────┬──────────────────────────────┐
│                 │                              │
│   Conversations │    Choose a contact to       │
│   List          │    view the full chat        │
│   (Sidebar)     │    (Empty State)             │
│                 │                              │
└─────────────────┴──────────────────────────────┘
```

#### Aplicar em `/integracoes`
```typescript
// Estrutura sugerida
<div className="flex h-screen">
  {/* Sidebar - Lista de Instâncias */}
  <aside className="w-80 border-r">
    <InstancesList />
  </aside>

  {/* Main - Detalhes da Instância Selecionada */}
  <main className="flex-1">
    <InstanceDetails />
  </main>
</div>
```

**Benefícios:**
- ✅ Navegação mais rápida entre instâncias
- ✅ Não precisa abrir modal para ver detalhes
- ✅ Contexto sempre visível (lista + detalhes)

---

### 2. **Busca Permanente no Topo**

#### WhatsApp
- 🔍 Barra de busca sempre visível no topo
- Placeholder: "Search..."
- Ícone de lupa à esquerda
- Não colapsa ou esconde

#### Aplicar em `/integracoes`
```tsx
// Busca destacada no topo
<div className="sticky top-0 z-10 bg-background border-b p-4">
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input
      placeholder="Buscar instâncias, números..."
      className="pl-10"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
    />
  </div>
</div>
```

**Benefícios:**
- ✅ Acesso imediato à busca
- ✅ UX familiar (padrão WhatsApp)
- ✅ Sticky position mantém busca visível ao rolar

---

### 3. **Filtros por Status com Badges**

#### WhatsApp
```
┌──────────────────────────────────────┐
│ [Queue 2] [On Hold 0] [In Service 0] │
└──────────────────────────────────────┘
```

#### Aplicar em `/integracoes`
```tsx
// Filtros rápidos com contadores
<div className="flex gap-2 p-4 border-b">
  <Badge
    variant={filter === 'all' ? 'default' : 'outline'}
    className="cursor-pointer"
    onClick={() => setFilter('all')}
  >
    Todas ({stats.total})
  </Badge>

  <Badge
    variant={filter === 'connected' ? 'default' : 'outline'}
    className="cursor-pointer"
    onClick={() => setFilter('connected')}
  >
    Conectadas ({stats.connected})
  </Badge>

  <Badge
    variant={filter === 'disconnected' ? 'destructive' : 'outline'}
    className="cursor-pointer"
    onClick={() => setFilter('disconnected')}
  >
    Desconectadas ({stats.disconnected})
  </Badge>
</div>
```

**Benefícios:**
- ✅ Filtros visuais e rápidos
- ✅ Contadores mostram distribuição
- ✅ Fácil identificação de problemas (desconectadas em vermelho)

---

### 4. **Lista com Preview (Card Compacto)**

#### WhatsApp - Estrutura do Card de Conversa
```
┌─────────────────────────────────────┐
│ [Avatar] Paulo Vitor    [Badge]  ● │
│          Criar slugar   [Time] 1    │
│          crie outra igual            │
└─────────────────────────────────────┘
```

**Elementos:**
- Avatar/Ícone à esquerda
- Nome em destaque (bold)
- Preview da última mensagem (cinza)
- Badge de status (amarelo: "Ouier slugar")
- Contador de mensagens não lidas (verde: 1)
- Indicador de atenção (⚠️ ícone laranja)

#### Aplicar em `/integracoes`
```tsx
// Card de Instância na Lista
<div className="flex items-center gap-3 p-3 hover:bg-accent cursor-pointer border-b">
  {/* Avatar */}
  <Avatar>
    <AvatarFallback className="bg-green-500">
      <Phone className="h-4 w-4 text-white" />
    </AvatarFallback>
  </Avatar>

  {/* Informações */}
  <div className="flex-1 min-w-0">
    <div className="flex items-center justify-between">
      <p className="font-semibold truncate">{instance.name}</p>
      <StatusBadge status={instance.status} size="sm" />
    </div>

    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground truncate">
        {instance.phoneNumber || 'Não configurado'}
      </p>
      {instance.status === 'disconnected' && (
        <Badge variant="destructive" className="h-5 w-5 rounded-full p-0 flex items-center justify-center">
          !
        </Badge>
      )}
    </div>
  </div>
</div>
```

**Benefícios:**
- ✅ Preview rápido de informações
- ✅ Alertas visuais para problemas
- ✅ Navegação por hover
- ✅ Densidade de informação otimizada

---

### 5. **Estado Vazio Centralizado e Contextual**

#### WhatsApp
```
        ┌─────────────────────┐
        │        💬           │
        │                     │
        │  Choose a contact   │
        │  to view the full   │
        │       chat          │
        └─────────────────────┘
```

**Características:**
- Centralizado vertical e horizontalmente
- Ícone grande e simples
- Mensagem clara e curta
- Fundo neutro

#### Aplicar em `/integracoes`
```tsx
// Estado vazio quando nenhuma instância selecionada
{!selectedInstance ? (
  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
    <div className="rounded-full bg-muted p-6 mb-4">
      <Phone className="h-12 w-12 text-muted-foreground" />
    </div>
    <h3 className="font-semibold text-lg mb-2">
      Selecione uma instância
    </h3>
    <p className="text-muted-foreground max-w-sm">
      Escolha uma instância na lista para ver detalhes, gerenciar conexão e enviar mensagens
    </p>
  </div>
) : (
  <InstanceDetailsPanel instance={selectedInstance} />
)}
```

**Benefícios:**
- ✅ Guia o usuário sobre o que fazer
- ✅ Não sobrecarrega com informações
- ✅ Design limpo e profissional

---

### 6. **Indicadores de Status em Tempo Real**

#### WhatsApp - Indicadores Observados
- 🟢 **Badge verde (1)**: Mensagens não lidas
- ⚠️ **Ícone laranja**: Alerta/atenção
- 🟡 **Badge amarelo**: "Ouier slugar" (status customizado)
- ⏰ **Timestamp**: "ontem"

#### Aplicar em `/integracoes`
```tsx
// Sistema de indicadores visuais
<div className="flex items-center gap-2">
  {/* Status de Conexão */}
  <StatusBadge status={instance.status} />

  {/* Alertas */}
  {instance.status === 'disconnected' && (
    <Badge variant="destructive" className="gap-1">
      <AlertCircle className="h-3 w-3" />
      Reconectar
    </Badge>
  )}

  {/* Mensagens pendentes (futuro) */}
  {instance.pendingMessages > 0 && (
    <Badge variant="default" className="rounded-full">
      {instance.pendingMessages}
    </Badge>
  )}

  {/* Última atividade */}
  <span className="text-xs text-muted-foreground">
    {formatDistanceToNow(new Date(instance.updatedAt), {
      addSuffix: true,
      locale: ptBR
    })}
  </span>
</div>
```

**Benefícios:**
- ✅ Informação de status em tempo real
- ✅ Alertas visuais destacados
- ✅ Contexto temporal (última atividade)

---

### 7. **Navegação por Tabs/Filtros Superiores**

#### WhatsApp - Filtros Superiores
```
[All] [Responded] [Not responded]
```

#### Aplicar em `/integracoes`
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

<Tabs defaultValue="all" onValueChange={setFilter}>
  <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
    <TabsTrigger value="all" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
      Todas ({stats.total})
    </TabsTrigger>
    <TabsTrigger value="connected" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
      Conectadas ({stats.connected})
    </TabsTrigger>
    <TabsTrigger value="disconnected" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
      Desconectadas ({stats.disconnected})
    </TabsTrigger>
  </TabsList>

  <TabsContent value="all">
    <InstancesList instances={filteredInstances} />
  </TabsContent>

  {/* ... outros TabsContent ... */}
</Tabs>
```

**Benefícios:**
- ✅ Navegação familiar (padrão WhatsApp)
- ✅ Filtros visuais e acessíveis
- ✅ Contadores informativos

---

### 8. **Actions Menu (Three Dots)**

#### WhatsApp - Menu de Ações
```
[⋮] → Dropdown com ações contextuais
```

#### Aplicar em `/integracoes`
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-8 w-8">
      <MoreVertical className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>

  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => handleConnect(instance)}>
      <Plug className="mr-2 h-4 w-4" />
      Conectar
    </DropdownMenuItem>

    <DropdownMenuItem onClick={() => handleEdit(instance)}>
      <Edit className="mr-2 h-4 w-4" />
      Editar
    </DropdownMenuItem>

    <DropdownMenuItem onClick={() => handleShare(instance)}>
      <Share2 className="mr-2 h-4 w-4" />
      Compartilhar
    </DropdownMenuItem>

    <DropdownMenuSeparator />

    <DropdownMenuItem
      className="text-destructive"
      onClick={() => handleDelete(instance)}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Deletar
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**Benefícios:**
- ✅ Economia de espaço
- ✅ Ações contextuais agrupadas
- ✅ Ações destrutivas separadas (cor vermelha)

---

## 🎯 IMPLEMENTAÇÃO PRIORITÁRIA

### 1. **Layout de 2 Colunas** (Alta Prioridade)
**Impacto:** Transformaria completamente a experiência
**Esforço:** Médio
**Arquivos:** `src/app/integracoes/page.tsx`

### 2. **Cards de Preview** (Alta Prioridade)
**Impacto:** Melhora escaneabilidade da lista
**Esforço:** Baixo
**Arquivos:** `src/app/integracoes/page.tsx`

### 3. **Filtros por Tabs** (Média Prioridade)
**Impacto:** Navegação mais intuitiva
**Esforço:** Baixo
**Arquivos:** `src/app/integracoes/page.tsx`

### 4. **Estado Vazio Melhorado** (Baixa Prioridade)
**Impacto:** Experiência inicial mais clara
**Esforço:** Muito Baixo
**Arquivos:** `src/components/custom/empty-state.tsx`

---

## 📝 CÓDIGO COMPLETO SUGERIDO

### Novo Layout `/integracoes` (2 Colunas)

```tsx
'use client'

import { useState } from 'react'
import { Plus, Search, Phone, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/custom/status-badge'
import { useInstances } from '@/hooks/useInstance'
import { usePermissions } from '@/hooks/usePermissions'
import type { Instance } from '@prisma/client'

export default function IntegracoesPage() {
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'connected' | 'disconnected'>('all')

  const { data: instancesData, isLoading } = useInstances()
  const { canCreateInstance } = usePermissions()

  const instances = instancesData?.data || []

  // Calcular stats
  const stats = {
    total: instances.length,
    connected: instances.filter(i => i.status === 'connected').length,
    disconnected: instances.filter(i => i.status === 'disconnected').length,
  }

  // Filtrar
  const filteredInstances = instances
    .filter(i => {
      if (filter === 'connected') return i.status === 'connected'
      if (filter === 'disconnected') return i.status === 'disconnected'
      return true
    })
    .filter(i =>
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.phoneNumber?.toLowerCase().includes(searchTerm.toLowerCase())
    )

  return (
    <div className="flex h-screen">
      {/* Sidebar - Lista de Instâncias */}
      <aside className="w-80 border-r flex flex-col">
        {/* Header com Busca */}
        <div className="p-4 border-b space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Conversações</h2>
            {canCreateInstance && (
              <Button size="icon" variant="ghost">
                <Plus className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Tabs de Filtro */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="w-full justify-start h-auto p-0 bg-transparent">
              <TabsTrigger value="all" className="data-[state=active]:bg-accent">
                Todas
              </TabsTrigger>
              <TabsTrigger value="connected" className="data-[state=active]:bg-accent">
                Conectadas ({stats.connected})
              </TabsTrigger>
              <TabsTrigger value="disconnected" className="data-[state=active]:bg-accent">
                Desconectadas ({stats.disconnected})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Lista de Instâncias */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4">Carregando...</div>
          ) : filteredInstances.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Nenhuma instância encontrada
            </div>
          ) : (
            filteredInstances.map(instance => (
              <div
                key={instance.id}
                className={`
                  flex items-center gap-3 p-3 cursor-pointer border-b
                  hover:bg-accent transition-colors
                  ${selectedInstance?.id === instance.id ? 'bg-accent' : ''}
                `}
                onClick={() => setSelectedInstance(instance)}
              >
                {/* Avatar */}
                <Avatar className="h-12 w-12">
                  <AvatarFallback className={
                    instance.status === 'connected'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-500 text-white'
                  }>
                    <Phone className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-semibold truncate">{instance.name}</p>
                    <StatusBadge status={instance.status} size="sm" />
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground truncate">
                      {instance.phoneNumber || 'Não configurado'}
                    </p>
                    {instance.status === 'disconnected' && (
                      <span className="text-xs text-destructive font-medium">
                        !
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* End of list */}
        <div className="p-2 text-center text-xs text-muted-foreground border-t">
          End of list
        </div>
      </aside>

      {/* Main - Detalhes da Instância */}
      <main className="flex-1 flex flex-col">
        {!selectedInstance ? (
          // Empty State
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full bg-muted p-8 mb-4">
              <Phone className="h-16 w-16 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-xl mb-2">
              Escolha um contato para ver o chat completo
            </h3>
            <p className="text-muted-foreground max-w-md">
              Selecione uma instância na lista para gerenciar conexão,
              ver detalhes e enviar mensagens
            </p>
          </div>
        ) : (
          // Detalhes da Instância Selecionada
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="border-b p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-green-500 text-white">
                    <Phone className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{selectedInstance.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedInstance.phoneNumber || 'Não configurado'}
                  </p>
                </div>
              </div>

              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>

            {/* Content - Pode ser mensagens, detalhes, etc */}
            <div className="flex-1 p-6">
              <p className="text-muted-foreground">
                Conteúdo da instância selecionada aqui...
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
```

---

## ✅ PRÓXIMOS PASSOS

### Sprint 2 - Melhorias de UX Inspiradas no WhatsApp

1. **Implementar layout de 2 colunas** em `/integracoes`
2. **Redesenhar cards da lista** com preview compacto
3. **Adicionar filtros por tabs** (All, Connected, Disconnected)
4. **Melhorar empty state** centralizado
5. **Criar página de mensagens** com layout similar

---

**Documento criado em:** 04/10/2025
**Baseado em:** Screenshot WhatsApp Web Conversations
**Aplicação:** Quayer - WhatsApp Multi-Instância Platform
