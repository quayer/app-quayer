'use client'

/**
 * Tab: Perfil — dados pessoais, avatar e zona de perigo (exclusão de conta).
 * Structural extraction from conta-client.tsx (no behavior change).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Upload, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'

import { apiFetch, unwrapData, getInitials, type CurrentUser } from './shared'

export function PerfilTab() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('pt_BR')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
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

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const previewUrl = URL.createObjectURL(file)
    setAvatarUrl(previewUrl)
    setUploadingAvatar(true)

    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await apiFetch<{ data?: { avatarUrl: string }; avatarUrl?: string }>(
        '/api/v1/auth/me/avatar',
        {
          method: 'POST',
          body: JSON.stringify({ fileBase64, fileName: file.name, mimeType: file.type }),
        }
      )

      const serverUrl = (res as { data?: { avatarUrl?: string } }).data?.avatarUrl ?? (res as { avatarUrl?: string }).avatarUrl
      if (serverUrl) {
        URL.revokeObjectURL(previewUrl)
        setAvatarUrl(serverUrl)
      }

      toast.success('Foto de perfil atualizada com sucesso')
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao enviar foto')
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
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
              onClick={uploadingAvatar ? undefined : handleAvatarClick}
              role="button"
              tabIndex={0}
              aria-label="Alterar foto de perfil"
              onKeyDown={(e) => !uploadingAvatar && e.key === 'Enter' && handleAvatarClick()}
            >
              <Avatar className="h-20 w-20 ring-2 ring-border">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name || 'Avatar'} /> : null}
                <AvatarFallback className="text-lg font-semibold">
                  {getInitials(name, user?.email ?? '')}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar
                  ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                  : <Upload className="h-5 w-5 text-white" />}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" onClick={handleAvatarClick} disabled={uploadingAvatar} className="w-fit">
                {uploadingAvatar
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</>
                  : <><Upload className="mr-2 h-4 w-4" />Alterar foto</>}
              </Button>
              <p className="text-xs text-muted-foreground">PNG ou JPG, até 2 MB.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
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
