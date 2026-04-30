'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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
  ShieldCheck,
  ShieldOff,
  Copy,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  KeyRound,
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/client/components/ui/input-otp'
import { getCsrfHeaders } from '@/client/hooks/use-csrf-token'
import { PasskeyManager } from '@/client/components/settings/passkey-manager'

// ============================================================================
// Types
// ============================================================================

interface TotpDevice {
  id: string
  name: string
  verified: boolean
  createdAt: string
}

interface TotpSetupResponse {
  qrCode: string
  secret: string
  deviceId: string
  recoveryCodes: string[]
}

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
// Tab: Segurança — helpers
// ============================================================================

interface RecoveryCodesGridProps {
  codes: string[]
  onCopy: (codes: string[]) => void
  onDownload: (codes: string[]) => void
}

function RecoveryCodesGrid({ codes, onCopy, onDownload }: RecoveryCodesGridProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {codes.map((code, i) => (
          <div
            key={i}
            className="bg-muted rounded-md px-3 py-2 text-center font-mono text-sm tracking-wider"
          >
            {code}
          </div>
        ))}
      </div>
      <Alert>
        <KeyRound className="h-4 w-4" />
        <AlertDescription>
          Guarde estes códigos em local seguro. Eles não serão mostrados novamente.
          Cada código só pode ser usado uma vez.
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onCopy(codes)}>
          <Copy className="h-4 w-4 mr-2" />
          Copiar todos
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDownload(codes)}>
          <Download className="h-4 w-4 mr-2" />
          Download .txt
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Tab: Segurança — TwoFactorSection
// ============================================================================

function TwoFactorSection() {
  const [devices, setDevices] = useState<TotpDevice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [is2FAEnabled, setIs2FAEnabled] = useState(false)

  // Setup wizard state
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupStep, setSetupStep] = useState(1)
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [secretVisible, setSecretVisible] = useState(false)

  // Disable 2FA modal state
  const [disableOpen, setDisableOpen] = useState(false)
  const [disableEmailCode, setDisableEmailCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disableLoading, setDisableLoading] = useState(false)
  const [disableError, setDisableError] = useState<string | null>(null)
  const [disableEmailSent, setDisableEmailSent] = useState(false)
  const [disableEmailSending, setDisableEmailSending] = useState(false)

  // Regenerate codes modal state
  const [regenOpen, setRegenOpen] = useState(false)
  const [regenCode, setRegenCode] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null)

  const fetchTotpDevices = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: TotpDevice[] }>('/api/v1/auth/totp/devices')
      const deviceList = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? (res as unknown as TotpDevice[]) : []
      setDevices(deviceList)
      setIs2FAEnabled(deviceList.some((d) => d.verified))
    } catch {
      setDevices([])
      setIs2FAEnabled(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTotpDevices()
  }, [fetchTotpDevices])

  const handleStartSetup = async () => {
    setSetupOpen(true)
    setSetupStep(1)
    setSetupData(null)
    setVerifyCode('')
    setVerifyError(null)
    setSecretVisible(false)
    setSetupLoading(true)
    try {
      const res = await apiFetch<{ data: TotpSetupResponse }>('/api/v1/auth/totp/setup', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setSetupData(res.data || (res as unknown as TotpSetupResponse))
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao iniciar setup de 2FA')
      setSetupOpen(false)
    } finally {
      setSetupLoading(false)
    }
  }

  const handleVerifySetup = async () => {
    if (!setupData || verifyCode.length !== 6) return
    setVerifyLoading(true)
    setVerifyError(null)
    try {
      await apiFetch('/api/v1/auth/totp/verify', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode, deviceId: setupData.deviceId }),
      })
      setSetupStep(3)
      toast.success('2FA ativado com sucesso!')
    } catch (err) {
      setVerifyError((err as Error).message || 'Código inválido. Tente novamente.')
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleCloseSetup = () => {
    setSetupOpen(false)
    if (setupStep === 3) fetchTotpDevices()
  }

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret)
      toast.success('Secret copiado para a área de transferência')
    }
  }

  const handleCopyCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join('\n'))
    toast.success('Códigos copiados para a área de transferência')
  }

  const handleDownloadCodes = (codes: string[]) => {
    const content = [
      'Quayer - Recovery Codes',
      '========================',
      'Guarde estes códigos em local seguro.',
      'Cada código só pode ser usado uma vez.',
      '',
      ...codes,
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quayer-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Arquivo de códigos baixado')
  }

  const handleOpenDisable = () => {
    setDisableOpen(true)
    setDisableEmailCode('')
    setDisableCode('')
    setDisableError(null)
    setDisableEmailSent(false)
    setDisableEmailSending(false)
  }

  const handleSendDisableCode = async () => {
    setDisableEmailSending(true)
    setDisableError(null)
    try {
      await apiFetch('/api/v1/auth/totp/disable-request', { method: 'POST', body: JSON.stringify({}) })
      setDisableEmailSent(true)
      toast.success('Código enviado para seu email')
    } catch (err) {
      setDisableError((err as Error).message || 'Erro ao enviar código')
    } finally {
      setDisableEmailSending(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!disableEmailCode || !disableCode) { setDisableError('Preencha todos os campos'); return }
    setDisableLoading(true)
    setDisableError(null)
    try {
      await apiFetch('/api/v1/auth/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ emailCode: disableEmailCode, code: disableCode }),
      })
      toast.success('2FA desabilitado com sucesso')
      setDisableOpen(false)
      fetchTotpDevices()
    } catch (err) {
      setDisableError((err as Error).message || 'Erro ao desabilitar 2FA')
    } finally {
      setDisableLoading(false)
    }
  }

  const handleOpenRegen = () => {
    setRegenOpen(true)
    setRegenCode('')
    setRegenError(null)
    setRegenCodes(null)
  }

  const handleRegenerateCodes = async () => {
    if (regenCode.length !== 6) { setRegenError('Digite o código de 6 dígitos do seu authenticator'); return }
    setRegenLoading(true)
    setRegenError(null)
    try {
      const res = await apiFetch<{ data: { recoveryCodes: string[] } }>('/api/v1/auth/totp/regenerate-codes', {
        method: 'POST',
        body: JSON.stringify({ code: regenCode }),
      })
      const data = res.data || (res as unknown as { recoveryCodes: string[] })
      setRegenCodes(data.recoveryCodes)
      toast.success('Novos códigos de recuperação gerados')
    } catch (err) {
      setRegenError((err as Error).message || 'Erro ao regenerar códigos')
    } finally {
      setRegenLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Autenticação em Duas Etapas</h3>
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Autenticação em Duas Etapas (2FA)</h3>

      {!is2FAEnabled ? (
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShieldOff className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium">2FA Desabilitado</p>
              <p className="text-sm text-muted-foreground">
                Adicione uma camada extra de segurança à sua conta com autenticação em duas etapas.
              </p>
            </div>
            <Button onClick={handleStartSetup}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Ativar 2FA
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 dark:bg-green-400/10">
                <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base flex items-center gap-2">
                  2FA Ativo
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                    Ativo
                  </Badge>
                </CardTitle>
                <CardDescription>Sua conta está protegida com autenticação em duas etapas.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Button variant="outline" size="sm" onClick={handleOpenRegen}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerar Códigos
            </Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleOpenDisable}>
              <ShieldOff className="h-4 w-4 mr-2" />
              Desabilitar 2FA
            </Button>
          </CardContent>
          {devices.length > 0 && (
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">
                Dispositivo configurado em {formatDate(devices[0].createdAt)}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* Setup Wizard Dialog */}
      <Dialog open={setupOpen} onOpenChange={handleCloseSetup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {setupStep === 1 && 'Passo 1: Escanear QR Code'}
              {setupStep === 2 && 'Passo 2: Verificar Código'}
              {setupStep === 3 && 'Passo 3: Códigos de Recuperação'}
            </DialogTitle>
            <DialogDescription>
              {setupStep === 1 && 'Escaneie o QR code com seu app authenticator (Google Authenticator, Authy, etc.).'}
              {setupStep === 2 && 'Digite o código de 6 dígitos do seu app authenticator para confirmar.'}
              {setupStep === 3 && 'Salve seus códigos de recuperação em local seguro.'}
            </DialogDescription>
          </DialogHeader>

          {setupLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {setupStep === 1 && setupData && !setupLoading && (
            <div className="space-y-4">
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setupData.qrCode}
                  alt="QR Code para configurar 2FA"
                  className="h-48 w-48 rounded-lg border bg-white p-2"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Não consegue escanear? Use o código manual:</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                    {secretVisible ? setupData.secret : '•'.repeat(32)}
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => setSecretVisible(!secretVisible)} aria-label={secretVisible ? 'Ocultar secret' : 'Mostrar secret'}>
                    {secretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleCopySecret} aria-label="Copiar secret">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseSetup}>Cancelar</Button>
                <Button onClick={() => setSetupStep(2)}>Próximo</Button>
              </DialogFooter>
            </div>
          )}

          {setupStep === 2 && setupData && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={verifyCode} onChange={(value) => { setVerifyCode(value); setVerifyError(null) }}>
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
              {verifyError && (
                <Alert variant="destructive">
                  <AlertDescription>{verifyError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setSetupStep(1); setVerifyCode(''); setVerifyError(null) }}>Voltar</Button>
                <Button onClick={handleVerifySetup} disabled={verifyCode.length !== 6 || verifyLoading}>
                  {verifyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verificar
                </Button>
              </DialogFooter>
            </div>
          )}

          {setupStep === 3 && setupData && (
            <div className="space-y-4">
              <RecoveryCodesGrid codes={setupData.recoveryCodes} onCopy={handleCopyCodes} onDownload={handleDownloadCodes} />
              <DialogFooter>
                <Button onClick={handleCloseSetup}>Concluir</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desabilitar 2FA</DialogTitle>
            <DialogDescription>
              Para desabilitar a autenticação em duas etapas, envie um código de verificação para seu email e insira o código do authenticator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Verificação por email</Label>
              {!disableEmailSent ? (
                <Button variant="outline" className="w-full" onClick={handleSendDisableCode} disabled={disableEmailSending}>
                  {disableEmailSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar código por email
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Código enviado! Verifique seu email.</p>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={disableEmailCode} onChange={(value) => { setDisableEmailCode(value); setDisableError(null) }}>
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
                  <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={handleSendDisableCode} disabled={disableEmailSending}>
                    {disableEmailSending ? 'Enviando...' : 'Reenviar código'}
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="disable-totp-code">Código TOTP ou Recovery Code</Label>
              <Input
                id="disable-totp-code"
                value={disableCode}
                onChange={(e) => { setDisableCode(e.target.value); setDisableError(null) }}
                placeholder="000000 ou recovery code"
                className="font-mono"
              />
            </div>
            {disableError && (
              <Alert variant="destructive">
                <AlertDescription>{disableError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDisable2FA} disabled={disableLoading || !disableEmailCode || !disableCode}>
              {disableLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desabilitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Codes Dialog */}
      <Dialog open={regenOpen} onOpenChange={(open) => { setRegenOpen(open); if (!open) fetchTotpDevices() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerar Códigos de Recuperação</DialogTitle>
            <DialogDescription>
              {!regenCodes
                ? 'Insira o código do seu authenticator para gerar novos códigos de recuperação. Os códigos antigos serão invalidados.'
                : 'Seus novos códigos de recuperação foram gerados. Salve-os em local seguro.'}
            </DialogDescription>
          </DialogHeader>
          {!regenCodes ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={regenCode} onChange={(value) => { setRegenCode(value); setRegenError(null) }}>
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
              {regenError && (
                <Alert variant="destructive">
                  <AlertDescription>{regenError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setRegenOpen(false)}>Cancelar</Button>
                <Button onClick={handleRegenerateCodes} disabled={regenCode.length !== 6 || regenLoading}>
                  {regenLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Regenerar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <RecoveryCodesGrid codes={regenCodes} onCopy={handleCopyCodes} onDownload={handleDownloadCodes} />
              <DialogFooter>
                <Button onClick={() => { setRegenOpen(false); fetchTotpDevices() }}>Concluir</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// Tab: Segurança — wrapper
// ============================================================================

function SegurancaTab() {
  return (
    <div className="space-y-6">
      <PasskeyManager />
      <TwoFactorSection />
    </div>
  )
}

// ============================================================================
// Page wrapper
// ============================================================================

export function ContaClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const validTabs = ['perfil', 'sessoes', 'notificacoes', 'seguranca']
  const defaultTab = validTabs.includes(tabParam ?? '') ? (tabParam as string) : 'perfil'

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'perfil') {
      params.delete('tab')
    } else {
      params.set('tab', value)
    }
    router.replace(`/conta${params.toString() ? '?' + params.toString() : ''}`, { scroll: false })
  }

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minha Conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie suas informações pessoais, acesso e notificações.
        </p>
      </div>

      <Tabs value={defaultTab} onValueChange={handleTabChange} className="w-full">
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
          <TabsTrigger value="seguranca" className="flex-1 gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Segurança</span>
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
        <TabsContent value="seguranca" className="mt-6">
          <SegurancaTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
