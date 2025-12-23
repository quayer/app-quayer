'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, MessageSquare } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth/auth-provider'

export interface SignatureConfig {
  enabled: boolean
  format: 'first_name' | 'full_name' | 'name_department' | 'custom'
  department?: string
  customText?: string
  showPreview: boolean
}

const DEFAULT_CONFIG: SignatureConfig = {
  enabled: false,
  format: 'full_name',
  showPreview: true,
}

export function SignatureSettings() {
  const { user, refreshUser } = useAuth()
  const [config, setConfig] = useState<SignatureConfig>(DEFAULT_CONFIG)

  // Carregar config do usuario
  useEffect(() => {
    if ((user as any)?.messageSignature) {
      setConfig((user as any).messageSignature as SignatureConfig)
    }
  }, [user])

  // Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: async (data: SignatureConfig) => {
      // Check if endpoint exists
      if (!(api as any).users?.updatePreferences?.mutate) {
        throw new Error('Endpoint nao disponivel')
      }
      return (api as any).users.updatePreferences.mutate({
        body: { messageSignature: data }
      })
    },
    onSuccess: () => {
      toast.success('Assinatura salva com sucesso!')
      refreshUser?.()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar assinatura')
    },
  })

  // Gerar preview
  const getPreview = (): string => {
    if (!config.enabled) return ''

    const firstName = user?.name?.split(' ')[0] || 'Nome'
    const fullName = user?.name || 'Nome Completo'

    switch (config.format) {
      case 'first_name':
        return `*Atendimento com ${firstName}:*`
      case 'full_name':
        return `*Atendimento com ${fullName}:*`
      case 'name_department':
        return `*Atendimento com ${firstName} - ${config.department || 'Setor'}:*`
      case 'custom':
        return config.customText || '*Sua assinatura personalizada*'
      default:
        return ''
    }
  }

  const handleSave = () => {
    saveMutation.mutate(config)
  }

  return (
    <Card id="assinatura">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Assinatura de Atendimento
        </CardTitle>
        <CardDescription>
          Identifique-se automaticamente nas mensagens enviadas aos clientes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle principal */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Adicionar assinatura automaticamente</Label>
            <p className="text-sm text-muted-foreground">
              Sua identificacao sera adicionada no inicio das mensagens
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => setConfig(prev => ({ ...prev, enabled }))}
          />
        </div>

        {config.enabled && (
          <>
            {/* Formato */}
            <div className="space-y-3">
              <Label>Formato da assinatura</Label>
              <RadioGroup
                value={config.format}
                onValueChange={(format: SignatureConfig['format']) => setConfig(prev => ({ ...prev, format }))}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="first_name" id="first_name" />
                  <Label htmlFor="first_name" className="font-normal cursor-pointer">
                    Primeiro nome
                    <span className="text-muted-foreground ml-2">
                      → "Atendimento com {user?.name?.split(' ')[0]}:"
                    </span>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full_name" id="full_name" />
                  <Label htmlFor="full_name" className="font-normal cursor-pointer">
                    Nome completo
                    <span className="text-muted-foreground ml-2">
                      → "Atendimento com {user?.name}:"
                    </span>
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="name_department" id="name_department" />
                  <Label htmlFor="name_department" className="font-normal cursor-pointer">
                    Nome + Setor
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom" className="font-normal cursor-pointer">
                    Personalizado
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Campo de departamento */}
            {config.format === 'name_department' && (
              <div className="space-y-2 ml-6">
                <Label htmlFor="department">Nome do setor</Label>
                <Input
                  id="department"
                  value={config.department || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, department: e.target.value }))}
                  placeholder="Ex: Suporte, Vendas, Financeiro"
                  maxLength={50}
                />
              </div>
            )}

            {/* Campo customizado */}
            {config.format === 'custom' && (
              <div className="space-y-2 ml-6">
                <Label htmlFor="customText">Texto personalizado</Label>
                <Input
                  id="customText"
                  value={config.customText || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, customText: e.target.value }))}
                  placeholder="Ex: *Equipe Quayer - Gabriel aqui:*"
                  maxLength={200}
                />
                <p className="text-xs text-muted-foreground">
                  Use *texto* para negrito no WhatsApp
                </p>
              </div>
            )}

            {/* Toggle de preview */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Mostrar preview ao digitar</Label>
                <p className="text-sm text-muted-foreground">
                  Visualize como a mensagem ficara antes de enviar
                </p>
              </div>
              <Switch
                checked={config.showPreview}
                onCheckedChange={(showPreview) => setConfig(prev => ({ ...prev, showPreview }))}
              />
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <Alert className="bg-muted/50">
                <AlertDescription className="font-mono text-sm whitespace-pre-wrap">
                  {getPreview()}
                  {'\n\n'}
                  Sua mensagem aparecera aqui...
                </AlertDescription>
              </Alert>
            </div>
          </>
        )}

        {/* Botao salvar */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar assinatura
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
