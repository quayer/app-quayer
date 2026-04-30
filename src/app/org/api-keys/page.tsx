'use client'

import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Key,
  Plus,
  Copy,
  Trash2,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  Shield,
  MoreHorizontal,
  Ban,
  Loader2,
  Pencil,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Badge } from '@/client/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/client/components/ui/alert'
import { Skeleton } from '@/client/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/client/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/client/components/ui/tooltip'
import { Checkbox } from '@/client/components/ui/checkbox'
import { Separator } from '@/client/components/ui/separator'
import { SidebarTrigger } from '@/client/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/client/components/ui/breadcrumb'
import { toast } from 'sonner'
import { api } from '@/igniter.client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  usageCount: number
  isActive: boolean
  createdAt: string
  key?: string
}

type StatusFilter = 'all' | 'active' | 'revoked'

type ApiKeysClient = Record<
  string,
  {
    query: (args?: unknown) => Promise<unknown>
    mutate: (args?: unknown) => Promise<unknown>
  }
>

function getApiKeysClient(): ApiKeysClient {
  const clientMap = api as unknown as Record<string, ApiKeysClient>
  return clientMap['api-keys']
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAW_EXPIRATION_OPTIONS = [
  { value: 'never', label: 'Nunca expira', days: null },
  { value: '30d', label: '30 dias', days: 30 },
  { value: '60d', label: '60 dias', days: 60 },
  { value: '90d', label: '90 dias', days: 90 },
  { value: '180d', label: '6 meses', days: 180 },
  { value: '365d', label: '1 ano', days: 365 },
] as const

function buildExpirationOptions() {
  const now = new Date()
  return RAW_EXPIRATION_OPTIONS.map((opt) => ({
    ...opt,
    fullLabel:
      opt.days !== null
        ? `${opt.label} — expira em ${format(addDays(now, opt.days), 'dd/MM/yyyy')}`
        : opt.label,
  }))
}

const ALL_SCOPE_VALUES = [
  'read',
  'write',
  'delete',
  'admin',
  'instances:read',
  'instances:write',
  'messages:read',
  'messages:write',
  'contacts:read',
  'contacts:write',
  'webhooks:manage',
  'sessions:read',
  'sessions:write',
] as const

const GENERAL_SCOPES = [
  { value: 'read', label: 'Leitura', description: 'Acesso de leitura geral em todos os recursos' },
  { value: 'write', label: 'Escrita', description: 'Acesso de escrita geral em todos os recursos' },
  { value: 'delete', label: 'Exclusão', description: 'Permissão para deletar recursos' },
  { value: 'admin', label: 'Admin', description: 'Acesso administrativo completo (inclui todos os escopos)' },
] as const

const RESOURCE_SCOPES = [
  { value: 'instances:read', label: 'Instâncias (Leitura)', description: 'Listar e visualizar instâncias' },
  { value: 'instances:write', label: 'Instâncias (Escrita)', description: 'Criar e gerenciar instâncias' },
  { value: 'messages:read', label: 'Mensagens (Leitura)', description: 'Ler mensagens' },
  { value: 'messages:write', label: 'Mensagens (Escrita)', description: 'Enviar mensagens' },
  { value: 'contacts:read', label: 'Contatos (Leitura)', description: 'Listar e visualizar contatos' },
  { value: 'contacts:write', label: 'Contatos (Escrita)', description: 'Criar e editar contatos' },
  { value: 'webhooks:manage', label: 'Webhooks', description: 'Gerenciar webhooks' },
  { value: 'sessions:read', label: 'Sessões (Leitura)', description: 'Visualizar conversas de chat' },
  { value: 'sessions:write', label: 'Sessões (Escrita)', description: 'Gerenciar conversas de chat' },
] as const

const SCOPE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  [...GENERAL_SCOPES, ...RESOURCE_SCOPES].map((s) => [s.value, s.label])
)

function getScopeLabel(scope: string): string {
  return SCOPE_LABEL_MAP[scope] ?? scope
}

function getScopeBadgeVariant(scope: string): 'default' | 'secondary' | 'outline' {
  if (scope === 'admin') return 'default'
  if (scope.includes(':')) return 'outline'
  return 'secondary'
}

function formatExpiration(expiresAt: string | null): string {
  if (!expiresAt) return 'Nunca'
  const date = new Date(expiresAt)
  const now = new Date()
  if (date < now) return `Expirou em ${format(date, 'dd/MM/yyyy')}`
  return format(date, 'dd/MM/yyyy')
}

// ---------------------------------------------------------------------------
// Scopes form (shared between Create and Edit)
// ---------------------------------------------------------------------------

interface ScopesFormProps {
  selectedScopes: string[]
  onChange: (scopes: string[]) => void
}

function ScopesForm({ selectedScopes, onChange }: ScopesFormProps) {
  const isAdmin = selectedScopes.includes('admin')

  const toggleScope = (scope: string) => {
    if (scope === 'admin') {
      if (isAdmin) {
        onChange([])
      } else {
        onChange([...ALL_SCOPE_VALUES])
      }
      return
    }
    const next = selectedScopes.includes(scope)
      ? selectedScopes.filter((s) => s !== scope)
      : [...selectedScopes, scope]
    // If all scopes are now selected, ensure admin is checked too
    const allNonAdmin = ALL_SCOPE_VALUES.filter((s) => s !== 'admin')
    const hasAllNonAdmin = allNonAdmin.every((s) => next.includes(s))
    if (hasAllNonAdmin && !next.includes('admin')) {
      onChange([...next, 'admin'])
    } else if (!hasAllNonAdmin && next.includes('admin')) {
      onChange(next.filter((s) => s !== 'admin'))
    } else {
      onChange(next)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Permissões (Escopos)</Label>
        <p className="text-xs text-muted-foreground">
          Escopos gerais abrangem todos os recursos do tipo
        </p>
      </div>

      {isAdmin && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Escopo <strong>Admin</strong> concede acesso total. Use apenas em integrações confiáveis.
          </AlertDescription>
        </Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Geral
        </legend>
        <div
          className="grid grid-cols-2 gap-2 border rounded-md p-3"
          role="group"
          aria-label="Escopos gerais"
        >
          {GENERAL_SCOPES.map((scope) => (
            <div key={scope.value} className="flex items-start space-x-2">
              <Checkbox
                id={`scope-${scope.value}`}
                checked={selectedScopes.includes(scope.value)}
                onCheckedChange={() => toggleScope(scope.value)}
              />
              <div className="grid gap-0.5 leading-none">
                <label
                  htmlFor={`scope-${scope.value}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {scope.label}
                </label>
                <p className="text-xs text-muted-foreground">{scope.description}</p>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Recursos específicos
        </legend>
        <div
          className="grid grid-cols-2 gap-2 border rounded-md p-3"
          role="group"
          aria-label="Escopos de recursos"
        >
          {RESOURCE_SCOPES.map((scope) => (
            <div key={scope.value} className="flex items-start space-x-2">
              <Checkbox
                id={`scope-${scope.value}`}
                checked={selectedScopes.includes(scope.value)}
                onCheckedChange={() => toggleScope(scope.value)}
              />
              <div className="grid gap-0.5 leading-none">
                <label
                  htmlFor={`scope-${scope.value}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {scope.label}
                </label>
                <p className="text-xs text-muted-foreground">{scope.description}</p>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create API Key Dialog
// ---------------------------------------------------------------------------

interface CreateApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CreateApiKeyDialog({ open, onOpenChange }: CreateApiKeyDialogProps) {
  const queryClient = useQueryClient()
  const apiKeysClient = getApiKeysClient()

  const [name, setName] = useState('')
  const [expiration, setExpiration] = useState<string>('never')
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])

  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const expirationOptions = buildExpirationOptions()

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; expiration: string; scopes: string[] }) => {
      return apiKeysClient.create.mutate({ body: data }) as Promise<{ data: ApiKey }>
    },
    onSuccess: (result: { data: ApiKey }) => {
      setCreatedKey(result.data)
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API Key criada com sucesso!')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar API Key: ${error.message}`)
    },
  })

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    if (selectedScopes.length === 0) {
      toast.error('Selecione pelo menos um escopo')
      return
    }
    createMutation.mutate({ name, expiration, scopes: selectedScopes })
  }

  const handleCopyKey = () => {
    if (createdKey?.key) {
      navigator.clipboard.writeText(createdKey.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Chave copiada para a área de transferência!')
    }
  }

  const resetAndClose = () => {
    setName('')
    setExpiration('never')
    setSelectedScopes([])
    setCreatedKey(null)
    setShowKey(false)
    setCopied(false)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetAndClose()
        else onOpenChange(true)
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {createdKey ? 'API Key Criada!' : 'Criar Nova API Key'}
          </DialogTitle>
          <DialogDescription>
            {createdKey
              ? 'Copie sua chave agora. Ela não será mostrada novamente.'
              : 'Configure sua nova chave de API para acesso via CLI ou MCP.'}
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4">
            <Alert variant="destructive" role="alert">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Importante!</AlertTitle>
              <AlertDescription>
                Esta chave não será exibida novamente. Copie e guarde em local seguro.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label id="created-key-label">Sua API Key</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    readOnly
                    type={showKey ? 'text' : 'password'}
                    value={createdKey.key ?? ''}
                    className="font-mono pr-10"
                    aria-labelledby="created-key-label"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowKey(!showKey)}
                    aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                    aria-pressed={showKey}
                  >
                    {showKey
                      ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                      : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
                <Button
                  onClick={handleCopyKey}
                  variant="outline"
                  aria-label={copied ? 'Copiado!' : 'Copiar chave'}
                >
                  {copied
                    ? <Check className="h-4 w-4" aria-hidden="true" />
                    : <Copy className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Nome:</span>
                <p className="font-medium">{createdKey.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Expiração:</span>
                <p className="font-medium">{formatExpiration(createdKey.expiresAt)}</p>
              </div>
            </div>

            <div>
              <span className="text-sm text-muted-foreground">Escopos:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {createdKey.scopes.map((scope) => (
                  <Badge key={scope} variant={getScopeBadgeVariant(scope)} className="text-xs">
                    {getScopeLabel(scope)}
                  </Badge>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button onClick={resetAndClose}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Nome da Chave</Label>
              <Input
                id="api-key-name"
                placeholder="Ex: MCP Server Produção"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-describedby="api-key-name-hint"
              />
              <p id="api-key-name-hint" className="text-xs text-muted-foreground">
                Um nome descritivo para identificar onde esta chave será usada.
              </p>
            </div>

            <div className="space-y-2">
              <Label id="expiration-label">Expiração</Label>
              <Select value={expiration} onValueChange={setExpiration}>
                <SelectTrigger aria-labelledby="expiration-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expirationOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.fullLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ScopesForm selectedScopes={selectedScopes} onChange={setSelectedScopes} />

            <DialogFooter>
              <Button variant="outline" onClick={resetAndClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                aria-busy={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" aria-hidden="true" />
                    Criar API Key
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Edit API Key Dialog
// ---------------------------------------------------------------------------

interface EditApiKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKey: ApiKey
}

function EditApiKeyDialog({ open, onOpenChange, apiKey }: EditApiKeyDialogProps) {
  const queryClient = useQueryClient()
  const apiKeysClient = getApiKeysClient()

  const [name, setName] = useState(apiKey.name)
  const [selectedScopes, setSelectedScopes] = useState<string[]>(apiKey.scopes)

  const updateMutation = useMutation({
    mutationFn: async (data: { name: string; scopes: string[] }) => {
      return apiKeysClient.update.mutate({ params: { id: apiKey.id }, body: data })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API Key atualizada com sucesso!')
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar API Key: ${error.message}`)
    },
  })

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    if (selectedScopes.length === 0) {
      toast.error('Selecione pelo menos um escopo')
      return
    }
    updateMutation.mutate({ name, scopes: selectedScopes })
  }

  const handleClose = () => {
    setName(apiKey.name)
    setSelectedScopes(apiKey.scopes)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar API Key</DialogTitle>
          <DialogDescription>
            Altere o nome ou os escopos da chave <strong>{apiKey.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-api-key-name">Nome da Chave</Label>
            <Input
              id="edit-api-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <ScopesForm selectedScopes={selectedScopes} onChange={setSelectedScopes} />

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              aria-busy={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function OrgApiKeysPage() {
  const queryClient = useQueryClient()
  const apiKeysClient = getApiKeysClient()

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editKey, setEditKey] = useState<ApiKey | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [confirmAction, setConfirmAction] = useState<{
    type: 'revoke' | 'delete'
    keyId: string
    keyName: string
  } | null>(null)

  const { data: apiKeysResponse, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const result = (await apiKeysClient.list.query()) as { data: { data: ApiKey[] } }
      return result?.data?.data ?? []
    },
  })

  const apiKeys = Array.isArray(apiKeysResponse) ? apiKeysResponse : []

  const filteredKeys = apiKeys.filter((key) => {
    if (statusFilter === 'active') return key.isActive
    if (statusFilter === 'revoked') return !key.isActive
    return true
  })

  const activeCount = apiKeys.filter((k) => k.isActive).length
  const revokedCount = apiKeys.filter((k) => !k.isActive).length

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiKeysClient.revoke.mutate({ params: { id } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API Key revogada com sucesso')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao revogar: ${error.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiKeysClient.delete.mutate({ params: { id } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API Key deletada permanentemente')
    },
    onError: (error: Error) => {
      toast.error(`Erro ao deletar: ${error.message}`)
    },
  })

  const handleConfirmAction = useCallback(() => {
    if (!confirmAction) return
    if (confirmAction.type === 'revoke') {
      revokeMutation.mutate(confirmAction.keyId)
    } else {
      deleteMutation.mutate(confirmAction.keyId)
    }
    setConfirmAction(null)
  }, [confirmAction, revokeMutation, deleteMutation])

  const breadcrumbHeader = (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/org">Organização</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>API Keys</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )

  if (isLoading) {
    return (
      <>
        {breadcrumbHeader}
        <div className="flex-1 space-y-6 p-8 pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-5 w-96" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
          <Skeleton className="h-10 w-64" />
          <div role="status" aria-busy="true" aria-label="Carregando API Keys">
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Carregando API Keys...</span>
          </div>
        </div>
      </>
    )
  }

  return (
    <TooltipProvider>
      <>
        {breadcrumbHeader}

        <div className="flex-1 space-y-6 p-8 pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
                <Key className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
                <p className="text-muted-foreground mt-1">
                  Gerencie as chaves de API da sua organização para acesso via CLI, SDK ou MCP
                </p>
              </div>
            </div>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Criar API Key
            </Button>
          </div>

          <Alert role="note">
            <Shield className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Como usar API Keys</AlertTitle>
            <AlertDescription>
              Use o header{' '}
              <code className="bg-muted px-1 rounded text-xs">Authorization: Bearer qk_live_xxx</code>{' '}
              ou{' '}
              <code className="bg-muted px-1 rounded text-xs">X-API-Key: qk_live_xxx</code>{' '}
              em suas requisições.
            </AlertDescription>
          </Alert>

          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <TabsList aria-label="Filtrar por status">
              <TabsTrigger value="all">Todas ({apiKeys.length})</TabsTrigger>
              <TabsTrigger value="active">Ativas ({activeCount})</TabsTrigger>
              <TabsTrigger value="revoked">Revogadas ({revokedCount})</TabsTrigger>
            </TabsList>
          </Tabs>

          {filteredKeys.length > 0 ? (
            <div className="border rounded-lg">
              <Table aria-label="Lista de API Keys">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Prefixo</TableHead>
                    <TableHead>Escopos</TableHead>
                    <TableHead>Expiração</TableHead>
                    <TableHead>Último uso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {key.prefix}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {key.scopes.slice(0, 3).map((scope) => (
                            <Badge
                              key={scope}
                              variant={getScopeBadgeVariant(scope)}
                              className="text-xs"
                            >
                              {getScopeLabel(scope)}
                            </Badge>
                          ))}
                          {key.scopes.length > 3 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs cursor-default">
                                  +{key.scopes.length - 3}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="flex flex-col gap-1">
                                  {key.scopes.slice(3).map((s) => (
                                    <span key={s} className="text-xs">{getScopeLabel(s)}</span>
                                  ))}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm ${key.expiresAt && new Date(key.expiresAt) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {formatExpiration(key.expiresAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {key.lastUsedAt ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm text-muted-foreground flex items-center gap-1 cursor-default">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                {formatDistanceToNow(new Date(key.lastUsedAt), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-1">
                                <p>{format(new Date(key.lastUsedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                                {key.lastUsedIp && <p>IP: {key.lastUsedIp}</p>}
                                <p>{key.usageCount} uso{key.usageCount !== 1 ? 's' : ''} no total</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-sm text-muted-foreground">Nunca</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {key.isActive ? (
                          <Badge className="bg-green-600 hover:bg-green-600/80 text-white">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Revogada</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`Ações para ${key.name}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {key.isActive && (
                              <>
                                <DropdownMenuItem onClick={() => setEditKey(key)}>
                                  <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    setConfirmAction({
                                      type: 'revoke',
                                      keyId: key.id,
                                      keyName: key.name,
                                    })
                                  }
                                  className="text-yellow-600"
                                >
                                  <Ban className="h-4 w-4 mr-2" aria-hidden="true" />
                                  Revogar
                                </DropdownMenuItem>
                              </>
                            )}
                            {!key.isActive && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmAction({
                                    type: 'delete',
                                    keyId: key.id,
                                    keyName: key.name,
                                  })
                                }
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                                Deletar permanentemente
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-16 border rounded-lg" role="status">
              <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" aria-hidden="true" />
              <h3 className="text-lg font-medium mb-1">
                {statusFilter === 'all'
                  ? 'Nenhuma API Key criada ainda'
                  : statusFilter === 'active'
                    ? 'Nenhuma API Key ativa'
                    : 'Nenhuma API Key revogada'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {statusFilter === 'all'
                  ? 'Crie a primeira chave da organização para acessar a API via CLI ou MCP.'
                  : 'Nenhuma chave encontrada com este filtro.'}
              </p>
              {statusFilter === 'all' && (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  Criar API Key
                </Button>
              )}
            </div>
          )}
        </div>

        <CreateApiKeyDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

        {editKey && (
          <EditApiKeyDialog
            open={editKey !== null}
            onOpenChange={(open) => { if (!open) setEditKey(null) }}
            apiKey={editKey}
          />
        )}

        <AlertDialog
          open={confirmAction !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction?.type === 'revoke' ? 'Revogar API Key' : 'Deletar API Key'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction?.type === 'revoke'
                  ? `Tem certeza que deseja revogar a chave "${confirmAction?.keyName}"? Ela deixará de funcionar imediatamente. Chaves revogadas podem ser deletadas permanentemente depois.`
                  : `Tem certeza que deseja deletar a chave "${confirmAction?.keyName}" permanentemente? Esta ação não pode ser desfeita.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmAction}
                disabled={revokeMutation.isPending || deleteMutation.isPending}
                className={
                  confirmAction?.type === 'delete'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : ''
                }
              >
                {(revokeMutation.isPending || deleteMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                )}
                {confirmAction?.type === 'revoke' ? 'Revogar' : 'Deletar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    </TooltipProvider>
  )
}
