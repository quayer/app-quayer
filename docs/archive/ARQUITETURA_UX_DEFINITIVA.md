# 🎨 Arquitetura UX Definitiva - app-quayer v2.0

## 📐 Design System & Componentes

---

## 🎨 1. PALETA DE CORES & DESIGN TOKENS

### Cores Base (Dark Theme)
```css
/* Backgrounds - Hierarquia Visual */
--bg-app: #0a0a0a;           /* Background principal da aplicação */
--bg-primary: #141414;        /* Cards, containers principais */
--bg-secondary: #1a1a1a;      /* Hover states, áreas secundárias */
--bg-tertiary: #242424;       /* Elementos em destaque */
--bg-elevated: #2a2a2a;       /* Modals, popovers (elevação) */

/* WhatsApp Brand */
--whatsapp-primary: #25d366;  /* Verde WhatsApp */
--whatsapp-dark: #128c7e;     /* Verde escuro */
--whatsapp-light: #dcf8c6;    /* Verde claro (backgrounds) */

/* Status Colors */
--status-success: #10b981;    /* Conectado, Sucesso */
--status-success-bg: #10b98115; /* Background success */

--status-warning: #f59e0b;    /* Conectando, Atenção */
--status-warning-bg: #f59e0b15;

--status-error: #ef4444;      /* Desconectado, Erro */
--status-error-bg: #ef444415;

--status-info: #3b82f6;       /* Informativo */
--status-info-bg: #3b82f615;

/* Text Colors */
--text-primary: #fafafa;      /* Títulos, texto principal */
--text-secondary: #a3a3a3;    /* Subtítulos, metadados */
--text-tertiary: #737373;     /* Placeholders, disabled */
--text-inverse: #0a0a0a;      /* Texto sobre fundos claros */

/* Border Colors */
--border-primary: #2a2a2a;    /* Borders padrão */
--border-secondary: #1a1a1a;  /* Borders sutis */
--border-focus: #3b82f6;      /* Focus state */
--border-error: #ef4444;      /* Validation error */

/* Accent Colors (Ações) */
--accent-primary: #3b82f6;    /* Azul - Ação principal */
--accent-secondary: #8b5cf6;  /* Roxo - Ação secundária */
--accent-danger: #ef4444;     /* Vermelho - Ações destrutivas */

/* Shadows - Elevação */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
--shadow-md: 0 4px 6px rgba(0,0,0,0.4);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.5);
--shadow-xl: 0 20px 25px rgba(0,0,0,0.6);

/* Animations */
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 350ms;
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### Mapeamento de Cores por Contexto

**Botões:**
```css
/* Primary Button */
background: var(--accent-primary);
color: var(--text-inverse);
hover: brightness(1.1);

/* Secondary Button */
background: var(--bg-secondary);
color: var(--text-primary);
border: 1px solid var(--border-primary);

/* Danger Button */
background: var(--accent-danger);
color: var(--text-inverse);
```

**Status Badges:**
```css
/* Conectado */
.badge-success {
  background: var(--status-success-bg);
  color: var(--status-success);
  border: 1px solid var(--status-success);
}

/* Desconectado */
.badge-error {
  background: var(--status-error-bg);
  color: var(--status-error);
  border: 1px solid var(--status-error);
}

/* Conectando */
.badge-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning);
  border: 1px solid var(--status-warning);
  animation: pulse 2s infinite;
}
```

---

## 🧩 2. COMPONENTES SHADCN/UI POR PÁGINA

### Biblioteca Base Instalada
```bash
# Componentes já instalados
✅ Button
✅ Card
✅ Dialog (Modal)
✅ DropdownMenu
✅ Form
✅ Input
✅ Label
✅ Select
✅ Table
✅ Tabs
✅ Badge
✅ Avatar
✅ Skeleton
✅ Alert
✅ Sheet (Sidebar mobile)
✅ Command (Search)
✅ Popover
✅ Separator
✅ Switch
✅ Checkbox
✅ Breadcrumb
✅ Toast (Sonner)
```

### Componentes Customizados a Criar
```typescript
src/components/custom/
├── status-badge.tsx          // Badge de status com cores automáticas
├── instance-card.tsx          // Card de instância WhatsApp
├── project-card.tsx           // Card de projeto
├── org-selector.tsx           // Dropdown de seleção de org (Admin)
├── stat-card.tsx              // Card de estatística com ícone
├── empty-state.tsx            // Estado vazio com ilustração
├── qr-code-display.tsx        // Display de QR Code com timer
├── activity-timeline.tsx      // Timeline de atividades
├── bulk-action-bar.tsx        // Barra de ações em massa
├── filter-bar.tsx             // Barra de filtros avançados
└── page-header.tsx            // Header de página com breadcrumbs
```

---

## 📄 3. ARQUITETURA DE PÁGINAS DETALHADA

---

### 🔧 ADMIN

#### `/admin` - Dashboard

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ <PageHeader>                                             │
│   <Breadcrumb> Dashboard </Breadcrumb>                   │
│   <h1> Visão Geral do Sistema </h1>                      │
│ </PageHeader>                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"> │
│                                                          │
│   <!-- Quick Actions -->                                │
│   <Card>                                                 │
│     <CardHeader>                                         │
│       <CardTitle>🚀 Ações Rápidas</CardTitle>          │
│     </CardHeader>                                        │
│     <CardContent>                                        │
│       <Button>+ Criar Organização</Button>              │
│       <Button variant="outline">Ver Alertas (3)</Button>│
│     </CardContent>                                       │
│   </Card>                                                │
│                                                          │
│   <!-- Métricas -->                                     │
│   <div className="grid grid-cols-3 gap-4">              │
│     <StatCard                                            │
│       icon={<Building />}                               │
│       value="45"                                         │
│       label="Organizações"                              │
│       trend="+12% vs mês anterior"                      │
│       trendUp={true}                                     │
│     />                                                   │
│     <StatCard ... />                                     │
│     <StatCard ... />                                     │
│   </div>                                                 │
│                                                          │
│   <!-- Alertas Críticos -->                            │
│   <Card>                                                 │
│     <CardHeader>                                         │
│       <CardTitle>⚠️ Alertas Críticos</CardTitle>        │
│     </CardHeader>                                        │
│     <CardContent>                                        │
│       <Alert variant="warning">                         │
│         <AlertTitle>3 orgs próximas do limite</AlertTitle>│
│         <AlertDescription>                              │
│           <Button size="sm">Ver Organizações</Button>   │
│         </AlertDescription>                              │
│       </Alert>                                           │
│     </CardContent>                                       │
│   </Card>                                                │
│                                                          │
│   <!-- Atividades Recentes -->                         │
│   <Card>                                                 │
│     <CardHeader>                                         │
│       <CardTitle>🕐 Atividades Recentes</CardTitle>     │
│     </CardHeader>                                        │
│     <CardContent>                                        │
│       <ActivityTimeline                                  │
│         items={[                                         │
│           {                                              │
│             time: "2 min atrás",                        │
│             action: "Empresa ABC criou 2 instâncias",   │
│             user: "João Silva",                         │
│             type: "create"                              │
│           },                                             │
│           ...                                            │
│         ]}                                               │
│       />                                                 │
│     </CardContent>                                       │
│   </Card>                                                │
│                                                          │
│   <!-- Gráfico de Crescimento -->                      │
│   <Card className="lg:col-span-2">                      │
│     <CardHeader>                                         │
│       <CardTitle>📈 Crescimento (7 dias)</CardTitle>    │
│     </CardHeader>                                        │
│     <CardContent>                                        │
│       <LineChart data={...} />                          │
│     </CardContent>                                       │
│   </Card>                                                │
│                                                          │
│ </div>                                                   │
└──────────────────────────────────────────────────────────┘
```

**Componentes shadcn:**
- `Card`, `CardHeader`, `CardTitle`, `CardContent`
- `Button` (variants: default, outline)
- `Alert`, `AlertTitle`, `AlertDescription`
- `Breadcrumb`

**Componentes Custom:**
- `PageHeader`
- `StatCard`
- `ActivityTimeline`

**Cores:**
- Background: `var(--bg-app)`
- Cards: `var(--bg-primary)`
- Alertas warning: `var(--status-warning-bg)`
- Textos: `var(--text-primary)`, `var(--text-secondary)`

**Animações:**
```css
/* Cards aparecem com fade + slide */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.card {
  animation: fadeInUp var(--duration-normal) var(--ease-in-out);
}

/* Stat cards com delay escalonado */
.stat-card:nth-child(1) { animation-delay: 0ms; }
.stat-card:nth-child(2) { animation-delay: 100ms; }
.stat-card:nth-child(3) { animation-delay: 200ms; }
```

---

#### `/admin/organizations` - Organizações

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ <PageHeader>                                             │
│   <Breadcrumb> Dashboard > Organizações </Breadcrumb>    │
│   <h1> Organizações </h1>                                │
│   <Button>+ Nova Organização</Button>                    │
│ </PageHeader>                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ <FilterBar>                                              │
│   <Input placeholder="🔍 Buscar organização..." />      │
│   <Select placeholder="Status">                          │
│     <SelectItem>Ativas</SelectItem>                     │
│     <SelectItem>Inativas</SelectItem>                   │
│     <SelectItem>Todas</SelectItem>                      │
│   </Select>                                              │
│   <Select placeholder="Ordenar por">                     │
│     <SelectItem>Mais recentes</SelectItem>              │
│     <SelectItem>Nome A-Z</SelectItem>                   │
│   </Select>                                              │
│ </FilterBar>                                             │
│                                                          │
│ <!-- Bulk Actions (aparece quando tem seleção) -->      │
│ <BulkActionBar selectedCount={3}>                        │
│   <Button variant="outline">Desativar</Button>          │
│   <Button variant="destructive">Deletar</Button>        │
│ </BulkActionBar>                                         │
│                                                          │
│ <Table>                                                  │
│   <TableHeader>                                          │
│     <TableRow>                                           │
│       <TableHead><Checkbox /></TableHead>               │
│       <TableHead>Nome</TableHead>                       │
│       <TableHead>Tipo</TableHead>                       │
│       <TableHead>Instâncias</TableHead>                 │
│       <TableHead>Usuários</TableHead>                   │
│       <TableHead>Status</TableHead>                     │
│       <TableHead>Ações</TableHead>                      │
│     </TableRow>                                          │
│   </TableHeader>                                         │
│   <TableBody>                                            │
│     <TableRow>                                           │
│       <TableCell><Checkbox /></TableCell>               │
│       <TableCell>                                        │
│         <div>Empresa ABC Ltda</div>                     │
│         <div className="text-sm text-muted">            │
│           CNPJ: 12.345.678/0001-99                      │
│         </div>                                           │
│       </TableCell>                                       │
│       <TableCell><Badge>PJ</Badge></TableCell>          │
│       <TableCell>5/20</TableCell>                       │
│       <TableCell>12/50</TableCell>                      │
│       <TableCell>                                        │
│         <StatusBadge status="active" />                 │
│       </TableCell>                                       │
│       <TableCell>                                        │
│         <DropdownMenu>                                   │
│           <DropdownMenuTrigger>                         │
│             <Button variant="ghost" size="icon">        │
│               <MoreVertical />                          │
│             </Button>                                    │
│           </DropdownMenuTrigger>                         │
│           <DropdownMenuContent>                         │
│             <DropdownMenuItem>                          │
│               <Eye /> Ver Detalhes                      │
│             </DropdownMenuItem>                          │
│             <DropdownMenuItem>                          │
│               <Edit /> Editar                           │
│             </DropdownMenuItem>                          │
│             <DropdownMenuSeparator />                   │
│             <DropdownMenuItem className="text-red-500"> │
│               <Trash /> Deletar                         │
│             </DropdownMenuItem>                          │
│           </DropdownMenuContent>                         │
│         </DropdownMenu>                                  │
│       </TableCell>                                       │
│     </TableRow>                                          │
│   </TableBody>                                           │
│ </Table>                                                 │
│                                                          │
│ <Pagination>                                             │
│   <PaginationContent>                                    │
│     <PaginationPrevious />                              │
│     <PaginationItem>1</PaginationItem>                  │
│     <PaginationItem>2</PaginationItem>                  │
│     <PaginationNext />                                   │
│   </PaginationContent>                                   │
│ </Pagination>                                            │
└──────────────────────────────────────────────────────────┘
```

**Modal: Criar Organização**
```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>+ Criar Nova Organização</DialogTitle>
      <DialogDescription>
        Preencha os dados para criar uma nova organização
      </DialogDescription>
    </DialogHeader>

    <Form>
      <FormField name="type">
        <FormLabel>Tipo *</FormLabel>
        <RadioGroup defaultValue="pj">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="pf" id="pf" />
            <Label htmlFor="pf">Pessoa Física</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="pj" id="pj" />
            <Label htmlFor="pj">Pessoa Jurídica</Label>
          </div>
        </RadioGroup>
      </FormField>

      <FormField name="name">
        <FormLabel>Nome/Razão Social *</FormLabel>
        <Input placeholder="Ex: Empresa ABC Ltda" />
      </FormField>

      <FormField name="document">
        <FormLabel>CPF/CNPJ *</FormLabel>
        <Input placeholder="00.000.000/0000-00" />
      </FormField>

      <FormField name="email">
        <FormLabel>Email *</FormLabel>
        <Input type="email" placeholder="contato@empresa.com" />
      </FormField>

      <FormField name="maxInstances">
        <FormLabel>Limite de Instâncias</FormLabel>
        <Input type="number" defaultValue={1} />
      </FormField>
    </Form>

    <DialogFooter>
      <Button variant="outline" onClick={() => setIsOpen(false)}>
        Cancelar
      </Button>
      <Button type="submit">
        Criar Organização
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Componentes shadcn:**
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`
- `DropdownMenu`, `DropdownMenuItem`
- `Input`, `Select`, `Checkbox`, `RadioGroup`
- `Badge`, `Button`, `Pagination`

**Componentes Custom:**
- `PageHeader`
- `FilterBar`
- `BulkActionBar`
- `StatusBadge`

**Cores:**
- Background tabela: `var(--bg-primary)`
- Hover linha: `var(--bg-secondary)`
- Badge PJ: `var(--accent-primary)` bg
- Status ativo: `var(--status-success)`
- Delete: `var(--accent-danger)`

**Animações:**
```css
/* Hover na linha da tabela */
.table-row {
  transition: background-color var(--duration-fast);
}
.table-row:hover {
  background-color: var(--bg-secondary);
}

/* Dropdown menu aparece com slide */
.dropdown-content {
  animation: slideDown var(--duration-normal) var(--ease-in-out);
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

---

#### `/admin/organizations/:id` - Detalhes da Organização

**Página (NÃO modal):**
```
┌──────────────────────────────────────────────────────────┐
│ <PageHeader>                                             │
│   <Breadcrumb>                                           │
│     Dashboard > Organizações > Empresa ABC              │
│   </Breadcrumb>                                          │
│   <div className="flex items-center gap-4">             │
│     <Avatar>                                             │
│       <AvatarImage src="/org-logo.png" />               │
│       <AvatarFallback>EA</AvatarFallback>               │
│     </Avatar>                                            │
│     <div>                                                │
│       <h1>Empresa ABC Ltda</h1>                         │
│       <p className="text-muted">CNPJ: 12.345.678/0001-99</p>│
│     </div>                                               │
│   </div>                                                 │
│   <div className="ml-auto flex gap-2">                  │
│     <Button variant="outline">                          │
│       <Edit /> Editar                                   │
│     </Button>                                            │
│     <Button variant="destructive">                      │
│       <Trash /> Deletar                                 │
│     </Button>                                            │
│   </div>                                                 │
│ </PageHeader>                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ <Tabs defaultValue="overview">                          │
│   <TabsList>                                             │
│     <TabsTrigger value="overview">Visão Geral</TabsTrigger>│
│     <TabsTrigger value="instances">Instâncias (5)</TabsTrigger>│
│     <TabsTrigger value="users">Usuários (12)</TabsTrigger>│
│     <TabsTrigger value="activity">Atividade</TabsTrigger>│
│   </TabsList>                                            │
│                                                          │
│   <TabsContent value="overview">                        │
│     <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">│
│       <StatCard                                          │
│         icon={<Smartphone />}                           │
│         value="5"                                        │
│         label="Instâncias Ativas"                       │
│         sublabel="de 20 permitidas"                     │
│       />                                                 │
│       <StatCard ... />                                   │
│       <StatCard ... />                                   │
│     </div>                                               │
│                                                          │
│     <Card className="mt-6">                             │
│       <CardHeader>                                       │
│         <CardTitle>📊 Estatísticas (7 dias)</CardTitle> │
│       </CardHeader>                                      │
│       <CardContent>                                      │
│         <BarChart data={...} />                         │
│       </CardContent>                                     │
│     </Card>                                              │
│   </TabsContent>                                         │
│                                                          │
│   <TabsContent value="instances">                       │
│     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">│
│       <InstanceCard                                      │
│         name="Vendas 1"                                  │
│         phone="+55 11 99999-9999"                       │
│         status="connected"                               │
│         project="Vendas SP"                             │
│       />                                                 │
│       ...                                                │
│     </div>                                               │
│   </TabsContent>                                         │
│                                                          │
│   <TabsContent value="users">                           │
│     <Table>...</Table>                                   │
│   </TabsContent>                                         │
│                                                          │
│   <TabsContent value="activity">                        │
│     <ActivityTimeline items={...} />                    │
│   </TabsContent>                                         │
│ </Tabs>                                                  │
└──────────────────────────────────────────────────────────┘
```

**Componentes shadcn:**
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Avatar`, `AvatarImage`, `AvatarFallback`
- `Card`, `Button`, `Breadcrumb`

**Componentes Custom:**
- `PageHeader`
- `StatCard`
- `InstanceCard`
- `ActivityTimeline`

**Cores:**
- Header background: `var(--bg-primary)`
- Tabs active: `var(--accent-primary)`
- Cards: `var(--bg-secondary)`

**Animações:**
```css
/* Tab content fade in */
.tab-content {
  animation: fadeIn var(--duration-normal);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Instance cards grid com stagger */
.instance-card:nth-child(1) { animation-delay: 0ms; }
.instance-card:nth-child(2) { animation-delay: 100ms; }
.instance-card:nth-child(3) { animation-delay: 200ms; }
```

---

#### `/admin/integracoes` - Integrações WhatsApp

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ <PageHeader>                                             │
│   <Breadcrumb> Dashboard > Integrações </Breadcrumb>     │
│   <div className="flex items-center gap-4">             │
│     <OrgSelector /> <!-- Dropdown de org (Admin) -->     │
│     <h1>Integrações WhatsApp</h1>                       │
│   </div>                                                 │
│   <Button>+ Nova Instância</Button>                     │
│ </PageHeader>                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ <!-- Stats Overview -->                                 │
│ <div className="grid grid-cols-3 gap-4 mb-6">          │
│   <StatCard value="1,245" label="Total" />              │
│   <StatCard                                              │
│     value="892"                                          │
│     label="Conectadas"                                  │
│     color="success"                                      │
│   />                                                     │
│   <StatCard                                              │
│     value="353"                                          │
│     label="Desconectadas"                               │
│     color="error"                                        │
│   />                                                     │
│ </div>                                                   │
│                                                          │
│ <FilterBar>                                              │
│   <Input placeholder="🔍 Buscar instância..." />        │
│   <Select placeholder="Organização">                    │
│     <SelectItem>Todas</SelectItem>                      │
│     <SelectItem>Empresa ABC</SelectItem>                │
│   </Select>                                              │
│   <Select placeholder="Status">                          │
│     <SelectItem>Todos</SelectItem>                      │
│     <SelectItem>Conectadas</SelectItem>                 │
│     <SelectItem>Desconectadas</SelectItem>              │
│   </Select>                                              │
│   <Select placeholder="Projeto">                         │
│     <SelectItem>Todos</SelectItem>                      │
│     <SelectItem>Vendas SP</SelectItem>                  │
│   </Select>                                              │
│   <div className="ml-auto flex gap-2">                  │
│     <Button variant="outline" size="sm">                │
│       <LayoutGrid /> Cards                              │
│     </Button>                                            │
│     <Button variant="ghost" size="sm">                  │
│       <List /> Tabela                                   │
│     </Button>                                            │
│   </div>                                                 │
│ </FilterBar>                                             │
│                                                          │
│ <!-- Bulk Actions (condicional) -->                     │
│ {selectedInstances.length > 0 && (                      │
│   <BulkActionBar selectedCount={selectedInstances.length}>│
│     <DropdownMenu>                                       │
│       <DropdownMenuTrigger asChild>                     │
│         <Button variant="outline">                      │
│           Ações em massa ▼                              │
│         </Button>                                        │
│       </DropdownMenuTrigger>                             │
│       <DropdownMenuContent>                             │
│         <DropdownMenuItem>                              │
│           <FolderMove /> Mover para projeto             │
│         </DropdownMenuItem>                              │
│         <DropdownMenuItem>                              │
│           <PowerOff /> Desconectar todas                │
│         </DropdownMenuItem>                              │
│         <DropdownMenuSeparator />                       │
│         <DropdownMenuItem className="text-red-500">    │
│           <Trash /> Deletar                             │
│         </DropdownMenuItem>                              │
│       </DropdownMenuContent>                             │
│     </DropdownMenu>                                      │
│   </BulkActionBar>                                       │
│ )}                                                       │
│                                                          │
│ <!-- Cards View (padrão) -->                           │
│ <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">│
│   <InstanceCard                                          │
│     id="inst_123"                                        │
│     name="Vendas 1"                                      │
│     organization="Empresa ABC"                          │
│     phone="+55 11 99999-9999"                           │
│     status="connected"                                   │
│     project="Vendas SP"                                 │
│     messagesCount={125}                                  │
│     onSelect={() => handleSelect('inst_123')}          │
│     selected={selectedInstances.includes('inst_123')}  │
│   />                                                     │
│   ...                                                    │
│ </div>                                                   │
│                                                          │
│ <!-- Empty State -->                                    │
│ {instances.length === 0 && (                            │
│   <EmptyState                                            │
│     icon={<Smartphone className="w-24 h-24" />}        │
│     title="Nenhuma instância encontrada"               │
│     description="Crie sua primeira instância WhatsApp" │
│     action={                                             │
│       <Button>+ Criar Primeira Instância</Button>      │
│     }                                                    │
│   />                                                     │
│ )}                                                       │
└──────────────────────────────────────────────────────────┘
```

**Componente: OrgSelector (Admin)**
```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" className="w-[300px] justify-between">
      <div className="flex items-center gap-2">
        <Building className="w-4 h-4" />
        <span>{selectedOrg?.name || "Quayer Admin (Todas)"}</span>
      </div>
      <ChevronsUpDown className="w-4 h-4 opacity-50" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[300px] p-0">
    <Command>
      <CommandInput placeholder="🔍 Buscar organização..." />
      <CommandEmpty>Nenhuma organização encontrada</CommandEmpty>
      <CommandGroup heading="Padrão">
        <CommandItem onSelect={() => setSelectedOrg(null)}>
          <Check className={cn(
            "mr-2 h-4 w-4",
            !selectedOrg ? "opacity-100" : "opacity-0"
          )} />
          <Building className="mr-2 h-4 w-4" />
          Quayer Admin (Todas)
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Organizações">
        {organizations.map((org) => (
          <CommandItem key={org.id} onSelect={() => setSelectedOrg(org)}>
            <Check className={cn(
              "mr-2 h-4 w-4",
              selectedOrg?.id === org.id ? "opacity-100" : "opacity-0"
            )} />
            <Building className="mr-2 h-4 w-4" />
            {org.name}
          </CommandItem>
        ))}
      </CommandGroup>
    </Command>
  </PopoverContent>
</Popover>
```

**Componente: InstanceCard**
```tsx
<Card className={cn(
  "group relative cursor-pointer transition-all",
  selected && "ring-2 ring-accent-primary"
)}>
  <Checkbox
    className="absolute top-4 left-4 z-10"
    checked={selected}
    onCheckedChange={onSelect}
  />

  <CardHeader>
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={`/api/avatar/${phone}`} />
          <AvatarFallback>
            <Smartphone className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
        <div>
          <CardTitle className="text-lg">{name}</CardTitle>
          <p className="text-sm text-muted">{organization}</p>
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  </CardHeader>

  <CardContent>
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <Phone className="w-4 h-4 text-muted" />
        <span>{phone}</span>
      </div>
      {project && (
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-muted" />
          <span>{project}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-muted" />
        <span>{messagesCount} mensagens hoje</span>
      </div>
    </div>
  </CardContent>

  <CardFooter className="pt-4 border-t">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          Ações <MoreVertical className="ml-2 w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Settings className="mr-2 w-4 h-4" />
          Configurar
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Share className="mr-2 w-4 h-4" />
          Compartilhar
        </DropdownMenuItem>
        <DropdownMenuItem>
          <BarChart className="mr-2 w-4 h-4" />
          Estatísticas
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <PowerOff className="mr-2 w-4 h-4" />
          Desconectar
        </DropdownMenuItem>
        <DropdownMenuItem className="text-red-500">
          <Trash className="mr-2 w-4 h-4" />
          Deletar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </CardFooter>
</Card>
```

**Componentes shadcn:**
- `Popover`, `Command` (OrgSelector)
- `Card`, `Checkbox`, `Avatar`
- `DropdownMenu`, `Button`, `Input`, `Select`

**Componentes Custom:**
- `PageHeader`, `FilterBar`, `BulkActionBar`
- `StatCard`, `StatusBadge`, `InstanceCard`, `EmptyState`
- `OrgSelector`

**Cores:**
- Cards: `var(--bg-primary)`
- Selected: `var(--accent-primary)` ring
- Hover: `var(--bg-secondary)`
- Status conectado: `var(--status-success)`
- Status desconectado: `var(--status-error)`

**Animações:**
```css
/* Card hover effect */
.instance-card {
  transition: all var(--duration-normal) var(--ease-in-out);
}
.instance-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

/* Checkbox aparece no hover */
.instance-card .checkbox {
  opacity: 0;
  transition: opacity var(--duration-fast);
}
.instance-card:hover .checkbox,
.instance-card .checkbox:checked {
  opacity: 1;
}

/* Bulk action bar slide down */
.bulk-action-bar {
  animation: slideDown var(--duration-normal) var(--ease-in-out);
}
```

---

#### `/admin/sistema` - Sistema (Agrupa Config + Permissões + Logs)

**Layout com Sub-navegação:**
```
┌──────────────────────────────────────────────────────────┐
│ <PageHeader>                                             │
│   <Breadcrumb> Dashboard > Sistema </Breadcrumb>         │
│   <h1>Configurações do Sistema</h1>                     │
│ </PageHeader>                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ <Tabs defaultValue="config">                            │
│   <TabsList className="w-full justify-start">           │
│     <TabsTrigger value="config">                        │
│       <Settings /> Configurações                        │
│     </TabsTrigger>                                       │
│     <TabsTrigger value="permissions">                   │
│       <Shield /> Permissões                             │
│     </TabsTrigger>                                       │
│     <TabsTrigger value="levels">                        │
│       <Key /> Níveis de Acesso                          │
│     </TabsTrigger>                                       │
│     <TabsTrigger value="logs">                          │
│       <FileText /> Logs                                 │
│     </TabsTrigger>                                       │
│   </TabsList>                                            │
│                                                          │
│   <TabsContent value="config">                          │
│     <Form>                                               │
│       <Card>                                             │
│         <CardHeader>                                     │
│           <CardTitle>🔗 Integração UAZ API</CardTitle>  │
│         </CardHeader>                                    │
│         <CardContent className="space-y-4">             │
│           <FormField name="uazApiUrl">                  │
│             <FormLabel>URL da API</FormLabel>           │
│             <Input defaultValue="https://free.uazapi.com" />│
│           </FormField>                                   │
│           <FormField name="uazAdminToken">              │
│             <FormLabel>Admin Token</FormLabel>          │
│             <div className="flex gap-2">                │
│               <Input type={showToken ? "text" : "password"} />│
│               <Button variant="outline" size="icon">    │
│                 <Eye />                                  │
│               </Button>                                  │
│             </div>                                       │
│           </FormField>                                   │
│         </CardContent>                                   │
│       </Card>                                            │
│                                                          │
│       <Card className="mt-6">                           │
│         <CardHeader>                                     │
│           <CardTitle>📧 Envio de Emails</CardTitle>     │
│         </CardHeader>                                    │
│         <CardContent className="space-y-4">             │
│           <FormField name="emailProvider">              │
│             <FormLabel>Provedor</FormLabel>             │
│             <Select defaultValue="sendgrid">            │
│               <SelectItem value="sendgrid">SendGrid</SelectItem>│
│               <SelectItem value="resend">Resend</SelectItem>│
│               <SelectItem value="smtp">SMTP</SelectItem>│
│             </Select>                                    │
│           </FormField>                                   │
│           <FormField name="emailApiKey">                │
│             <FormLabel>API Key</FormLabel>              │
│             <Input type="password" />                   │
│           </FormField>                                   │
│         </CardContent>                                   │
│       </Card>                                            │
│                                                          │
│       <div className="flex justify-end mt-6">           │
│         <Button type="submit">Salvar Configurações</Button>│
│       </div>                                             │
│     </Form>                                              │
│   </TabsContent>                                         │
│                                                          │
│   <TabsContent value="permissions">                     │
│     <Card>                                               │
│       <CardHeader>                                       │
│         <CardTitle>Matriz de Permissões</CardTitle>     │
│       </CardHeader>                                      │
│       <CardContent>                                      │
│         <Table>                                          │
│           <TableHeader>                                  │
│             <TableRow>                                   │
│               <TableHead>Recurso / Ação</TableHead>     │
│               <TableHead>Master</TableHead>             │
│               <TableHead>Manager</TableHead>            │
│               <TableHead>User</TableHead>               │
│             </TableRow>                                  │
│           </TableHeader>                                 │
│           <TableBody>                                    │
│             <TableRow>                                   │
│               <TableCell className="font-medium">       │
│                 Instâncias / Listar                      │
│               </TableCell>                               │
│               <TableCell>                                │
│                 <Switch defaultChecked />                │
│               </TableCell>                               │
│               <TableCell>                                │
│                 <Switch defaultChecked />                │
│               </TableCell>                               │
│               <TableCell>                                │
│                 <Switch defaultChecked />                │
│               </TableCell>                               │
│             </TableRow>                                  │
│             ...                                          │
│           </TableBody>                                   │
│         </Table>                                         │
│       </CardContent>                                     │
│       <CardFooter>                                       │
│         <Button>Salvar Permissões</Button>              │
│       </CardFooter>                                      │
│     </Card>                                              │
│   </TabsContent>                                         │
│                                                          │
│   <TabsContent value="logs">                            │
│     <Card>                                               │
│       <CardHeader>                                       │
│         <div className="flex items-center justify-between">│
│           <CardTitle>Logs de Auditoria</CardTitle>      │
│           <div className="flex gap-2">                  │
│             <Input                                       │
│               placeholder="🔍 Buscar nos logs..."        │
│               className="w-[300px]"                      │
│             />                                           │
│             <Select defaultValue="all">                 │
│               <SelectItem value="all">Todas</SelectItem>│
│               <SelectItem value="create">Criação</SelectItem>│
│               <SelectItem value="update">Atualização</SelectItem>│
│               <SelectItem value="delete">Exclusão</SelectItem>│
│             </Select>                                    │
│           </div>                                         │
│         </div>                                           │
│       </CardHeader>                                      │
│       <CardContent>                                      │
│         <Table>                                          │
│           <TableHeader>                                  │
│             <TableRow>                                   │
│               <TableHead>Data/Hora</TableHead>          │
│               <TableHead>Usuário</TableHead>            │
│               <TableHead>Ação</TableHead>               │
│               <TableHead>Recurso</TableHead>            │
│               <TableHead>IP</TableHead>                 │
│               <TableHead></TableHead>                   │
│             </TableRow>                                  │
│           </TableHeader>                                 │
│           <TableBody>                                    │
│             <TableRow>                                   │
│               <TableCell>                                │
│                 <div>01/10/2025</div>                   │
│                 <div className="text-sm text-muted">    │
│                   10:30:45                              │
│                 </div>                                   │
│               </TableCell>                               │
│               <TableCell>                                │
│                 <div className="flex items-center gap-2">│
│                   <Avatar className="w-6 h-6">          │
│                     <AvatarFallback>JS</AvatarFallback> │
│                   </Avatar>                              │
│                   <span>admin@quayer.com</span>         │
│                 </div>                                   │
│               </TableCell>                               │
│               <TableCell>                                │
│                 <Badge variant="outline">Criou</Badge>  │
│               </TableCell>                               │
│               <TableCell>Organização</TableCell>        │
│               <TableCell>                                │
│                 <code className="text-xs">192.168.1.1</code>│
│               </TableCell>                               │
│               <TableCell>                                │
│                 <Button variant="ghost" size="icon">    │
│                   <Eye className="w-4 h-4" />           │
│                 </Button>                                │
│               </TableCell>                               │
│             </TableRow>                                  │
│           </TableBody>                                   │
│         </Table>                                         │
│       </CardContent>                                     │
│     </Card>                                              │
│   </TabsContent>                                         │
│ </Tabs>                                                  │
└──────────────────────────────────────────────────────────┘
```

**Componentes shadcn:**
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Form`, `FormField`, `FormLabel`
- `Input`, `Select`, `Switch`
- `Table`, `Card`, `Badge`, `Avatar`

**Cores:**
- Tabs active: `var(--accent-primary)`
- Switch checked: `var(--accent-primary)`
- Badge: Cores contextuais (create=green, delete=red)

---

### 🏢 MASTER

#### `/dashboard` - Dashboard da Organização

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ <PageHeader>                                             │
│   <Breadcrumb> Dashboard </Breadcrumb>                   │
│   <div className="flex items-center gap-4">             │
│     <Avatar className="w-12 h-12">                      │
│       <AvatarImage src="/org-logo.png" />               │
│       <AvatarFallback>EA</AvatarFallback>               │
│     </Avatar>                                            │
│     <div>                                                │
│       <h1>Empresa ABC Ltda</h1>                         │
│       <p className="text-sm text-muted">                │
│         CNPJ: 12.345.678/0001-99                        │
│       </p>                                               │
│     </div>                                               │
│   </div>                                                 │
│ </PageHeader>                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ <!-- Métricas Principais -->                           │
│ <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">│
│   <StatCard                                              │
│     icon={<Smartphone />}                               │
│     value="8"                                            │
│     label="Instâncias"                                  │
│     sublabel="de 20 permitidas"                         │
│     progress={40}                                        │
│   />                                                     │
│   <StatCard                                              │
│     icon={<Users />}                                     │
│     value="12"                                           │
│     label="Usuários"                                    │
│     sublabel="de 50 permitidos"                         │
│     progress={24}                                        │
│   />                                                     │
│   <StatCard                                              │
│     icon={<Folder />}                                    │
│     value="3"                                            │
│     label="Projetos"                                    │
│   />                                                     │
│   <StatCard                                              │
│     icon={<MessageSquare />}                            │
│     value="2.5k"                                         │
│     label="Mensagens"                                   │
│     sublabel="hoje"                                      │
│     trend="+15%"                                         │
│     trendUp={true}                                       │
│   />                                                     │
│ </div>                                                   │
│                                                          │
│ <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">│
│   <!-- Instâncias por Projeto -->                      │
│   <Card>                                                 │
│     <CardHeader>                                         │
│       <CardTitle>📁 Instâncias por Projeto</CardTitle>  │
│     </CardHeader>                                        │
│     <CardContent>                                        │
│       <div className="space-y-4">                       │
│         <div className="flex items-center justify-between">│
│           <div className="flex items-center gap-3">     │
│             <Avatar>                                     │
│               <AvatarFallback>VS</AvatarFallback>       │
│             </Avatar>                                    │
│             <div>                                        │
│               <div className="font-medium">Vendas SP</div>│
│               <div className="text-sm text-muted">      │
│                 3 instâncias                            │
│               </div>                                     │
│             </div>                                       │
│           </div>                                         │
│           <Button variant="ghost" size="sm">            │
│             Ver <ChevronRight className="w-4 h-4 ml-1" />│
│           </Button>                                      │
│         </div>                                           │
│         <Separator />                                   │
│         ...                                              │
│       </div>                                             │
│     </CardContent>                                       │
│   </Card>                                                │
│                                                          │
│   <!-- Equipe Ativa -->                                │
│   <Card>                                                 │
│     <CardHeader>                                         │
│       <div className="flex items-center justify-between">│
│         <CardTitle>👥 Equipe Ativa</CardTitle>          │
│         <Button variant="ghost" size="sm">              │
│           <UserPlus className="w-4 h-4 mr-2" />         │
│           Convidar                                       │
│         </Button>                                        │
│       </div>                                             │
│     </CardHeader>                                        │
│     <CardContent>                                        │
│       <div className="space-y-3">                       │
│         <div className="flex items-center justify-between">│
│           <div className="flex items-center gap-3">     │
│             <Avatar>                                     │
│               <AvatarImage src="/user1.jpg" />          │
│               <AvatarFallback>JS</AvatarFallback>       │
│             </Avatar>                                    │
│             <div>                                        │
│               <div className="font-medium">João Silva</div>│
│               <div className="text-sm text-muted">      │
│                 Master                                  │
│               </div>                                     │
│             </div>                                       │
│           </div>                                         │
│           <Badge variant="outline">                     │
│             <Circle className="w-2 h-2 mr-1 fill-green-500" />│
│             Online                                       │
│           </Badge>                                       │
│         </div>                                           │
│         ...                                              │
│       </div>                                             │
│     </CardContent>                                       │
│   </Card>                                                │
│ </div>                                                   │
│                                                          │
│ <!-- Gráfico de Mensagens -->                          │
│ <Card className="mt-6">                                 │
│   <CardHeader>                                           │
│     <CardTitle>📊 Mensagens Enviadas (7 dias)</CardTitle>│
│   </CardHeader>                                          │
│   <CardContent>                                          │
│     <AreaChart                                           │
│       data={messagesData}                                │
│       categories={["Mensagens"]}                        │
│       index="date"                                       │
│       colors={["emerald"]}                              │
│       showLegend={false}                                 │
│     />                                                   │
│   </CardContent>                                         │
│ </Card>                                                  │
└──────────────────────────────────────────────────────────┘
```

**Componentes shadcn:**
- `Card`, `Avatar`, `Badge`, `Button`
- `Separator`, `Progress` (para StatCard)

**Componentes Custom:**
- `PageHeader`, `StatCard`

**Cores:**
- Progress bars: `var(--accent-primary)`
- Online status: `var(--status-success)`
- Cards: `var(--bg-primary)`

**Animações:**
```css
/* Stat cards com counter animation */
@keyframes countUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.stat-value {
  animation: countUp 0.8s var(--ease-in-out);
}

/* Progress bar fill */
@keyframes fillProgress {
  from { width: 0; }
  to { width: var(--progress-value); }
}

.progress-bar {
  animation: fillProgress 1s var(--ease-in-out);
}
```

---

#### `/integracoes/:id/settings` - Configurar Instância (Página)

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ <PageHeader>                                             │
│   <Breadcrumb>                                           │
│     Dashboard > Integrações > Vendas 1 > Configurações  │
│   </Breadcrumb>                                          │
│   <div className="flex items-center gap-4">             │
│     <Avatar>                                             │
│       <AvatarImage src="/api/avatar/5511999999999" />   │
│       <AvatarFallback><Smartphone /></AvatarFallback>   │
│     </Avatar>                                            │
│     <div>                                                │
│       <h1>Vendas 1</h1>                                 │
│       <p className="text-sm text-muted">                │
│         +55 11 99999-9999                               │
│       </p>                                               │
│     </div>                                               │
│     <StatusBadge status="connected" className="ml-auto" />│
│   </div>                                                 │
│ </PageHeader>                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ <Tabs defaultValue="basic">                             │
│   <TabsList className="grid grid-cols-3 w-full">        │
│     <TabsTrigger value="basic">                         │
│       <Info className="w-4 h-4 mr-2" />                │
│       Básico                                             │
│     </TabsTrigger>                                       │
│     <TabsTrigger value="webhook">                       │
│       <Webhook className="w-4 h-4 mr-2" />             │
│       Webhook                                            │
│     </TabsTrigger>                                       │
│     <TabsTrigger value="advanced">                      │
│       <Settings className="w-4 h-4 mr-2" />            │
│       Avançado                                           │
│     </TabsTrigger>                                       │
│   </TabsList>                                            │
│                                                          │
│   <TabsContent value="basic" className="mt-6">          │
│     <Form>                                               │
│       <Card>                                             │
│         <CardHeader>                                     │
│           <CardTitle>Informações Básicas</CardTitle>    │
│         </CardHeader>                                    │
│         <CardContent className="space-y-4">             │
│           <FormField name="name">                       │
│             <FormLabel>Nome da Instância *</FormLabel>  │
│             <Input defaultValue="Vendas 1" />           │
│           </FormField>                                   │
│                                                          │
│           <FormField name="project">                    │
│             <FormLabel>Projeto</FormLabel>              │
│             <Select defaultValue="vendas-sp">           │
│               <SelectTrigger>                           │
│                 <SelectValue />                         │
│               </SelectTrigger>                           │
│               <SelectContent>                           │
│                 <SelectItem value="vendas-sp">          │
│                   Vendas SP                             │
│                 </SelectItem>                            │
│                 <SelectItem value="suporte">            │
│                   Suporte                               │
│                 </SelectItem>                            │
│               </SelectContent>                           │
│             </Select>                                    │
│           </FormField>                                   │
│                                                          │
│           <FormField name="status">                     │
│             <FormLabel>Status</FormLabel>               │
│             <Input                                       │
│               value="Conectado"                         │
│               disabled                                   │
│               className="bg-muted"                       │
│             />                                           │
│             <FormDescription>                           │
│               Este campo é somente leitura              │
│             </FormDescription>                           │
│           </FormField>                                   │
│         </CardContent>                                   │
│       </Card>                                            │
│                                                          │
│       <div className="flex justify-end gap-2 mt-6">     │
│         <Button variant="outline" asChild>              │
│           <Link href="/integracoes">Cancelar</Link>     │
│         </Button>                                        │
│         <Button type="submit">                          │
│           <Save className="w-4 h-4 mr-2" />             │
│           Salvar Alterações                             │
│         </Button>                                        │
│       </div>                                             │
│     </Form>                                              │
│   </TabsContent>                                         │
│                                                          │
│   <TabsContent value="webhook" className="mt-6">        │
│     <Form>                                               │
│       <Card>                                             │
│         <CardHeader>                                     │
│           <CardTitle>Configuração de Webhook</CardTitle>│
│           <CardDescription>                             │
│             Receba eventos em tempo real via HTTP POST  │
│           </CardDescription>                             │
│         </CardHeader>                                    │
│         <CardContent className="space-y-4">             │
│           <FormField name="webhookUrl">                 │
│             <FormLabel>URL do Webhook *</FormLabel>     │
│             <Input                                       │
│               type="url"                                 │
│               placeholder="https://api.exemplo.com/webhook"│
│             />                                           │
│             <FormDescription>                           │
│               Eventos serão enviados para esta URL      │
│             </FormDescription>                           │
│           </FormField>                                   │
│                                                          │
│           <FormField name="webhookEvents">              │
│             <FormLabel>Eventos</FormLabel>              │
│             <div className="grid grid-cols-2 gap-3">    │
│               <div className="flex items-center space-x-2">│
│                 <Checkbox id="event-messages" defaultChecked />│
│                 <Label htmlFor="event-messages">        │
│                   Mensagens Recebidas                   │
│                 </Label>                                 │
│               </div>                                     │
│               <div className="flex items-center space-x-2">│
│                 <Checkbox id="event-status" defaultChecked />│
│                 <Label htmlFor="event-status">          │
│                   Status de Conexão                     │
│                 </Label>                                 │
│               </div>                                     │
│               <div className="flex items-center space-x-2">│
│                 <Checkbox id="event-groups" />          │
│                 <Label htmlFor="event-groups">          │
│                   Grupos                                │
│                 </Label>                                 │
│               </div>                                     │
│               <div className="flex items-center space-x-2">│
│                 <Checkbox id="event-calls" />           │
│                 <Label htmlFor="event-calls">           │
│                   Chamadas                              │
│                 </Label>                                 │
│               </div>                                     │
│             </div>                                       │
│           </FormField>                                   │
│                                                          │
│           <Alert>                                        │
│             <Webhook className="w-4 h-4" />             │
│             <AlertTitle>Teste o Webhook</AlertTitle>    │
│             <AlertDescription>                          │
│               <Button variant="outline" size="sm" className="mt-2">│
│                 Enviar Evento de Teste                  │
│               </Button>                                  │
│             </AlertDescription>                          │
│           </Alert>                                       │
│         </CardContent>                                   │
│       </Card>                                            │
│                                                          │
│       <div className="flex justify-end gap-2 mt-6">     │
│         <Button variant="outline">Cancelar</Button>     │
│         <Button type="submit">Salvar Webhook</Button>   │
│       </div>                                             │
│     </Form>                                              │
│   </TabsContent>                                         │
│                                                          │
│   <TabsContent value="advanced" className="mt-6">       │
│     <Form>                                               │
│       <Card>                                             │
│         <CardHeader>                                     │
│           <CardTitle>Configurações Avançadas</CardTitle>│
│         </CardHeader>                                    │
│         <CardContent className="space-y-4">             │
│           <FormField name="msgDelayMin">                │
│             <FormLabel>Delay Mínimo (segundos)</FormLabel>│
│             <Input type="number" defaultValue={2} min={1} />│
│             <FormDescription>                           │
│               Tempo mínimo entre mensagens              │
│             </FormDescription>                           │
│           </FormField>                                   │
│                                                          │
│           <FormField name="msgDelayMax">                │
│             <FormLabel>Delay Máximo (segundos)</FormLabel>│
│             <Input type="number" defaultValue={4} min={1} />│
│             <FormDescription>                           │
│               Tempo máximo entre mensagens              │
│             </FormDescription>                           │
│           </FormField>                                   │
│                                                          │
│           <Separator />                                  │
│                                                          │
│           <Alert variant="destructive">                 │
│             <AlertTriangle className="w-4 h-4" />       │
│             <AlertTitle>Zona de Perigo</AlertTitle>     │
│             <AlertDescription>                          │
│               <Button                                    │
│                 variant="destructive"                    │
│                 className="mt-2"                         │
│               >                                          │
│                 <Trash className="w-4 h-4 mr-2" />      │
│                 Deletar Instância                       │
│               </Button>                                  │
│             </AlertDescription>                          │
│           </Alert>                                       │
│         </CardContent>                                   │
│       </Card>                                            │
│                                                          │
│       <div className="flex justify-end gap-2 mt-6">     │
│         <Button variant="outline">Cancelar</Button>     │
│         <Button type="submit">Salvar</Button>           │
│       </div>                                             │
│     </Form>                                              │
│   </TabsContent>                                         │
│ </Tabs>                                                  │
└──────────────────────────────────────────────────────────┘
```

**Componentes shadcn:**
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Form`, `FormField`, `FormLabel`, `FormDescription`
- `Input`, `Select`, `Checkbox`, `Label`
- `Card`, `Alert`, `Separator`, `Button`

**Cores:**
- Tabs active: `var(--accent-primary)`
- Alert warning: `var(--status-warning-bg)`
- Alert destructive: `var(--status-error-bg)`
- Disabled input: `var(--bg-tertiary)`

**Animações:**
```css
/* Tab transition */
.tab-content {
  animation: fadeSlideIn var(--duration-normal) var(--ease-in-out);
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

---

### 👤 USER

#### `/integracoes` - Integrações Simplificadas

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ <PageHeader>                                             │
│   <h1>🔌 Minhas Integrações WhatsApp</h1>               │
│   <p className="text-muted">                            │
│     Conecte e visualize suas instâncias                 │
│   </p>                                                   │
│ </PageHeader>                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ {instances.length === 0 ? (                             │
│   <EmptyState                                            │
│     icon={<Smartphone className="w-32 h-32 text-muted" />}│
│     title="Nenhuma instância disponível"               │
│     description="Aguarde o administrador compartilhar uma instância com você"│
│   />                                                     │
│ ) : (                                                    │
│   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">│
│     {instances.map((instance) => (                      │
│       <Card key={instance.id} className="overflow-hidden">│
│         <div className={cn(                             │
│           "h-2",                                         │
│           instance.status === 'connected' && "bg-green-500",│
│           instance.status === 'disconnected' && "bg-red-500"│
│         )} />                                            │
│                                                          │
│         <CardHeader>                                     │
│           <div className="flex items-center gap-4">     │
│             <Avatar className="w-16 h-16">              │
│               <AvatarImage src={instance.profilePicUrl} />│
│               <AvatarFallback>                          │
│                 <Smartphone className="w-8 h-8" />      │
│               </AvatarFallback>                          │
│             </Avatar>                                    │
│             <div className="flex-1">                     │
│               <CardTitle className="text-xl">          │
│                 {instance.name}                          │
│               </CardTitle>                               │
│               <div className="flex items-center gap-2 mt-1">│
│                 {instance.status === 'connected' ? (    │
│                   <>                                     │
│                     <Phone className="w-4 h-4 text-muted" />│
│                     <span className="text-sm text-muted">│
│                       {instance.phone}                   │
│                     </span>                              │
│                   </>                                    │
│                 ) : (                                    │
│                   <span className="text-sm text-muted"> │
│                     Número: Não conectado               │
│                   </span>                                │
│                 )}                                       │
│               </div>                                     │
│             </div>                                       │
│           </div>                                         │
│         </CardHeader>                                    │
│                                                          │
│         <CardContent>                                    │
│           <div className="flex items-center justify-between">│
│             <div>                                        │
│               <p className="text-sm font-medium">Status:</p>│
│               <StatusBadge                               │
│                 status={instance.status}                 │
│                 className="mt-1"                         │
│               />                                         │
│             </div>                                       │
│             {instance.project && (                      │
│               <div className="text-right">              │
│                 <p className="text-sm font-medium">Projeto:</p>│
│                 <p className="text-sm text-muted mt-1">  │
│                   {instance.project}                     │
│                 </p>                                     │
│               </div>                                     │
│             )}                                           │
│           </div>                                         │
│         </CardContent>                                   │
│                                                          │
│         <CardFooter className="pt-4 border-t flex gap-2">│
│           {instance.status === 'disconnected' ? (       │
│             <Button                                      │
│               className="w-full"                         │
│               onClick={() => handleConnect(instance.id)} │
│             >                                            │
│               <QrCode className="w-4 h-4 mr-2" />       │
│               Conectar WhatsApp                         │
│             </Button>                                    │
│           ) : (                                          │
│             <Button                                      │
│               variant="outline"                          │
│               className="w-full"                         │
│               onClick={() => handleViewDetails(instance.id)}│
│             >                                            │
│               <Eye className="w-4 h-4 mr-2" />          │
│               Ver Detalhes                              │
│             </Button>                                    │
│           )}                                             │
│         </CardFooter>                                    │
│       </Card>                                            │
│     ))}                                                  │
│   </div>                                                 │
│ )}                                                       │
│                                                          │
│ <!-- Aviso -->                                          │
│ <Alert className="mt-6">                                │
│   <Info className="w-4 h-4" />                          │
│   <AlertTitle>Acesso Limitado</AlertTitle>             │
│   <AlertDescription>                                    │
│     Você pode apenas visualizar e conectar instâncias.  │
│     Para criar ou configurar, entre em contato com o    │
│     administrador.                                       │
│   </AlertDescription>                                    │
│ </Alert>                                                 │
└──────────────────────────────────────────────────────────┘
```

**Modal: Conectar WhatsApp (User)**
```tsx
<Dialog open={connectModalOpen} onOpenChange={setConnectModalOpen}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>🔗 Conectar WhatsApp</DialogTitle>
      <DialogDescription>
        {instance.name} - Escaneie o QR Code
      </DialogDescription>
    </DialogHeader>

    <div className="flex flex-col items-center py-6">
      {qrCode ? (
        <>
          <div className="relative">
            <QRCodeDisplay value={qrCode} size={280} />
            <div className="absolute -top-2 -right-2">
              <Badge variant="outline" className="bg-background">
                <Timer className="w-3 h-3 mr-1" />
                {formatTime(timeRemaining)}
              </Badge>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="w-full space-y-3">
            <h4 className="font-semibold text-sm">📱 Como conectar:</h4>
            <ol className="space-y-2 text-sm text-muted">
              <li className="flex gap-2">
                <span className="font-semibold">1.</span>
                <span>Abra o WhatsApp no seu celular</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">2.</span>
                <span>Toque em Mais opções (⋮) ou Configurações</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">3.</span>
                <span>Toque em Aparelhos conectados</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">4.</span>
                <span>Toque em Conectar um aparelho</span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold">5.</span>
                <span>Aponte a câmera para o QR Code acima</span>
              </li>
            </ol>
          </div>

          <Alert className="mt-4">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              Status: {connectionStatus}
            </AlertDescription>
          </Alert>
        </>
      ) : (
        <div className="flex flex-col items-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-muted" />
          <p className="mt-4 text-sm text-muted">Gerando QR Code...</p>
        </div>
      )}
    </div>

    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setConnectModalOpen(false)}
      >
        Fechar
      </Button>
      {qrCode && (
        <Button onClick={handleRefreshQR}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Gerar Novo QR
        </Button>
      )}
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Componentes shadcn:**
- `Card`, `Avatar`, `Badge`, `Button`
- `Dialog`, `Alert`, `Separator`

**Componentes Custom:**
- `PageHeader`, `EmptyState`, `StatusBadge`, `QRCodeDisplay`

**Cores:**
- Barra de status (top): Verde (conectado), Vermelho (desconectado)
- Cards: `var(--bg-primary)`
- Alert info: `var(--status-info-bg)`

**Animações:**
```css
/* Cards aparecem com fade + scale */
@keyframes fadeScale {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.instance-card-user {
  animation: fadeScale var(--duration-normal) var(--ease-in-out);
  animation-delay: calc(var(--index) * 100ms);
}

/* QR Code pulse */
@keyframes qrPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.qr-code {
  animation: qrPulse 2s infinite;
}

/* Status bar shimmer */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.status-bar::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255,255,255,0.2),
    transparent
  );
  animation: shimmer 2s infinite;
}
```

---

## 🎨 4. DESIGN TOKENS - RESUMO

### Guia de Uso

**Backgrounds:**
```css
/* Página principal */
body { background: var(--bg-app); }

/* Cards/Containers */
.card { background: var(--bg-primary); }

/* Hover states */
.card:hover { background: var(--bg-secondary); }

/* Elevated (modals/popovers) */
.dialog { background: var(--bg-elevated); }
```

**Status:**
```css
/* Conectado */
.badge-success {
  background: var(--status-success-bg);
  color: var(--status-success);
}

/* Desconectado */
.badge-error {
  background: var(--status-error-bg);
  color: var(--status-error);
}

/* Conectando */
.badge-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning);
  animation: pulse 2s infinite;
}
```

**Botões:**
```css
/* Primary */
.btn-primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
}

/* Danger */
.btn-danger {
  background: var(--accent-danger);
  color: var(--text-inverse);
}
```

---

## 📦 5. COMPONENTES REUTILIZÁVEIS

### Criar Componentes Customizados

```typescript
// src/components/custom/status-badge.tsx
export function StatusBadge({ status }: { status: InstanceStatus }) {
  const config = {
    connected: {
      label: 'Conectado',
      icon: <Circle className="w-2 h-2 fill-current" />,
      className: 'bg-status-success-bg text-status-success border-status-success'
    },
    disconnected: {
      label: 'Desconectado',
      icon: <CircleOff className="w-2 h-2" />,
      className: 'bg-status-error-bg text-status-error border-status-error'
    },
    connecting: {
      label: 'Conectando',
      icon: <Loader2 className="w-2 h-2 animate-spin" />,
      className: 'bg-status-warning-bg text-status-warning border-status-warning animate-pulse'
    }
  }

  const { label, icon, className } = config[status]

  return (
    <Badge variant="outline" className={cn(className, "gap-1")}>
      {icon}
      <span>{label}</span>
    </Badge>
  )
}

// src/components/custom/empty-state.tsx
export function EmptyState({
  icon,
  title,
  description,
  action
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="text-muted-foreground mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground max-w-md mb-6">
        {description}
      </p>
      {action}
    </div>
  )
}

// src/components/custom/page-header.tsx
export function PageHeader({ children, breadcrumb }: PageHeaderProps) {
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-6">
        {breadcrumb && (
          <Breadcrumb className="mb-2">
            {breadcrumb}
          </Breadcrumb>
        )}
        <div className="flex items-center gap-4 flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Design System
- [ ] Criar arquivo `design-tokens.css` com todas as variáveis
- [ ] Importar tokens no `globals.css`
- [ ] Configurar shadcn/ui theme com os tokens
- [ ] Criar componentes customizados (`status-badge`, `empty-state`, `page-header`, etc)

### Páginas Admin
- [ ] Dashboard com quick actions e atividades
- [ ] Organizações com tabela e bulk actions
- [ ] Detalhes da organização (página dedicada)
- [ ] Integrações com OrgSelector e filtros poderosos
- [ ] Sistema (tabs: config, permissões, logs)

### Páginas Master
- [ ] Dashboard da organização
- [ ] Integrações (cards view + filtros)
- [ ] Configurar instância (página com tabs)
- [ ] Projetos
- [ ] Equipe

### Páginas User
- [ ] Integrações simplificadas
- [ ] Modal de conexão QR
- [ ] Perfil

### Estados e Animações
- [ ] Empty states para todas as listas
- [ ] Loading states (skeletons)
- [ ] Error pages (404, 403, 500)
- [ ] Animações de entrada (fadeIn, slideIn)
- [ ] Hover effects
- [ ] Micro-interactions (pulse, shimmer)

---

**Essa arquitetura está completa e pronta para implementação!** 🚀
