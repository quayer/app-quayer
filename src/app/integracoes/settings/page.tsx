'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'
import { Loader2, Save, User, Palette, AlertTriangle, CheckCircle2, Settings2, Key, Plug, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import { PageContainer, PageHeader } from '@/components/layout/page-layout'
import { ApiKeysSettings } from '@/components/admin-settings/ApiKeysSettings'

// ============================================
// TYPES
// ============================================

interface ProfileForm {
  name: string
  email: string
}

// ============================================
// COMPONENT
// ============================================

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Hydration fix: esperar montagem no cliente
  useEffect(() => {
    setMounted(true)
  }, [])

  // Profile form state
  const [profileForm, setProfileForm] = useState<ProfileForm>({
    name: '',
    email: '',
  })
  const [emailChanged, setEmailChanged] = useState(false)

  // ============================================
  // MUTATIONS
  // ============================================

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const response = await api.auth.updateProfile.mutate({
        body: {
          name: data.name,
          email: data.email !== user?.email ? data.email : undefined,
        }
      })
      return response
    },
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso!')
      refreshUser?.()
      if (emailChanged) {
        toast.info('Um código de verificação foi enviado para o novo email.')
        setEmailChanged(false)
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atualizar perfil')
    },
  })

  // ============================================
  // EFFECTS
  // ============================================

  // Sync profile form with user data
  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || '',
        email: user.email || '',
      })
    }
  }, [user])

  // Track email changes
  useEffect(() => {
    if (user && profileForm.email !== user.email) {
      setEmailChanged(true)
    } else {
      setEmailChanged(false)
    }
  }, [profileForm.email, user])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSaveProfile = async () => {
    if (!profileForm.name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    if (profileForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email)) {
      toast.error('Email inválido')
      return
    }
    updateProfileMutation.mutate(profileForm)
  }

  // ============================================
  // LOADING STATE
  // ============================================

  if (!user) {
    return (
      <PageContainer maxWidth="4xl">
        <PageHeader
          title="Configurações"
          description="Gerencie suas preferências e informações pessoais."
          icon={<Settings2 className="h-6 w-6 text-primary" />}
        />
        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-full max-w-md" />
              <Skeleton className="h-10 w-32" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-64" />
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    )
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <PageContainer maxWidth="4xl">
      <PageHeader
        title="Configurações"
        description="Gerencie suas preferências e informações pessoais."
        icon={<Settings2 className="h-6 w-6 text-primary" />}
      />

      <div className="grid gap-8">
        {/* Profile Settings */}
        <Card className="border-muted/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <User className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Perfil</CardTitle>
            </div>
            <CardDescription>
              Atualize suas informações de identificação e contato.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                value={profileForm.name}
                onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Seu nome"
                className="max-w-md"
              />
            </div>

            <div className="grid gap-3">
              <div className="flex items-center justify-between max-w-md">
                <Label htmlFor="email">E-mail</Label>
                {user?.emailVerified ? (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Verificado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                )}
              </div>
              <Input
                id="email"
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="seu@email.com"
                className="max-w-md"
              />
              {emailChanged && (
                <Alert variant="default" className="bg-yellow-50 border-yellow-200 max-w-md">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertTitle className="text-yellow-800">Atenção</AlertTitle>
                  <AlertDescription className="text-yellow-700">
                    Ao alterar seu email, você precisará verificar o novo endereço.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="grid gap-3">
              <Label>Função no Sistema</Label>
              <Input
                value={user?.role === 'admin' ? 'Administrador do Sistema' : 'Usuário'}
                disabled
                className="bg-muted/50 max-w-md"
              />
            </div>

            <div className="pt-2">
              <Button
                onClick={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
                className="w-full sm:w-auto"
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Appearance Settings */}
        <Card className="border-muted/60 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Palette className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Aparência</CardTitle>
            </div>
            <CardDescription>
              Personalize como você visualiza a aplicação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-base">Tema da Interface</Label>
                <p className="text-sm text-muted-foreground">
                  Alterne entre modo claro, escuro ou automático.
                </p>
              </div>
              {/* ✅ CORREÇÃO: Usar mounted para evitar hydration mismatch */}
              <div className="flex gap-2 bg-muted/50 p-1 rounded-lg">
                <Button
                  variant={mounted && theme === 'light' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('light')}
                  className="h-8"
                  disabled={!mounted}
                >
                  Claro
                </Button>
                <Button
                  variant={mounted && theme === 'dark' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                  className="h-8"
                  disabled={!mounted}
                >
                  Escuro
                </Button>
                <Button
                  variant={mounted && theme === 'system' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('system')}
                  className="h-8"
                  disabled={!mounted}
                >
                  Sistema
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Integrations/Providers Link */}
        <Card className="border-muted/60 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Plug className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>Provedores & Integrações</CardTitle>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                2 ativos
              </Badge>
            </div>
            <CardDescription>
              Configure provedores de IA, voz, transcrição e infraestrutura para sua organização.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  OpenAI, Anthropic, ElevenLabs, Deepgram, Supabase, Redis e mais.
                </p>
              </div>
              <Link href="/integracoes/settings/organization/integrations">
                <Button variant="outline" className="gap-2">
                  Gerenciar
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* API Keys Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Key className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">API Keys</h2>
              <p className="text-sm text-muted-foreground">
                Gerencie chaves de API para acesso programático à plataforma.
              </p>
            </div>
          </div>
          <ApiKeysSettings />
        </div>
      </div>
    </PageContainer>
  )
}
