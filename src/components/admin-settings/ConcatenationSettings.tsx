'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Save, RefreshCw, Info, Clock, Hash, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { toast } from 'sonner'
import { api, getAuthHeaders } from '@/igniter.client'

interface ConcatenationSettingsData {
  timeout: number
  maxMessages: number
  sameTypeOnly: boolean
  sameSenderOnly: boolean
}

export function ConcatenationSettings() {
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState<ConcatenationSettingsData>({
    timeout: 8000,
    maxMessages: 10,
    sameTypeOnly: false,
    sameSenderOnly: true,
  })

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings', 'concatenation'],
    queryFn: async () => {
      const result = await (api['system-settings'].getByCategory as any).query({
        params: { category: 'concatenation' },
        headers: getAuthHeaders(),
      })
      return result.data as ConcatenationSettingsData
    },
  })

  useEffect(() => {
    if (settings) {
      setFormData({
        timeout: settings.timeout ?? 8000,
        maxMessages: settings.maxMessages ?? 10,
        sameTypeOnly: settings.sameTypeOnly ?? false,
        sameSenderOnly: settings.sameSenderOnly ?? true,
      })
    }
  }, [settings])

  // Save settings
  const saveMutation = useMutation({
    mutationFn: async (data: ConcatenationSettingsData) => {
      return (api['system-settings'].updateConcatenation.mutate as any)({
        body: data,
        headers: getAuthHeaders(),
      })
    },
    onSuccess: () => {
      toast.success('Configurações de concatenação salvas!')
      queryClient.invalidateQueries({ queryKey: ['system-settings', 'concatenation'] })
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
          <div role="status" aria-busy="true" aria-label="Carregando configurações de concatenação">
            <Skeleton className="h-64 w-full" />
            <span className="sr-only">Carregando configurações de concatenação...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" aria-hidden="true" />
          Concatenação de Mensagens
        </CardTitle>
        <CardDescription>
          Configure como mensagens rápidas do mesmo contato são agrupadas antes de serem processadas.
          Isso otimiza a experiência de chatbots e atendimento humano.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert role="note">
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Como funciona</AlertTitle>
          <AlertDescription>
            Quando um contato envia várias mensagens em sequência rápida, o sistema aguarda um tempo
            antes de processar, agrupando todas em uma única mensagem concatenada. Isso evita
            respostas fragmentadas do chatbot.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          {/* Timeout */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Label id="timeout-label">Tempo de espera (timeout)</Label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <Slider
                  value={[formData.timeout]}
                  onValueChange={([value]) => setFormData((prev) => ({ ...prev, timeout: value }))}
                  min={1000}
                  max={30000}
                  step={1000}
                  className="flex-1"
                  aria-labelledby="timeout-label"
                  aria-describedby="timeout-hint"
                  aria-valuetext={`${formData.timeout / 1000} segundos`}
                />
                <div className="w-24 text-right" aria-live="polite">
                  <span className="font-mono text-lg">{formData.timeout / 1000}s</span>
                </div>
              </div>
              <p id="timeout-hint" className="text-xs text-muted-foreground">
                Tempo que o sistema aguarda por novas mensagens antes de processar o bloco.
                Recomendado: 5-10 segundos.
              </p>
            </div>
          </div>

          <Separator />

          {/* Max Messages */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Label id="max-messages-label">Máximo de mensagens por bloco</Label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <Slider
                  value={[formData.maxMessages]}
                  onValueChange={([value]) => setFormData((prev) => ({ ...prev, maxMessages: value }))}
                  min={1}
                  max={50}
                  step={1}
                  className="flex-1"
                  aria-labelledby="max-messages-label"
                  aria-describedby="max-messages-hint"
                  aria-valuetext={`${formData.maxMessages} mensagens`}
                />
                <div className="w-24 text-right" aria-live="polite">
                  <span className="font-mono text-lg">{formData.maxMessages}</span>
                </div>
              </div>
              <p id="max-messages-hint" className="text-xs text-muted-foreground">
                Número máximo de mensagens que podem ser agrupadas em um único bloco.
                Recomendado: 10-20 mensagens.
              </p>
            </div>
          </div>

          <Separator />

          {/* Same Type Only */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p id="same-type-label" className="font-medium">Concatenar apenas mesmo tipo</p>
                <p id="same-type-desc" className="text-sm text-muted-foreground">
                  {formData.sameTypeOnly
                    ? 'Separa texto, áudio e imagem em blocos diferentes'
                    : 'Concatena TUDO junto, independente do formato'}
                </p>
              </div>
            </div>
            <Switch
              checked={formData.sameTypeOnly}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, sameTypeOnly: checked }))
              }
              aria-labelledby="same-type-label"
              aria-describedby="same-type-desc"
            />
          </div>

          <Alert variant={formData.sameTypeOnly ? 'default' : 'destructive'} role="note" aria-live="polite">
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Recomendação</AlertTitle>
            <AlertDescription>
              {formData.sameTypeOnly ? (
                <>
                  <strong>Melhor para atendimento humano:</strong> Cada tipo de mídia é processado
                  separadamente, permitindo visualização clara de cada conteúdo.
                </>
              ) : (
                <>
                  <strong>Melhor para IA/Chatbot:</strong> Todo conteúdo é concatenado em um único
                  contexto, permitindo que a IA entenda a mensagem completa do usuário.
                </>
              )}
            </AlertDescription>
          </Alert>

          {/* Same Sender Only */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p id="same-sender-label" className="font-medium">Apenas mesmo remetente</p>
                <p id="same-sender-desc" className="text-sm text-muted-foreground">
                  Concatena apenas mensagens do mesmo contato (recomendado sempre ativo)
                </p>
              </div>
            </div>
            <Switch
              checked={formData.sameSenderOnly}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, sameSenderOnly: checked }))
              }
              aria-labelledby="same-sender-label"
              aria-describedby="same-sender-desc"
            />
          </div>
        </div>

        <Separator />

        {/* Preview */}
        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
          <h4 className="font-medium">Configuração Atual</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Aguarda até <strong>{formData.timeout / 1000} segundos</strong> por novas mensagens</li>
            <li>• Máximo de <strong>{formData.maxMessages} mensagens</strong> por bloco</li>
            <li>• {formData.sameTypeOnly ? 'Separa' : 'Concatena'} diferentes tipos de mídia</li>
            <li>• {formData.sameSenderOnly ? 'Apenas' : 'Não restringe a'} mesmo remetente</li>
          </ul>
        </div>

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
  )
}
