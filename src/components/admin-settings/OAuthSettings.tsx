'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound, Eye, EyeOff, Save, RefreshCw, CheckCircle2, Info, ExternalLink, FileUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { api, getAuthHeaders } from '@/igniter.client'
import { getEnvDefaultsAction } from '@/app/admin/actions'

interface EnvOAuthDefaults {
  googleClientId: string
  googleClientIdMasked: string
  googleRedirectUri: string
}

interface OAuthSettingsData {
  googleClientId?: string
  googleClientSecret?: string
  googleRedirectUri?: string
  googleEnabled?: boolean
}

export function OAuthSettings() {
  const queryClient = useQueryClient()
  const [showGoogleSecret, setShowGoogleSecret] = useState(false)
  const [envDefaults, setEnvDefaults] = useState<EnvOAuthDefaults | null>(null)

  const [formData, setFormData] = useState<OAuthSettingsData>({
    googleClientId: '',
    googleClientSecret: '',
    googleRedirectUri: '',
    googleEnabled: false,
  })

  // Fetch env defaults
  useEffect(() => {
    async function loadEnvDefaults() {
      try {
        const result = await getEnvDefaultsAction()
        if (result.success && result.data) {
          setEnvDefaults(result.data.oauth)
        }
      } catch (error) {
        console.error('Error loading env defaults:', error)
      }
    }
    loadEnvDefaults()
  }, [])

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings', 'oauth'],
    queryFn: async () => {
      const result = await (api['system-settings'].getByCategory as any).query({
        params: { category: 'oauth' },
        headers: getAuthHeaders(),
      })
      return result.data as OAuthSettingsData
    },
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        googleClientId: settings.googleClientId || envDefaults?.googleClientId || '',
        googleClientSecret: settings.googleClientSecret || '',
        googleRedirectUri: settings.googleRedirectUri || envDefaults?.googleRedirectUri || `${window.location.origin}/api/v1/auth/google/callback`,
        googleEnabled: settings.googleEnabled ?? false,
      })
    } else if (envDefaults) {
      setFormData((prev) => ({
        ...prev,
        googleClientId: envDefaults.googleClientId || '',
        googleRedirectUri: envDefaults.googleRedirectUri || `${window.location.origin}/api/v1/auth/google/callback`,
      }))
    }
  }, [settings, envDefaults])

  // Load from env button handler
  const handleLoadFromEnv = () => {
    if (envDefaults) {
      setFormData((prev) => ({
        ...prev,
        googleClientId: envDefaults.googleClientId || '',
        googleRedirectUri: envDefaults.googleRedirectUri || `${window.location.origin}/api/v1/auth/google/callback`,
      }))
      toast.success('Valores carregados do arquivo .env (secret precisa ser preenchido manualmente)')
    } else {
      toast.error('Não foi possível carregar valores do .env')
    }
  }

  const hasEnvData = envDefaults && envDefaults.googleClientId

  // Save settings
  const saveMutation = useMutation({
    mutationFn: async (data: OAuthSettingsData) => {
      return (api['system-settings'].updateOAuth.mutate as any)({
        body: data,
        headers: getAuthHeaders(),
      })
    },
    onSuccess: () => {
      toast.success('Configurações OAuth salvas!')
      queryClient.invalidateQueries({ queryKey: ['system-settings', 'oauth'] })
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  const handleSave = () => {
    if (formData.googleEnabled && (!formData.googleClientId || !formData.googleClientSecret)) {
      toast.error('Client ID e Secret são obrigatórios para habilitar Google OAuth')
      return
    }
    saveMutation.mutate(formData)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div role="status" aria-busy="true" aria-label="Carregando configurações OAuth">
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Carregando configurações OAuth...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Google OAuth */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google OAuth
              </CardTitle>
              <CardDescription id="google-oauth-desc">
                Permita que usuários façam login com suas contas Google.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {hasEnvData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadFromEnv}
                  className="shrink-0"
                >
                  <FileUp className="h-4 w-4 mr-2" aria-hidden="true" />
                  Carregar do .env
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.googleEnabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, googleEnabled: checked }))
                  }
                  aria-label="Habilitar Google OAuth"
                  aria-describedby="google-oauth-desc"
                />
                <Badge variant={formData.googleEnabled ? 'default' : 'secondary'} aria-live="polite">
                  {formData.googleEnabled ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Env info alert */}
          {hasEnvData && (
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" role="note">
              <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <AlertTitle className="text-blue-700 dark:text-blue-400">Configuração detectada no .env</AlertTitle>
              <AlertDescription className="text-blue-600 dark:text-blue-300">
                <div className="mt-2 space-y-1 text-sm font-mono">
                  <div>Client ID: <span className="font-semibold">{envDefaults?.googleClientIdMasked || 'N/A'}</span></div>
                  <div>Redirect URI: <span className="font-semibold">{envDefaults?.googleRedirectUri || 'N/A'}</span></div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Alert role="note">
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Como configurar</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>1. Acesse o <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1" aria-label="Google Cloud Console (abre em nova aba)">Google Cloud Console <ExternalLink className="h-3 w-3" aria-hidden="true" /></a></p>
              <p>2. Crie um projeto ou selecione um existente</p>
              <p>3. Vá em &quot;Credenciais&quot; → &quot;Criar Credenciais&quot; → &quot;ID do cliente OAuth&quot;</p>
              <p>4. Configure as origens JavaScript autorizadas e URIs de redirecionamento</p>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="google-client-id">Client ID</Label>
              <Input
                id="google-client-id"
                value={formData.googleClientId}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, googleClientId: e.target.value }))
                }
                placeholder="123456789-xxxxxxx.apps.googleusercontent.com"
                disabled={!formData.googleEnabled}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="google-client-secret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="google-client-secret"
                  type={showGoogleSecret ? 'text' : 'password'}
                  value={formData.googleClientSecret}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, googleClientSecret: e.target.value }))
                  }
                  placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
                  disabled={!formData.googleEnabled}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowGoogleSecret(!showGoogleSecret)}
                  disabled={!formData.googleEnabled}
                  aria-label={showGoogleSecret ? 'Ocultar secret' : 'Mostrar secret'}
                  aria-pressed={showGoogleSecret}
                >
                  {showGoogleSecret ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="google-redirect-uri">Redirect URI</Label>
              <Input
                id="google-redirect-uri"
                value={formData.googleRedirectUri}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, googleRedirectUri: e.target.value }))
                }
                placeholder="https://seu-dominio.com/api/v1/auth/google/callback"
                disabled={!formData.googleEnabled}
                aria-describedby="redirect-uri-hint"
              />
              <p id="redirect-uri-hint" className="text-xs text-muted-foreground">
                Adicione esta URL nas &quot;URIs de redirecionamento autorizados&quot; no Google Console
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              aria-busy={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                  <span>Salvar Configurações</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Future: GitHub, Microsoft, etc */}
      <Card className="opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
            Outros Provedores
          </CardTitle>
          <CardDescription>
            Mais provedores OAuth em breve: GitHub, Microsoft, Apple.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground" role="status">
            <p>Em desenvolvimento</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
