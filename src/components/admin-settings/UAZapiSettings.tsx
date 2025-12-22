'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Server, Eye, EyeOff, Save, RefreshCw, CheckCircle2, XCircle, Info, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { api, getAuthHeaders } from '@/igniter.client'
import { getEnvDefaultsAction } from '@/app/admin/actions'

interface UAZapiSettingsData {
  baseUrl: string
  adminToken: string
  webhookUrl: string
}

interface EnvDefaults {
  baseUrl: string
  adminToken: string
  adminTokenMasked: string
  webhookUrl: string
}

export function UAZapiSettings() {
  const queryClient = useQueryClient()
  const [showToken, setShowToken] = useState(false)
  const [envDefaults, setEnvDefaults] = useState<EnvDefaults | null>(null)
  const [formData, setFormData] = useState<UAZapiSettingsData>({
    baseUrl: '',
    adminToken: '',
    webhookUrl: '',
  })

  // Fetch env defaults
  useEffect(() => {
    async function loadEnvDefaults() {
      try {
        const result = await getEnvDefaultsAction()
        if (result.success && result.data) {
          setEnvDefaults(result.data.uazapi)
        }
      } catch (error) {
        console.error('Error loading env defaults:', error)
      }
    }
    loadEnvDefaults()
  }, [])

  // Fetch current settings from database
  const { data, isLoading, error } = useQuery({
    queryKey: ['system-settings', 'uazapi'],
    queryFn: async () => {
      const result = await (api['system-settings'].getByCategory as any).query({
        params: { category: 'uazapi' },
        headers: getAuthHeaders(),
      })
      return result.data as UAZapiSettingsData
    },
  })

  // Update form when data loads - use env defaults as fallback
  useEffect(() => {
    if (data) {
      setFormData({
        baseUrl: data.baseUrl || envDefaults?.baseUrl || '',
        adminToken: data.adminToken || envDefaults?.adminToken || '',
        webhookUrl: data.webhookUrl || envDefaults?.webhookUrl || '',
      })
    } else if (envDefaults) {
      // If no database data, use env defaults
      setFormData({
        baseUrl: envDefaults.baseUrl,
        adminToken: envDefaults.adminToken,
        webhookUrl: envDefaults.webhookUrl,
      })
    }
  }, [data, envDefaults])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (settings: UAZapiSettingsData) => {
      return (api['system-settings'].updateUazapi.mutate as any)({
        body: settings,
      })
    },
    onSuccess: () => {
      toast.success('Configuracoes UAZapi salvas!')
      queryClient.invalidateQueries({ queryKey: ['system-settings', 'uazapi'] })
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  // Test connection mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      return (api['system-settings'].testUazapiConnection.mutate as any)({
        body: {
          baseUrl: formData.baseUrl,
          adminToken: formData.adminToken,
        },
      })
    },
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success('Conexao estabelecida com sucesso!')
      } else {
        toast.error(result.error || 'Falha na conexao')
      }
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  // Load from env button handler
  const handleLoadFromEnv = () => {
    if (envDefaults) {
      setFormData({
        baseUrl: envDefaults.baseUrl,
        adminToken: envDefaults.adminToken,
        webhookUrl: envDefaults.webhookUrl,
      })
      toast.success('Valores carregados do arquivo .env')
    } else {
      toast.error('Nao foi possivel carregar valores do .env')
    }
  }

  const handleSave = () => {
    if (!formData.baseUrl) {
      toast.error('URL da API e obrigatoria')
      return
    }
    if (!formData.adminToken) {
      toast.error('Admin Token e obrigatorio')
      return
    }
    saveMutation.mutate(formData)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div role="status" aria-busy="true" aria-label="Carregando configurações UAZapi">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <span className="sr-only">Carregando configurações UAZapi...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasEnvData = envDefaults && (envDefaults.baseUrl || envDefaults.adminToken)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" aria-hidden="true" />
              Credenciais UAZapi
            </CardTitle>
            <CardDescription>
              Configure a URL e token de administracao da API UAZapi.
              Essas credenciais sao usadas para gerenciar todas as instancias WhatsApp.
            </CardDescription>
          </div>
          {hasEnvData && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadFromEnv}
              className="shrink-0"
            >
              <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
              Carregar do .env
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Env info alert */}
        {hasEnvData && (
          <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800" role="note">
            <Info className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <AlertTitle className="text-blue-700 dark:text-blue-400">Configuracao detectada no .env</AlertTitle>
            <AlertDescription className="text-blue-600 dark:text-blue-300">
              <div className="mt-2 space-y-1 text-sm font-mono">
                <div>URL: <span className="font-semibold">{envDefaults?.baseUrl || 'N/A'}</span></div>
                <div>Token: <span className="font-semibold">{envDefaults?.adminTokenMasked || 'N/A'}</span></div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Alert role="alert">
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Importante</AlertTitle>
          <AlertDescription>
            Alteracoes nestas credenciais afetarao todas as organizacoes que utilizam
            o provider Quayer. Tenha cuidado ao modificar.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">URL da API</Label>
            <Input
              id="baseUrl"
              placeholder="https://quayer.uazapi.com"
              value={formData.baseUrl}
              onChange={(e) => setFormData((prev) => ({ ...prev, baseUrl: e.target.value }))}
              aria-describedby="baseUrl-hint"
            />
            <p id="baseUrl-hint" className="text-xs text-muted-foreground">
              URL base da API UAZapi (sem barra final)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adminToken">Admin Token</Label>
            <div className="relative">
              <Input
                id="adminToken"
                type={showToken ? 'text' : 'password'}
                placeholder="Seu token de administrador"
                value={formData.adminToken}
                onChange={(e) => setFormData((prev) => ({ ...prev, adminToken: e.target.value }))}
                aria-describedby="adminToken-hint"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowToken(!showToken)}
                aria-label={showToken ? 'Ocultar token' : 'Mostrar token'}
                aria-pressed={showToken}
              >
                {showToken ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
            <p id="adminToken-hint" className="text-xs text-muted-foreground">
              Token com permissoes de administrador para gerenciar instancias
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="webhookUrl">URL do Webhook Global</Label>
            <Input
              id="webhookUrl"
              placeholder="https://seu-dominio.com/api/v1/webhooks/uazapi"
              value={formData.webhookUrl}
              onChange={(e) => setFormData((prev) => ({ ...prev, webhookUrl: e.target.value }))}
              aria-describedby="webhookUrl-hint"
            />
            <p id="webhookUrl-hint" className="text-xs text-muted-foreground">
              URL que recebera todos os eventos do UAZapi
            </p>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !formData.adminToken}
              aria-busy={testMutation.isPending}
            >
              {testMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                  <span>Testando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />
                  <span>Testar Conexao</span>
                </>
              )}
            </Button>
            {testMutation.isSuccess && testMutation.data?.success && (
              <Badge variant="outline" className="text-green-600" aria-live="polite">
                <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />
                Conectado
              </Badge>
            )}
            {testMutation.isSuccess && !testMutation.data?.success && (
              <Badge variant="destructive" aria-live="polite">
                <XCircle className="h-3 w-3 mr-1" aria-hidden="true" />
                Falhou
              </Badge>
            )}
          </div>
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
                <span>Salvar Credenciais</span>
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
