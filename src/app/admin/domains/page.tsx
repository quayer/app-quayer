'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Globe,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  Copy,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Badge } from '@/client/components/ui/badge'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Switch } from '@/client/components/ui/switch'
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
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/client/components/ui/input-otp'
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

interface VerifiedDomain {
  id: string
  organizationId: string
  domain: string
  verificationMethod: string
  verificationToken: string
  verifiedAt: string | null
  autoJoin: boolean
  defaultRoleId: string | null
  defaultRole: { id: string; name: string; slug: string } | null
  createdAt: string
}

interface CustomRole {
  id: string
  name: string
  slug: string
  isSystem: boolean
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

// ==========================================
// Add Domain Dialog
// ==========================================

function AddDomainDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}) {
  const [domain, setDomain] = useState('')
  const [method, setMethod] = useState<'DNS_TXT' | 'EMAIL'>('DNS_TXT')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Result state after domain is added
  const [result, setResult] = useState<{
    id: string
    domain: string
    verificationToken?: string
    instructions: string
    verificationMethod: string
  } | null>(null)

  useEffect(() => {
    if (open) {
      setDomain('')
      setMethod('DNS_TXT')
      setResult(null)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!domain.trim()) {
      toast.error('Informe o dominio')
      return
    }

    setIsSubmitting(true)
    try {
      const json = await apiFetch('/api/v1/verified-domains', {
        method: 'POST',
        body: JSON.stringify({ domain: domain.trim().toLowerCase(), method }),
      })
      const data = json?.data || json
      setResult(data)
      onAdded()
      toast.success('Dominio adicionado com sucesso')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao adicionar dominio')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyToken = () => {
    if (result?.verificationToken) {
      navigator.clipboard.writeText(result.verificationToken)
      toast.success('Token copiado para a area de transferencia')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Adicionar Dominio</DialogTitle>
          <DialogDescription>
            Adicione um dominio corporativo para verificar a propriedade e habilitar auto-join.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="domain-input">Dominio</Label>
              <Input
                id="domain-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="exemplo.com.br"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Dominios de provedores genericos (gmail.com, hotmail.com, etc.) nao sao aceitos.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Metodo de Verificacao</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                    method === 'DNS_TXT'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={() => setMethod('DNS_TXT')}
                  disabled={isSubmitting}
                >
                  <span className="text-sm font-medium">DNS TXT</span>
                  <span className="text-xs text-muted-foreground">
                    Adicione um registro TXT no DNS do seu dominio
                  </span>
                </button>
                <button
                  type="button"
                  className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                    method === 'EMAIL'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={() => setMethod('EMAIL')}
                  disabled={isSubmitting}
                >
                  <span className="text-sm font-medium">Email</span>
                  <span className="text-xs text-muted-foreground">
                    Receba um codigo de verificacao em admin@dominio
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {result.verificationMethod === 'DNS_TXT' ? (
              <>
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium">
                    Adicione o seguinte registro TXT no DNS do seu dominio:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted p-2 text-xs font-mono break-all select-all">
                      {result.verificationToken}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={handleCopyToken}
                      title="Copiar token"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Tipo:</strong> TXT</p>
                    <p><strong>Host/Nome:</strong> @ (ou dominio raiz)</p>
                    <p><strong>Valor:</strong> o token acima</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Apos adicionar o registro, aguarde a propagacao do DNS (pode levar ate 72h) e clique em &quot;Verificar Agora&quot; na lista de dominios.
                </p>
              </>
            ) : (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <p className="text-sm font-medium">
                  Email de verificacao enviado para:
                </p>
                <p className="text-sm font-mono text-primary">
                  admin@{result.domain}
                </p>
                <p className="text-xs text-muted-foreground">
                  Insira o codigo de 6 digitos recebido no email usando o botao &quot;Verificar&quot; na lista de dominios. O codigo expira em 30 minutos.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting || !domain.trim()}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Adicionar Dominio
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
// DNS Verify Dialog
// ==========================================

function DnsVerifyDialog({
  open,
  onOpenChange,
  domain,
  onVerified,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domain: VerifiedDomain | null
  onVerified: () => void
}) {
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
    }
  }, [open])

  const handleCopyToken = () => {
    if (domain?.verificationToken) {
      navigator.clipboard.writeText(domain.verificationToken)
      toast.success('Token copiado para a area de transferencia')
    }
  }

  const handleVerify = async () => {
    if (!domain) return
    setIsVerifying(true)
    setError(null)
    try {
      await apiFetch('/api/v1/verified-domains/verify-dns', {
        method: 'POST',
        body: JSON.stringify({ domainId: domain.id }),
      })
      toast.success('Dominio verificado com sucesso via DNS TXT')
      onVerified()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar DNS')
    } finally {
      setIsVerifying(false)
    }
  }

  if (!domain) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Verificar DNS — {domain.domain}</DialogTitle>
          <DialogDescription>
            Verifique se o registro TXT foi adicionado corretamente no DNS do seu dominio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">
              Registro TXT esperado:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted p-2 text-xs font-mono break-all select-all">
                {domain.verificationToken}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleCopyToken}
                title="Copiar token"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isVerifying}>
            Cancelar
          </Button>
          <Button onClick={handleVerify} disabled={isVerifying}>
            {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verificar Agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================
// Email Verify Dialog
// ==========================================

function EmailVerifyDialog({
  open,
  onOpenChange,
  domain,
  onVerified,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domain: VerifiedDomain | null
  onVerified: () => void
}) {
  const [code, setCode] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCode('')
      setError(null)
    }
  }, [open])

  const handleVerify = async () => {
    if (!domain || code.length !== 6) return
    setIsVerifying(true)
    setError(null)
    try {
      await apiFetch('/api/v1/verified-domains/verify-email', {
        method: 'POST',
        body: JSON.stringify({ domainId: domain.id, code }),
      })
      toast.success('Dominio verificado com sucesso via email')
      onVerified()
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar codigo')
    } finally {
      setIsVerifying(false)
    }
  }

  if (!domain) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Verificar Email — {domain.domain}</DialogTitle>
          <DialogDescription>
            Insira o codigo de 6 digitos enviado para admin@{domain.domain}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-muted-foreground">
              Email enviado para <span className="font-mono text-primary">admin@{domain.domain}</span>
            </p>
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => setCode(value)}
              onComplete={() => {
                // auto-submit will be triggered by effect
              }}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            O codigo expira em 30 minutos. Se nao recebeu, remova o dominio e adicione novamente.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isVerifying}>
            Cancelar
          </Button>
          <Button onClick={handleVerify} disabled={isVerifying || code.length !== 6}>
            {isVerifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==========================================
// Remove Domain Dialog
// ==========================================

function RemoveDomainDialog({
  open,
  onOpenChange,
  domain,
  onRemoved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  domain: VerifiedDomain | null
  onRemoved: () => void
}) {
  const [isRemoving, setIsRemoving] = useState(false)

  const handleRemove = async () => {
    if (!domain) return
    setIsRemoving(true)
    try {
      await apiFetch(`/api/v1/verified-domains/${domain.id}`, {
        method: 'DELETE',
      })
      toast.success('Dominio removido com sucesso')
      onOpenChange(false)
      onRemoved()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover dominio')
    } finally {
      setIsRemoving(false)
    }
  }

  if (!domain) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover dominio &quot;{domain.domain}&quot;</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja remover este dominio? Membros existentes nao serao afetados,
            mas novos usuarios com este dominio nao serao mais adicionados automaticamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRemove}
            disabled={isRemoving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ==========================================
// Domain Settings Row (auto-join toggle + default role)
// ==========================================

function DomainSettingsRow({
  domain,
  roles,
  onUpdated,
}: {
  domain: VerifiedDomain
  roles: CustomRole[]
  onUpdated: () => void
}) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handleToggleAutoJoin = async () => {
    setIsUpdating(true)
    try {
      await apiFetch(`/api/v1/verified-domains/${domain.id}`, {
        method: 'PUT',
        body: JSON.stringify({ autoJoin: !domain.autoJoin }),
      })
      toast.success(
        domain.autoJoin
          ? 'Auto-join desabilitado'
          : 'Auto-join habilitado'
      )
      onUpdated()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar dominio')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleRoleChange = async (roleId: string) => {
    setIsUpdating(true)
    try {
      await apiFetch(`/api/v1/verified-domains/${domain.id}`, {
        method: 'PUT',
        body: JSON.stringify({ defaultRoleId: roleId === 'none' ? null : roleId }),
      })
      toast.success('Role padrao atualizado')
      onUpdated()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar role')
    } finally {
      setIsUpdating(false)
    }
  }

  if (!domain.verifiedAt) return null

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Switch
          checked={domain.autoJoin}
          onCheckedChange={handleToggleAutoJoin}
          disabled={isUpdating}
          aria-label="Habilitar auto-join"
        />
        <span className="text-xs text-muted-foreground">Auto-join</span>
      </div>
      <Select
        value={domain.defaultRoleId || 'none'}
        onValueChange={handleRoleChange}
        disabled={isUpdating}
      >
        <SelectTrigger className="h-8 w-[160px]" aria-label="Role padrao">
          <SelectValue placeholder="Role padrao" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Padrao (user)</SelectItem>
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.name} {role.isSystem ? '(Sistema)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ==========================================
// Main Page Component
// ==========================================

export default function VerifiedDomainsPage() {
  const [domains, setDomains] = useState<VerifiedDomain[]>([])
  const [roles, setRoles] = useState<CustomRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog states
  const [addOpen, setAddOpen] = useState(false)
  const [dnsVerifyDomain, setDnsVerifyDomain] = useState<VerifiedDomain | null>(null)
  const [emailVerifyDomain, setEmailVerifyDomain] = useState<VerifiedDomain | null>(null)
  const [removeDomain, setRemoveDomain] = useState<VerifiedDomain | null>(null)

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [domainsJson, rolesJson] = await Promise.all([
        apiFetch('/api/v1/verified-domains'),
        apiFetch('/api/v1/custom-roles'),
      ])

      const domainsData = Array.isArray(domainsJson?.data) ? domainsJson.data : Array.isArray(domainsJson) ? domainsJson : []
      const rolesData = Array.isArray(rolesJson?.data) ? rolesJson.data : Array.isArray(rolesJson) ? rolesJson : []

      setDomains(domainsData)
      setRoles(rolesData)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dominios')
      toast.error(err.message || 'Erro ao carregar dominios')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleVerifyClick = (domain: VerifiedDomain) => {
    if (domain.verificationMethod === 'DNS_TXT') {
      setDnsVerifyDomain(domain)
    } else {
      setEmailVerifyDomain(domain)
    }
  }

  const handleRemoveClick = (domain: VerifiedDomain) => {
    setRemoveDomain(domain)
  }

  const pendingDomains = domains.filter((d) => !d.verifiedAt)
  const verifiedDomains = domains.filter((d) => d.verifiedAt)

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
              <BreadcrumbPage>Dominios Verificados</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Dominios Verificados</h2>
            <p className="text-muted-foreground mt-1">
              Verifique a propriedade dos dominios da sua organizacao para habilitar auto-join de novos membros.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Dominio
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
        {!isLoading && !error && domains.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum dominio adicionado</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Adicione e verifique dominios corporativos para que novos usuarios com esses
                dominios de email sejam automaticamente adicionados a sua organizacao.
              </p>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar primeiro dominio
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Pending Domains */}
        {!isLoading && !error && pendingDomains.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Pendentes de Verificacao
            </h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Adicionado em</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingDomains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell>
                        <span className="font-medium font-mono">{domain.domain}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {domain.verificationMethod === 'DNS_TXT' ? 'DNS TXT' : 'Email'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pendente
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(domain.createdAt).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVerifyClick(domain)}
                          >
                            Verificar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveClick(domain)}
                            title="Remover dominio"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Verified Domains */}
        {!isLoading && !error && verifiedDomains.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Dominios Verificados
            </h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dominio</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Verificado em</TableHead>
                    <TableHead>Configuracoes</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verifiedDomains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell>
                        <span className="font-medium font-mono">{domain.domain}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            Verificado
                          </Badge>
                          {domain.autoJoin && (
                            <Badge variant="outline" className="gap-1">
                              <ToggleRight className="h-3 w-3" />
                              Auto-join
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {domain.verifiedAt
                          ? new Date(domain.verifiedAt).toLocaleDateString('pt-BR')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <DomainSettingsRow
                          domain={domain}
                          roles={roles}
                          onUpdated={loadData}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveClick(domain)}
                          title="Remover dominio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AddDomainDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={loadData}
      />
      <DnsVerifyDialog
        open={dnsVerifyDomain !== null}
        onOpenChange={(open) => { if (!open) setDnsVerifyDomain(null) }}
        domain={dnsVerifyDomain}
        onVerified={loadData}
      />
      <EmailVerifyDialog
        open={emailVerifyDomain !== null}
        onOpenChange={(open) => { if (!open) setEmailVerifyDomain(null) }}
        domain={emailVerifyDomain}
        onVerified={loadData}
      />
      <RemoveDomainDialog
        open={removeDomain !== null}
        onOpenChange={(open) => { if (!open) setRemoveDomain(null) }}
        domain={removeDomain}
        onRemoved={loadData}
      />
    </>
  )
}
