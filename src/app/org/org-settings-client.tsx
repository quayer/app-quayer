'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Building2,
  Save,
  Loader2,
  Upload,
  Trash2,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'

import { api } from '@/igniter.client'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Textarea } from '@/client/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/client/components/ui/avatar'
import { Separator } from '@/client/components/ui/separator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrganizationData {
  id: string
  name: string
  slug: string
  type: 'pf' | 'pj'
  logoUrl: string | null
  timezone: string
  isActive: boolean
}

interface GeneralFormState {
  name: string
  logoUrl: string
  vertical: string
  timezone: string
  agentLanguage: string
}

interface BusinessProfileFormState {
  description: string
  email: string
  website: string
  address: string
}

const VERTICAIS = [
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'imobiliaria', label: 'Imobiliária' },
  { value: 'advocacia', label: 'Advocacia' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'educacao', label: 'Educação' },
  { value: 'restaurante', label: 'Restaurante / Food' },
  { value: 'outro', label: 'Outro' },
]

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'America/Cuiaba',
  'America/Bahia',
  'UTC',
]

const LANGUAGES = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'es-ES', label: 'Español' },
]

// ---------------------------------------------------------------------------

export function OrgSettingsClient() {
  const queryClient = useQueryClient()

  const { data: orgResponse, isLoading } = useQuery({
    queryKey: ['organization', 'current'],
    queryFn: async () => {
      const result = await api.organizations.getCurrent.query()
      return result as { data?: OrganizationData } | OrganizationData
    },
  })

  const organization: OrganizationData | null =
    (orgResponse && 'data' in (orgResponse as Record<string, unknown>)
      ? ((orgResponse as { data?: OrganizationData }).data ?? null)
      : ((orgResponse as OrganizationData) ?? null))

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organização</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie os dados da sua empresa, perfil comercial e preferências.
        </p>
      </div>

      {isLoading || !organization ? (
        <Card>
          <CardContent className="p-12 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <>
          <GeneralCard organization={organization} queryClient={queryClient} />
          <BusinessProfileCard />
          <DangerZoneCard organization={organization} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dados gerais
// ---------------------------------------------------------------------------

function GeneralCard({
  organization,
  queryClient,
}: {
  organization: OrganizationData
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [form, setForm] = useState<GeneralFormState>({
    name: organization.name ?? '',
    logoUrl: organization.logoUrl ?? '',
    vertical: '',
    timezone: organization.timezone ?? 'America/Sao_Paulo',
    agentLanguage: 'pt-BR',
  })

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: organization.name ?? '',
      logoUrl: organization.logoUrl ?? '',
      timezone: organization.timezone ?? 'America/Sao_Paulo',
    }))
  }, [organization])

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      logoUrl?: string | null
      timezone?: string
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (api.organizations.update as any).mutate({
        params: { id: organization.id },
        body: payload,
      })
      return response as unknown
    },
    onSuccess: () => {
      toast.success('Dados da organização atualizados')
      queryClient.invalidateQueries({ queryKey: ['organization', 'current'] })
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Erro ao salvar alterações'
      toast.error(message)
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      name: form.name,
      logoUrl: form.logoUrl || null,
      timezone: form.timezone,
    })
  }

  // TODO(backend): upload real de logo — hoje `logoUrl` é apenas URL livre.
  // TODO(backend): persistir `vertical` e `agentLanguage` (não existem no
  // modelo Organization — precisa migration no schema.prisma).

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Dados gerais</CardTitle>
            <CardDescription>
              Informações básicas da organização.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={form.logoUrl || undefined} alt={form.name} />
            <AvatarFallback>
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Label htmlFor="org-logo">Logo da empresa</Label>
            <div className="flex gap-2 max-w-md">
              <Input
                id="org-logo"
                value={form.logoUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, logoUrl: e.target.value }))
                }
                placeholder="https://..."
              />
              <Button
                type="button"
                variant="outline"
                disabled
                title="Upload direto em breve"
              >
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cole a URL de uma imagem. Upload direto em breve.
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="org-name">Nome da empresa</Label>
            <Input
              id="org-name"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Minha Empresa"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-vertical">Vertical</Label>
            <Select
              value={form.vertical}
              onValueChange={(v) => setForm((f) => ({ ...f, vertical: v }))}
            >
              <SelectTrigger id="org-vertical">
                <SelectValue placeholder="Selecione a vertical" />
              </SelectTrigger>
              <SelectContent>
                {VERTICAIS.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-timezone">Fuso horário padrão</Label>
            <Select
              value={form.timezone}
              onValueChange={(v) => setForm((f) => ({ ...f, timezone: v }))}
            >
              <SelectTrigger id="org-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-language">Idioma padrão dos agentes</Label>
            <Select
              value={form.agentLanguage}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, agentLanguage: v }))
              }
            >
              <SelectTrigger id="org-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !form.name.trim()}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar alterações
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Business Profile WhatsApp
// ---------------------------------------------------------------------------

function BusinessProfileCard() {
  // TODO(backend): o endpoint api.businessProfile.get/update exige um
  // connectionId (cada conexão WhatsApp tem seu próprio perfil). Aqui
  // apresentamos a UI e deixamos a seleção de connectionId para um próximo
  // iteração (selector) — por enquanto é somente informativo / rascunho
  // salvo localmente.
  const [form, setForm] = useState<BusinessProfileFormState>({
    description: '',
    email: '',
    website: '',
    address: '',
  })

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <MessageSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Perfil comercial WhatsApp</CardTitle>
            <CardDescription>
              Informações exibidas no seu WhatsApp Business. Aplicado a todas
              as conexões da organização.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="bp-description">Descrição</Label>
          <Textarea
            id="bp-description"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Breve descrição do seu negócio"
            maxLength={512}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {form.description.length}/512
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bp-email">E-mail de contato</Label>
            <Input
              id="bp-email"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="contato@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bp-website">Site</Label>
            <Input
              id="bp-website"
              type="url"
              value={form.website}
              onChange={(e) =>
                setForm((f) => ({ ...f, website: e.target.value }))
              }
              placeholder="https://empresa.com"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bp-address">Endereço</Label>
          <Input
            id="bp-address"
            value={form.address}
            onChange={(e) =>
              setForm((f) => ({ ...f, address: e.target.value }))
            }
            placeholder="Rua, número, cidade — UF"
            maxLength={256}
          />
        </div>

        <div className="pt-2">
          <Button
            type="button"
            disabled
            title="Selecione uma conexão em /conexoes para aplicar"
          >
            <Save className="mr-2 h-4 w-4" />
            Salvar perfil (por conexão)
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            TODO: selecionar conexão WhatsApp para aplicar estas informações.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Danger Zone
// ---------------------------------------------------------------------------

function DangerZoneCard({ organization }: { organization: OrganizationData }) {
  const [confirmName, setConfirmName] = useState('')
  const [open, setOpen] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (api.organizations.delete as any).mutate({
        params: { id: organization.id },
      })
      return response as unknown
    },
    onSuccess: () => {
      toast.success('Organização desativada')
      setOpen(false)
      // Após delete o usuário não deve mais ter acesso — redirecionar
      window.location.href = '/'
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro ao desativar organização (apenas admins do sistema podem excluir)'
      toast.error(message)
    },
  })

  const canDelete = confirmName === organization.name

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-destructive/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <CardTitle className="text-destructive">Zona de perigo</CardTitle>
            <CardDescription>
              Ações irreversíveis. Proceda com cuidado.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-lg border border-destructive/30 p-4">
          <div>
            <p className="font-medium">Excluir organização</p>
            <p className="text-sm text-muted-foreground">
              Todos os dados, conexões e agentes serão desativados.
            </p>
          </div>
          <AlertDialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v)
              if (!v) setConfirmName('')
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir organização
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir organização</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. Para confirmar, digite
                  exatamente o nome da organização:{' '}
                  <strong>{organization.name}</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-2">
                <Input
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={organization.name}
                  autoComplete="off"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!canDelete || deleteMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault()
                    if (canDelete) deleteMutation.mutate()
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMutation.isPending
                    ? 'Excluindo...'
                    : 'Sim, excluir definitivamente'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
