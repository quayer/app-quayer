'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Key,
  Plus,
  Loader2,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Badge } from '@/client/components/ui/badge'
import { Skeleton } from '@/client/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/client/components/ui/collapsible'
import { SidebarTrigger } from '@/client/components/ui/sidebar'
import { Separator } from '@/client/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/client/components/ui/breadcrumb'

// ==========================================
// Types
// ==========================================

interface ScimToken {
  id: string
  name: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

// ==========================================
// Helper
// ==========================================

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error || json?.message || `Erro ${res.status}`)
  }
  return json
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Nunca'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Agora'
  if (diffMins < 60) return `${diffMins}min atras`
  if (diffHours < 24) return `${diffHours}h atras`
  if (diffDays < 30) return `${diffDays}d atras`
  return date.toLocaleDateString('pt-BR')
}

function getTokenStatus(token: ScimToken): {
  label: string
  variant: 'default' | 'destructive' | 'secondary' | 'outline'
  className?: string
} {
  if (token.revokedAt) {
    return { label: 'Revogado', variant: 'destructive' }
  }
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) {
    return { label: 'Expirado', variant: 'secondary' }
  }
  return { label: 'Ativo', variant: 'default', className: 'bg-green-600 hover:bg-green-600' }
}

// ==========================================
// Create Token Dialog
// ==========================================

function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [expiration, setExpiration] = useState('never')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generatedToken, setGeneratedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setExpiration('never')
      setGeneratedToken(null)
      setCopied(false)
    }
  }, [open])

  const getExpiresAt = (): string | undefined => {
    if (expiration === 'never') return undefined
    const now = new Date()
    switch (expiration) {
      case '30d':
        now.setDate(now.getDate() + 30)
        return now.toISOString()
      case '90d':
        now.setDate(now.getDate() + 90)
        return now.toISOString()
      case '180d':
        now.setDate(now.getDate() + 180)
        return now.toISOString()
      case '365d':
        now.setDate(now.getDate() + 365)
        return now.toISOString()
      default:
        return undefined
    }
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome do token')
      return
    }

    setIsSubmitting(true)
    try {
      const expiresAt = getExpiresAt()
      const json = await apiFetch('/api/v1/scim-tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          ...(expiresAt ? { expiresAt } : {}),
        }),
      })
      const data = json?.data || json
      setGeneratedToken(data.token)
      onCreated()
      toast.success('Token SCIM criado com sucesso')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar token'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyToken = async () => {
    if (generatedToken) {
      await navigator.clipboard.writeText(generatedToken)
      setCopied(true)
      toast.success('Token copiado para a area de transferencia')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!generatedToken) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Gerar Token SCIM</DialogTitle>
          <DialogDescription>
            Crie um token de autenticacao para integrar seu Identity Provider (IdP) via SCIM 2.0.
          </DialogDescription>
        </DialogHeader>

        {!generatedToken ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="token-name">Nome do token</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Okta Production, Azure AD Sync"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Um nome descritivo para identificar este token.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Expiracao</Label>
              <Select value={expiration} onValueChange={setExpiration} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Sem expiracao</SelectItem>
                  <SelectItem value="30d">30 dias</SelectItem>
                  <SelectItem value="90d">90 dias</SelectItem>
                  <SelectItem value="180d">180 dias</SelectItem>
                  <SelectItem value="365d">1 ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Este token nao sera mostrado novamente. Copie agora.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Token SCIM</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted p-3 text-xs font-mono break-all select-all max-h-24 overflow-auto">
                  {generatedToken}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={handleCopyToken}
                  title="Copiar token"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!generatedToken ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar Token
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================
// Revoke Token Dialog
// ==========================================

function RevokeTokenDialog({
  open,
  onOpenChange,
  token,
  onRevoked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: ScimToken | null
  onRevoked: () => void
}) {
  const [isRevoking, setIsRevoking] = useState(false)

  const handleRevoke = async () => {
    if (!token) return
    setIsRevoking(true)
    try {
      await apiFetch(`/api/v1/scim-tokens/${token.id}/revoke`, {
        method: 'POST',
      })
      toast.success('Token revogado com sucesso')
      onOpenChange(false)
      onRevoked()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao revogar token'
      toast.error(message)
    } finally {
      setIsRevoking(false)
    }
  }

  if (!token) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revogar token &quot;{token.name}&quot;</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja revogar este token? Qualquer integracao SCIM que utilize este
            token deixara de funcionar imediatamente. Esta acao nao pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRevoking}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRevoke}
            disabled={isRevoking}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRevoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Revogar Token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ==========================================
// IdP Instructions Section
// ==========================================

function IdpInstructionsSection({ scimBaseUrl }: { scimBaseUrl: string }) {
  const [copiedUrl, setCopiedUrl] = useState(false)

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(scimBaseUrl)
    setCopiedUrl(true)
    toast.success('URL copiada para a area de transferencia')
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Configuracao do IdP</CardTitle>
        <CardDescription>
          Use as informacoes abaixo para configurar o SCIM provisioning no seu Identity Provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* SCIM Base URL */}
        <div className="space-y-2">
          <Label>SCIM Base URL</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted p-2.5 text-sm font-mono break-all select-all">
              {scimBaseUrl}
            </code>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleCopyUrl}
              title="Copiar URL"
            >
              {copiedUrl ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">Autenticacao:</span>
            <p className="text-muted-foreground">Bearer Token (OAuth Bearer)</p>
          </div>
          <div>
            <span className="font-medium">Operacoes suportadas:</span>
            <p className="text-muted-foreground">Users (create, update, deactivate)</p>
          </div>
        </div>

        <Separator />

        {/* Okta Instructions */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-3 h-10">
              <span className="flex items-center gap-2 text-sm font-medium">
                <ExternalLink className="h-4 w-4" />
                Configurar no Okta
              </span>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground mt-2">
              <li>No Okta Admin, va em Applications &gt; Applications</li>
              <li>Selecione sua aplicacao ou crie uma nova (SAML 2.0 ou OIDC)</li>
              <li>Na aba &quot;Provisioning&quot;, clique em &quot;Configure API Integration&quot;</li>
              <li>Marque &quot;Enable API Integration&quot;</li>
              <li>Em &quot;Base URL&quot;, cole: <code className="bg-muted px-1 rounded text-xs">{scimBaseUrl}</code></li>
              <li>Em &quot;API Token&quot;, cole o token SCIM gerado acima</li>
              <li>Clique em &quot;Test API Credentials&quot; e depois &quot;Save&quot;</li>
              <li>Habilite &quot;To App&quot;: Create Users, Update User Attributes, Deactivate Users</li>
            </ol>
          </CollapsibleContent>
        </Collapsible>

        {/* Azure AD Instructions */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-3 h-10">
              <span className="flex items-center gap-2 text-sm font-medium">
                <ExternalLink className="h-4 w-4" />
                Configurar no Azure AD (Entra ID)
              </span>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground mt-2">
              <li>No Azure Portal, va em Enterprise Applications</li>
              <li>Selecione sua aplicacao</li>
              <li>No menu lateral, clique em &quot;Provisioning&quot;</li>
              <li>Defina Provisioning Mode como &quot;Automatic&quot;</li>
              <li>Em &quot;Tenant URL&quot;, cole: <code className="bg-muted px-1 rounded text-xs">{scimBaseUrl}</code></li>
              <li>Em &quot;Secret Token&quot;, cole o token SCIM gerado acima</li>
              <li>Clique em &quot;Test Connection&quot; para validar</li>
              <li>Configure os mapeamentos de atributos conforme necessario</li>
              <li>Defina o Status como &quot;On&quot; e salve</li>
            </ol>
          </CollapsibleContent>
        </Collapsible>

        {/* Google Workspace Instructions */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-3 h-10">
              <span className="flex items-center gap-2 text-sm font-medium">
                <ExternalLink className="h-4 w-4" />
                Configurar no Google Workspace
              </span>
              <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-3">
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground mt-2">
              <li>No Google Admin Console, va em Apps &gt; Web and mobile apps</li>
              <li>Selecione sua aplicacao SAML</li>
              <li>Na secao &quot;Auto-provisioning&quot;, clique em &quot;Set up auto-provisioning&quot;</li>
              <li>Em &quot;Endpoint URL&quot;, cole: <code className="bg-muted px-1 rounded text-xs">{scimBaseUrl}</code></li>
              <li>Em &quot;Access token&quot;, cole o token SCIM gerado acima</li>
              <li>Configure os mapeamentos de atributos</li>
              <li>Ative o auto-provisioning</li>
            </ol>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

// ==========================================
// Main Page Component
// ==========================================

export default function ScimTokensPage() {
  const [tokens, setTokens] = useState<ScimToken[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [revokeToken, setRevokeToken] = useState<ScimToken | null>(null)

  // Derive SCIM base URL from current window location
  const scimBaseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/scim/v2`
    : '/api/scim/v2'

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const json = await apiFetch('/api/v1/scim-tokens')
      const data = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
      setTokens(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao carregar tokens'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeTokens = tokens.filter((t) => !t.revokedAt && (!t.expiresAt || new Date(t.expiresAt) >= new Date()))
  const inactiveTokens = tokens.filter((t) => t.revokedAt || (t.expiresAt && new Date(t.expiresAt) < new Date()))

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin">Administracao</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>SCIM Provisioning</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">SCIM Provisioning</h2>
            <p className="text-muted-foreground mt-1">
              Gerencie tokens SCIM para provisionar usuarios automaticamente a partir do seu Identity Provider.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Gerar Token SCIM
          </Button>
        </div>

        {/* Error State */}
        {error && !isLoading && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive text-sm">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={loadData}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && tokens.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum token SCIM criado</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Gere um token SCIM para conectar seu Identity Provider (Okta, Azure AD, Google Workspace)
                e provisionar usuarios automaticamente.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Gerar primeiro token
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Active Tokens */}
        {!isLoading && !error && activeTokens.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Tokens Ativos ({activeTokens.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead>Ultimo uso</TableHead>
                      <TableHead>Expiracao</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeTokens.map((token) => {
                      const status = getTokenStatus(token)
                      return (
                        <TableRow key={token.id}>
                          <TableCell>
                            <span className="font-medium">{token.name}</span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(token.createdAt).toLocaleDateString('pt-BR')}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {relativeTime(token.lastUsedAt)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {token.expiresAt
                              ? new Date(token.expiresAt).toLocaleDateString('pt-BR')
                              : 'Sem expiracao'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant} className={status.className}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setRevokeToken(token)}
                            >
                              <XCircle className="mr-1 h-4 w-4" />
                              Revogar
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inactive Tokens (revoked/expired) */}
        {!isLoading && !error && inactiveTokens.length > 0 && (
          <Collapsible>
            <Card>
              <CardHeader>
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 w-full text-left">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      Tokens Inativos ({inactiveTokens.length})
                    </CardTitle>
                    <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200" />
                  </button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Criado em</TableHead>
                          <TableHead>Ultimo uso</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inactiveTokens.map((token) => {
                          const status = getTokenStatus(token)
                          return (
                            <TableRow key={token.id} className="opacity-60">
                              <TableCell>
                                <span className="font-medium">{token.name}</span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(token.createdAt).toLocaleDateString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {relativeTime(token.lastUsedAt)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={status.variant}>
                                  {status.label}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* IdP Instructions — always show */}
        {!isLoading && !error && (
          <IdpInstructionsSection scimBaseUrl={scimBaseUrl} />
        )}
      </div>

      {/* Dialogs */}
      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadData}
      />
      <RevokeTokenDialog
        open={revokeToken !== null}
        onOpenChange={(open) => { if (!open) setRevokeToken(null) }}
        token={revokeToken}
        onRevoked={loadData}
      />
    </>
  )
}
