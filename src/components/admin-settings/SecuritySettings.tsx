'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Shield, Save, RefreshCw, Info, AlertTriangle, Clock, FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { api, getAuthHeaders } from '@/igniter.client'
import { ApiKeysSettings } from './ApiKeysSettings'

interface SecuritySettingsData {
  accessTokenExpiresIn: string
  refreshTokenExpiresIn: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  rateLimitEnabled?: boolean
  rateLimitRequests?: number
  rateLimitWindow?: string
}

const TOKEN_EXPIRY_OPTIONS = [
  { value: '5m', label: '5 minutos' },
  { value: '15m', label: '15 minutos' },
  { value: '30m', label: '30 minutos' },
  { value: '1h', label: '1 hora' },
  { value: '2h', label: '2 horas' },
  { value: '6h', label: '6 horas' },
  { value: '12h', label: '12 horas' },
  { value: '1d', label: '1 dia' },
]

const REFRESH_TOKEN_OPTIONS = [
  { value: '1d', label: '1 dia' },
  { value: '7d', label: '7 dias' },
  { value: '14d', label: '14 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
]

const LOG_LEVELS = [
  { value: 'debug', label: 'Debug', description: 'Máximo de detalhes (desenvolvimento)' },
  { value: 'info', label: 'Info', description: 'Informações gerais (recomendado)' },
  { value: 'warn', label: 'Warn', description: 'Apenas avisos e erros' },
  { value: 'error', label: 'Error', description: 'Apenas erros críticos' },
]

export function SecuritySettings() {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<SecuritySettingsData>({
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
    logLevel: 'info',
    rateLimitEnabled: true,
    rateLimitRequests: 100,
    rateLimitWindow: '1m',
  })

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings', 'security'],
    queryFn: async () => {
      const result = await (api['system-settings'].getByCategory as any).query({
        params: { category: 'security' },
        headers: getAuthHeaders(),
      })
      return result.data as SecuritySettingsData
    },
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        accessTokenExpiresIn: settings.accessTokenExpiresIn || '15m',
        refreshTokenExpiresIn: settings.refreshTokenExpiresIn || '7d',
        logLevel: settings.logLevel || 'info',
        rateLimitEnabled: settings.rateLimitEnabled ?? true,
        rateLimitRequests: settings.rateLimitRequests || 100,
        rateLimitWindow: settings.rateLimitWindow || '1m',
      })
    }
  }, [settings])

  // Save settings
  const saveMutation = useMutation({
    mutationFn: async (data: SecuritySettingsData) => {
      return (api['system-settings'].updateSecurity.mutate as any)({
        body: data,
      })
    },
    onSuccess: () => {
      toast.success('Configurações de segurança salvas!')
      queryClient.invalidateQueries({ queryKey: ['system-settings', 'security'] })
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`)
    },
  })

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div role="status" aria-busy="true" aria-label="Carregando configurações de segurança">
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Carregando configurações de segurança...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* JWT Tokens */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" aria-hidden="true" />
            Tokens JWT
          </CardTitle>
          <CardDescription>
            Configure a expiração dos tokens de autenticação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert role="note">
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Sobre tokens</AlertTitle>
            <AlertDescription>
              <strong>Access Token:</strong> Token de curta duração usado para autenticar requisições.
              <br />
              <strong>Refresh Token:</strong> Token de longa duração usado para renovar o access token.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label id="access-token-label">Expiração do Access Token</Label>
              <Select
                value={formData.accessTokenExpiresIn}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, accessTokenExpiresIn: value }))
                }
              >
                <SelectTrigger aria-labelledby="access-token-label" aria-describedby="access-token-hint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOKEN_EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="access-token-hint" className="text-xs text-muted-foreground">
                Tempo até o access token expirar
              </p>
            </div>

            <div className="space-y-2">
              <Label id="refresh-token-label">Expiração do Refresh Token</Label>
              <Select
                value={formData.refreshTokenExpiresIn}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, refreshTokenExpiresIn: value }))
                }
              >
                <SelectTrigger aria-labelledby="refresh-token-label" aria-describedby="refresh-token-hint">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REFRESH_TOKEN_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id="refresh-token-hint" className="text-xs text-muted-foreground">
                Tempo até o usuário precisar fazer login novamente
              </p>
            </div>
          </div>

          <Alert variant="destructive" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Atenção</AlertTitle>
            <AlertDescription>
              Tokens mais curtos são mais seguros, mas exigem renovação mais frequente.
              Em produção, recomendamos access tokens de 15-30 minutos.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Logging */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" aria-hidden="true" />
            Logs
          </CardTitle>
          <CardDescription>
            Configure o nível de detalhamento dos logs da aplicação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="sr-only">Selecione o nível de log</legend>
            {LOG_LEVELS.map((level) => (
              <label
                key={level.value}
                className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                  formData.logLevel === level.value
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/50'
                } focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2`}
              >
                <input
                  type="radio"
                  name="logLevel"
                  value={level.value}
                  checked={formData.logLevel === level.value}
                  onChange={() =>
                    setFormData((prev) => ({ ...prev, logLevel: level.value as any }))
                  }
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{level.label}</span>
                    {formData.logLevel === level.value && (
                      <Badge variant="default" className="text-xs">Ativo</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{level.description}</p>
                </div>
              </label>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      {/* Rate Limiting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" aria-hidden="true" />
            Rate Limiting
          </CardTitle>
          <CardDescription>
            Proteja a API contra abuso limitando o número de requisições.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert role="note">
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              O rate limiting está configurado via variáveis de ambiente.
              Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN para habilitar.
            </AlertDescription>
          </Alert>

          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Configuração atual (via .env)</h4>
            <ul className="text-sm text-muted-foreground space-y-1" aria-label="Lista de configurações de rate limiting">
              <li>• Limite: 100 requisições por minuto por IP</li>
              <li>• Endpoints protegidos: /api/v1/*</li>
              <li>• Endpoints públicos: /api/v1/auth/login, /api/v1/auth/register</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <ApiKeysSettings />

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
    </div>
  )
}
