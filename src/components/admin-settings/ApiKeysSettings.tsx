'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Key, Plus, Copy, Trash2, AlertTriangle, Check, Eye, EyeOff, RefreshCw, Clock, Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { api } from '@/igniter.client'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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
  key?: string // Only present on creation
}

const EXPIRATION_OPTIONS = [
  { value: 'never', label: 'Nunca expira' },
  { value: '30d', label: '30 dias' },
  { value: '60d', label: '60 dias' },
  { value: '90d', label: '90 dias' },
  { value: '180d', label: '6 meses' },
  { value: '365d', label: '1 ano' },
]

const SCOPE_OPTIONS = [
  { value: 'read', label: 'Leitura', description: 'Acesso de leitura geral' },
  { value: 'write', label: 'Escrita', description: 'Acesso de escrita geral' },
  { value: 'instances:read', label: 'Instancias (Leitura)', description: 'Listar e visualizar instancias' },
  { value: 'instances:write', label: 'Instancias (Escrita)', description: 'Criar e gerenciar instancias' },
  { value: 'messages:read', label: 'Mensagens (Leitura)', description: 'Ler mensagens' },
  { value: 'messages:write', label: 'Mensagens (Escrita)', description: 'Enviar mensagens' },
  { value: 'contacts:read', label: 'Contatos (Leitura)', description: 'Listar e visualizar contatos' },
  { value: 'contacts:write', label: 'Contatos (Escrita)', description: 'Criar e editar contatos' },
  { value: 'webhooks:manage', label: 'Webhooks', description: 'Gerenciar webhooks' },
  { value: 'sessions:read', label: 'Sessoes (Leitura)', description: 'Visualizar sessoes de chat' },
  { value: 'sessions:write', label: 'Sessoes (Escrita)', description: 'Gerenciar sessoes de chat' },
]

export function ApiKeysSettings() {
  const queryClient = useQueryClient()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newKeyData, setNewKeyData] = useState<ApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [expiration, setExpiration] = useState('never')
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read', 'write'])

  // Fetch API keys
  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const result = await (api['api-keys'].list as any).query()
      return result.data as ApiKey[]
    },
  })

  // Create API key
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; expiration: string; scopes: string[] }) => {
      return (api['api-keys'].create as any).mutate({ body: data })
    },
    onSuccess: (result: any) => {
      setNewKeyData(result.data)
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API Key criada com sucesso!')
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  // Revoke API key
  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      return (api['api-keys'].revoke as any).mutate({ params: { id } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API Key revogada!')
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  // Delete API key
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return (api['api-keys'].delete as any).mutate({ params: { id } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('API Key deletada!')
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Nome e obrigatorio')
      return
    }
    createMutation.mutate({ name, expiration, scopes: selectedScopes })
  }

  const handleCopyKey = () => {
    if (newKeyData?.key) {
      navigator.clipboard.writeText(newKeyData.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Chave copiada!')
    }
  }

  const resetForm = () => {
    setName('')
    setExpiration('never')
    setSelectedScopes(['read', 'write'])
    setNewKeyData(null)
    setShowKey(false)
    setCopied(false)
  }

  const handleCloseDialog = () => {
    setIsCreateOpen(false)
    resetForm()
  }

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div role="status" aria-busy="true" aria-label="Carregando API Keys">
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Carregando API Keys...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" aria-hidden="true" />
                API Keys
              </CardTitle>
              <CardDescription>
                Gerencie chaves de API para acesso programatico a plataforma.
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={(open) => {
              if (!open) handleCloseDialog()
              else setIsCreateOpen(true)
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                  Nova API Key
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>
                    {newKeyData ? 'API Key Criada!' : 'Criar Nova API Key'}
                  </DialogTitle>
                  <DialogDescription>
                    {newKeyData
                      ? 'Copie sua chave agora. Ela nao sera mostrada novamente.'
                      : 'Configure sua nova chave de API para acesso programatico.'}
                  </DialogDescription>
                </DialogHeader>

                {newKeyData ? (
                  <div className="space-y-4">
                    <Alert variant="destructive" role="alert">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      <AlertTitle>Importante!</AlertTitle>
                      <AlertDescription>
                        Esta e a unica vez que voce vera a chave completa.
                        Copie e guarde em local seguro.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <Label id="api-key-label">Sua API Key</Label>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            readOnly
                            type={showKey ? 'text' : 'password'}
                            value={newKeyData.key}
                            className="font-mono pr-10"
                            aria-labelledby="api-key-label"
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
                            {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                          </Button>
                        </div>
                        <Button onClick={handleCopyKey} variant="outline" aria-label={copied ? 'Copiado!' : 'Copiar chave'}>
                          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Nome:</span>
                        <p className="font-medium">{newKeyData.name}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Expiracao:</span>
                        <p className="font-medium">
                          {newKeyData.expiresAt
                            ? new Date(newKeyData.expiresAt).toLocaleDateString('pt-BR')
                            : 'Nunca'}
                        </p>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button onClick={handleCloseDialog}>
                        Fechar
                      </Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="api-key-name">Nome da Chave</Label>
                      <Input
                        id="api-key-name"
                        placeholder="Ex: Servidor de Producao"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        aria-describedby="api-key-name-hint"
                      />
                      <p id="api-key-name-hint" className="text-xs text-muted-foreground">
                        Um nome descritivo para identificar onde esta chave sera usada.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label id="expiration-label">Expiracao</Label>
                      <Select value={expiration} onValueChange={setExpiration}>
                        <SelectTrigger aria-labelledby="expiration-label">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPIRATION_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Permissoes (Scopes)</legend>
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded-md p-3" role="group" aria-label="Selecione as permissões da API Key">
                        {SCOPE_OPTIONS.map((scope) => (
                          <div key={scope.value} className="flex items-start space-x-2">
                            <Checkbox
                              id={scope.value}
                              checked={selectedScopes.includes(scope.value)}
                              onCheckedChange={() => toggleScope(scope.value)}
                            />
                            <div className="grid gap-0.5 leading-none">
                              <label
                                htmlFor={scope.value}
                                className="text-sm font-medium cursor-pointer"
                              >
                                {scope.label}
                              </label>
                              <p className="text-xs text-muted-foreground">
                                {scope.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </fieldset>

                    <DialogFooter>
                      <Button variant="outline" onClick={handleCloseDialog}>
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
                            <span>Criando...</span>
                          </>
                        ) : (
                          <>
                            <Key className="h-4 w-4 mr-2" aria-hidden="true" />
                            <span>Criar API Key</span>
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4" role="note">
            <Shield className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Como usar API Keys</AlertTitle>
            <AlertDescription>
              Use o header <code className="bg-muted px-1 rounded">Authorization: Bearer qk_live_xxx</code> ou{' '}
              <code className="bg-muted px-1 rounded">X-API-Key: qk_live_xxx</code> em suas requisicoes.
            </AlertDescription>
          </Alert>

          {apiKeys && apiKeys.length > 0 ? (
            <Table aria-label="Lista de API Keys">
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Ultimo Uso</TableHead>
                  <TableHead>Expiracao</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {key.prefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.slice(0, 2).map((scope) => (
                          <Badge key={scope} variant="secondary" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                        {key.scopes.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{key.scopes.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {key.lastUsedAt ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(key.lastUsedAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Nunca</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {key.expiresAt ? (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          <span className="text-sm">
                            {new Date(key.expiresAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="outline">Nunca</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {key.isActive ? (
                        <Badge variant="default" className="bg-green-500">Ativa</Badge>
                      ) : (
                        <Badge variant="destructive">Revogada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {key.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm('Tem certeza que deseja revogar esta API Key?')) {
                                revokeMutation.mutate(key.id)
                              }
                            }}
                            aria-label={`Revogar API Key ${key.name}`}
                          >
                            <AlertTriangle className="h-4 w-4 text-yellow-500" aria-hidden="true" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm('Tem certeza que deseja deletar esta API Key permanentemente?')) {
                              deleteMutation.mutate(key.id)
                            }
                          }}
                          aria-label={`Deletar API Key ${key.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground" role="status">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden="true" />
              <p>Nenhuma API Key criada ainda.</p>
              <p className="text-sm">Crie sua primeira chave para acessar a API programaticamente.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
