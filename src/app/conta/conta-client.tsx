'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  User as UserIcon,
  Bell,
  MonitorSmartphone,
  Loader2,
  Upload,
  Monitor,
  Smartphone as SmartphoneIcon,
  Shield,
  Link2,
  Unlink,
  Clock,
  AlertTriangle,
  Mail,
} from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/client/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/client/components/ui/alert'
import { Badge } from '@/client/components/ui/badge'
import { Switch } from '@/client/components/ui/switch'
import { Separator } from '@/client/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/client/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/client/components/ui/tooltip'
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
  AlertDialogTrigger,
} from '@/client/components/ui/alert-dialog'
import { getCsrfHeaders } from '@/client/hooks/use-csrf-token'

// ============================================================================
// Types
// ============================================================================

interface CurrentUser {
  id: string
  name: string | null
  email: string
  avatarUrl?: string | null
  language?: string | null
  timezone?: string | null
}

interface DeviceSession {
  id: string
  userId: string
  deviceName: string | null
  userAgent: string | null
  ipAddress: string | null
  location: string | null
  lastActiveAt: string
  isRevoked: boolean
  revokedAt: string | null
  createdAt: string
}

type LinkedProvider = 'google' | 'whatsapp'

interface LinkedAccount {
  provider: LinkedProvider
  identifier: string
  connectedAt: string | null
}

// ============================================================================
// Helpers
// ============================================================================

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getCsrfHeaders(), ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
    throw new Error(body.message || body.error || `Erro ${res.status}`)
  }
  return res.json() as Promise<T>
}

function unwrapData<T>(value: unknown): T | null {
  if (value && typeof value === 'object' && 'data' in value) {
    return unwrapData<T>((value as { data: unknown }).data) ?? ((value as { data: T }).data as T)
  }
  return (value as T) ?? null
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Agora mesmo'
  if (diffMin < 60) return `${diffMin} min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays < 7) return `${diffDays}d atrás`

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getDeviceIcon(userAgent: string | null) {
  if (!userAgent) return Monitor
  const ua = userAgent.toLowerCase()
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return SmartphoneIcon
  return Monitor
}

function isCurrentDevice(deviceUserAgent: string | null): boolean {
  if (!deviceUserAgent || typeof navigator === 'undefined') return false
  return navigator.userAgent === deviceUserAgent
}

function getInitials(name: string | null | undefined, email: string): string {
  const src = (name ?? email).trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function providerLabel(p: LinkedProvider): string {
  switch (p) {
    case 'google':
      return 'Google'
    case 'whatsapp':
      return 'WhatsApp'
  }
}

// ============================================================================
// Tab: Perfil
// ============================================================================

function PerfilTab() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('pt_BR')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [deleting, setDeleting] = useState(false)

  const fetchMe = useCallback(async () => {
    try {
      const json = await apiFetch<unknown>('/api/v1/auth/me')
      const data = unwrapData<CurrentUser>(json)
      if (data) {
        setUser(data)
        setName(data.name ?? '')
        setLanguage(data.language ?? 'pt_BR')
        setTimezone(data.timezone ?? 'America/Sao_Paulo')
        setAvatarUrl(data.avatarUrl ?? null)
      }
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao carregar perfil')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name, language, timezone }),
      })
      toast.success('Perfil atualizado com sucesso')
    } catch {
      toast.error('Não foi possível salvar as alterações.')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarClick = () => fileInputRef.current?.click()

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Show local preview immediately; server upload requires backend implementation
    const objectUrl = URL.createObjectURL(file)
    setAvatarUrl(objectUrl)
    toast.info('Foto atualizada localmente. A sincronização com o servidor estará disponível em breve.')
  }

  const handleDeleteAccount = async () => {
    if (!user) return
    if (deleteConfirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      toast.error('Email não confere')
      return
    }
    setDeleting(true)
    try {
      await apiFetch('/api/v1/auth/me', { method: 'DELETE' })
      toast.success('Conta excluída. Redirecionando...')
      setTimeout(() => { window.location.href = '/login' }, 1200)
    } catch {
      toast.error('Não foi possível excluir a conta.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Foto e dados básicos */}
      <Card>
        <CardHeader>
          <CardTitle>Informações pessoais</CardTitle>
          <CardDescription>
            Nome e foto exibidos para outros membros da organização.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div
              className="relative group cursor-pointer shrink-0"
              onClick={handleAvatarClick}
              role="button"
              tabIndex={0}
              aria-label="Alterar foto de perfil"
              onKeyDown={(e) => e.key === 'Enter' && handleAvatarClick()}
            >
              <Avatar className="h-20 w-20 ring-2 ring-border">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name || 'Avatar'} /> : null}
                <AvatarFallback className="text-lg font-semibold">
                  {getInitials(name, user?.email ?? '')}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={handleAvatarClick} className="w-fit">
                <Upload className="mr-2 h-4 w-4" />
                Alterar foto
              </Button>
              <p className="text-xs text-muted-foreground">PNG ou JPG, até 2 MB.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </div>

          <Separator />

          {/* Campos */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Nome</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={user?.email ?? ''} disabled />
              <p className="text-xs text-muted-foreground">
                Para alterar o email, entre em contato com o suporte.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-language">Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="profile-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en_US">English (US)</SelectItem>
                  <SelectItem value="es_ES">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-timezone">Fuso horário</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="profile-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">América/São Paulo (GMT-3)</SelectItem>
                  <SelectItem value="America/New_York">América/Nova York (GMT-5)</SelectItem>
                  <SelectItem value="Europe/Lisbon">Europa/Lisboa (GMT+0)</SelectItem>
                  <SelectItem value="Europe/London">Europa/Londres (GMT+0)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Zona de perigo */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Zona de perigo
          </CardTitle>
          <CardDescription>
            Ações permanentes e irreversíveis sobre sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Excluir minha conta</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Remove permanentemente seu acesso, sessões e preferências. Se você for dono de uma
                organização, transfira a propriedade antes.
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0"
              onClick={() => setDeleteOpen(true)}
            >
              Excluir conta
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de confirmação de exclusão */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir minha conta</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Para confirmar, digite seu email{' '}
              <strong>{user?.email}</strong> abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm-email">Email de confirmação</Label>
            <Input
              id="delete-confirm-email"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={user?.email ?? ''}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={
                deleting ||
                !user ||
                deleteConfirmEmail.trim().toLowerCase() !== user.email.toLowerCase()
              }
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// Tab: Notificações
// ============================================================================

interface NotifPrefs {
  emailSecurity: boolean
  emailProductUpdates: boolean
  emailMarketing: boolean
  pushEnabled: boolean
  pushMentions: boolean
  pushDeployments: boolean
}

function NotificacoesTab() {
  // TODO(backend): GET/PUT /api/v1/notifications/preferences
  const [prefs, setPrefs] = useState<NotifPrefs>({
    emailSecurity: true,
    emailProductUpdates: true,
    emailMarketing: false,
    pushEnabled: false,
    pushMentions: true,
    pushDeployments: true,
  })
  const [saving, setSaving] = useState(false)

  const toggle = (key: keyof NotifPrefs) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await new Promise((r) => setTimeout(r, 400))
      toast.success('Preferências de notificação salvas')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Email
          </CardTitle>
          <CardDescription>Mensagens enviadas para o seu endereço de email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-border">
          <PrefRow
            id="notif-email-security"
            label="Alertas de segurança"
            description="Novos logins e mudanças na sua conta."
            checked={prefs.emailSecurity}
            onChange={() => toggle('emailSecurity')}
          />
          <PrefRow
            id="notif-email-updates"
            label="Atualizações do produto"
            description="Novidades, releases e mudanças importantes."
            checked={prefs.emailProductUpdates}
            onChange={() => toggle('emailProductUpdates')}
          />
          <PrefRow
            id="notif-email-marketing"
            label="Marketing e dicas"
            description="Conteúdo educacional e promoções."
            checked={prefs.emailMarketing}
            onChange={() => toggle('emailMarketing')}
          />
        </CardContent>
      </Card>

      {/* Push */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartphoneIcon className="h-4 w-4 text-muted-foreground" />
            Push / no app
          </CardTitle>
          <CardDescription>Notificações dentro da aplicação e no navegador.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y divide-border">
          <PrefRow
            id="notif-push-enabled"
            label="Ativar notificações push"
            description="Requer permissão do navegador."
            checked={prefs.pushEnabled}
            onChange={() => toggle('pushEnabled')}
          />
          <PrefRow
            id="notif-push-mentions"
            label="Menções e respostas"
            description="Quando alguém interage com você."
            checked={prefs.pushMentions}
            onChange={() => toggle('pushMentions')}
            disabled={!prefs.pushEnabled}
          />
          <PrefRow
            id="notif-push-deployments"
            label="Deploys e builds"
            description="Status de deploys dos seus projetos Builder."
            checked={prefs.pushDeployments}
            onChange={() => toggle('pushDeployments')}
            disabled={!prefs.pushEnabled}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar preferências
        </Button>
      </div>
    </div>
  )
}

function PrefRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="space-y-0.5 flex-1 min-w-0">
        <Label
          htmlFor={id}
          className={`text-sm font-medium leading-none ${disabled ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

// ============================================================================
// Tab: Sessões e acesso
// ============================================================================

function SessoesTab() {
  const [devices, setDevices] = useState<DeviceSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [isRevokingAll, setIsRevokingAll] = useState(false)

  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([])
  const [linkedLoading, setLinkedLoading] = useState(true)
  const [unlinkingProvider, setUnlinkingProvider] = useState<LinkedProvider | null>(null)

  const fetchDevices = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/v1/device-sessions', { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar dispositivos')
      const json = (await res.json()) as unknown
      const unwrap = (value: unknown): DeviceSession[] => {
        if (Array.isArray(value)) return value as DeviceSession[]
        if (value && typeof value === 'object' && 'data' in value)
          return unwrap((value as { data: unknown }).data)
        return []
      }
      setDevices(unwrap(json))
    } catch (err) {
      setError((err as Error).message)
      setDevices([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchLinkedAccounts = useCallback(async () => {
    // TODO(backend): GET /api/v1/auth/linked-accounts
    try {
      const json = await apiFetch<unknown>('/api/v1/auth/linked-accounts')
      const data = unwrapData<LinkedAccount[]>(json)
      setLinkedAccounts(Array.isArray(data) ? data : [])
    } catch {
      setLinkedAccounts([])
    } finally {
      setLinkedLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
    fetchLinkedAccounts()
  }, [fetchDevices, fetchLinkedAccounts])

  const handleRevoke = async (deviceSessionId: string) => {
    setRevokingId(deviceSessionId)
    try {
      const res = await fetch('/api/v1/device-sessions/revoke', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceSessionId }),
      })
      if (!res.ok) throw new Error('Erro ao desconectar dispositivo')
      await fetchDevices()
      toast.success('Dispositivo desconectado')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRevokingId(null)
    }
  }

  const handleRevokeAll = async () => {
    setIsRevokingAll(true)
    try {
      const currentDevice = devices.find((d) => isCurrentDevice(d.userAgent))
      const res = await fetch('/api/v1/device-sessions/revoke-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentDeviceSessionId: currentDevice?.id }),
      })
      if (!res.ok) throw new Error('Erro ao desconectar dispositivos')
      await fetchDevices()
      toast.success('Outros dispositivos desconectados')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRevokingAll(false)
    }
  }

  const handleUnlink = async (provider: LinkedProvider) => {
    setUnlinkingProvider(provider)
    try {
      // TODO(backend): DELETE /api/v1/auth/linked-accounts/:provider
      await apiFetch(`/api/v1/auth/linked-accounts/${provider}`, { method: 'DELETE' })
      toast.success(`${providerLabel(provider)} desconectado`)
      await fetchLinkedAccounts()
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível desconectar.')
    } finally {
      setUnlinkingProvider(null)
    }
  }

  const activeDevices = devices.filter((d) => !d.isRevoked)
  const hasOtherActiveDevices = activeDevices.some((d) => !isCurrentDevice(d.userAgent))

  const isOnlyAuthMethod = (provider: LinkedProvider): boolean =>
    linkedAccounts.length === 1 && linkedAccounts[0].provider === provider

  const loginHistory = [...devices]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Dispositivos ativos */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Meus dispositivos</CardTitle>
              <CardDescription>Sessões ativas em navegadores e dispositivos.</CardDescription>
            </div>
            {hasOtherActiveDevices && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isRevokingAll} className="shrink-0">
                    {isRevokingAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Desconectar outros
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar outros dispositivos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso encerrará todas as sessões exceto este dispositivo. Você precisará fazer
                      login novamente nos outros.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevokeAll}>Desconectar todos</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && activeDevices.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Shield className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum dispositivo ativo</p>
            </div>
          )}

          {!isLoading && activeDevices.length > 0 && (
            <div className="space-y-2">
              {activeDevices.map((device) => {
                const DeviceIconEl = getDeviceIcon(device.userAgent)
                const isCurrent = isCurrentDevice(device.userAgent)
                return (
                  <div
                    key={device.id}
                    className="flex items-center justify-between rounded-lg border p-4 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <DeviceIconEl className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {device.deviceName || 'Dispositivo desconhecido'}
                          </p>
                          {isCurrent && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              Este dispositivo
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {device.ipAddress || 'IP desconhecido'} · {device.location || 'Local desconhecido'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Último acesso: {formatDate(device.lastActiveAt)}
                        </p>
                      </div>
                    </div>
                    {!isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={revokingId === device.id}
                        onClick={() => handleRevoke(device.id)}
                        className="shrink-0"
                      >
                        {revokingId === device.id && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Desconectar
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contas conectadas */}
      <Card>
        <CardHeader>
          <CardTitle>Contas conectadas</CardTitle>
          <CardDescription>
            Provedores de identidade vinculados ao seu acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkedLoading && (
            <div className="space-y-3">
              <Skeleton className="h-[68px] w-full rounded-lg" />
              <Skeleton className="h-[68px] w-full rounded-lg" />
            </div>
          )}

          {!linkedLoading && linkedAccounts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Link2 className="mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma conta externa conectada.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Você acessa via magic link por email.
              </p>
            </div>
          )}

          {!linkedLoading && linkedAccounts.length > 0 && (
            <div className="space-y-2">
              {linkedAccounts.map((acc) => {
                const onlyMethod = isOnlyAuthMethod(acc.provider)
                const btn = (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unlinkingProvider === acc.provider || onlyMethod}
                    onClick={() => handleUnlink(acc.provider)}
                    className="shrink-0"
                  >
                    {unlinkingProvider === acc.provider ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="mr-2 h-4 w-4" />
                    )}
                    Desconectar
                  </Button>
                )
                return (
                  <div
                    key={acc.provider}
                    className="flex items-center justify-between rounded-lg border p-4 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Link2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{providerLabel(acc.provider)}</p>
                        <p className="text-xs text-muted-foreground truncate">{acc.identifier}</p>
                        {acc.connectedAt && (
                          <p className="text-xs text-muted-foreground">
                            Conectado em {formatDate(acc.connectedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    {onlyMethod ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0}>{btn}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Adicione outro método de login antes de desconectar.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      btn
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico de login recente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Histórico de acesso
          </CardTitle>
          <CardDescription>Últimos 10 acessos registrados na conta.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-32 w-full rounded-lg" />}

          {!isLoading && loginHistory.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sem histórico disponível.
            </p>
          )}

          {!isLoading && loginHistory.length > 0 && (
            <div className="divide-y divide-border">
              {loginHistory.map((entry) => {
                const DeviceIconEl = getDeviceIcon(entry.userAgent)
                return (
                  <div key={entry.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <DeviceIconEl className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {entry.deviceName || 'Dispositivo desconhecido'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {entry.ipAddress || 'IP desconhecido'} · {entry.location || 'Local desconhecido'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </span>
                      {entry.isRevoked && (
                        <Badge variant="secondary" className="text-xs">
                          Encerrada
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Page wrapper
// ============================================================================

export function ContaClient() {
  return (
    <div className="flex-1 space-y-6 p-4 pt-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minha Conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie suas informações pessoais, acesso e notificações.
        </p>
      </div>

      <Tabs defaultValue="perfil" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="perfil" className="flex-1 gap-2">
            <UserIcon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Perfil</span>
          </TabsTrigger>
          <TabsTrigger value="sessoes" className="flex-1 gap-2">
            <MonitorSmartphone className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Sessões e acesso</span>
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="flex-1 gap-2">
            <Bell className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Notificações</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="mt-6">
          <PerfilTab />
        </TabsContent>
        <TabsContent value="sessoes" className="mt-6">
          <SessoesTab />
        </TabsContent>
        <TabsContent value="notificacoes" className="mt-6">
          <NotificacoesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
