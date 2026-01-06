'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, QrCode, Share2, ArrowLeft, ArrowRight, Copy, Check, Smartphone, Key, Cloud, Webhook, ExternalLink, CheckCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useCreateInstance } from '@/hooks/useInstance'
import { usePermissions } from '@/hooks/usePermissions'
import type { CreateInstanceInput } from '@/features/instances/instances.interfaces'
import { BrokerType } from '@/features/instances/instances.interfaces'
import { Alert, AlertDescription } from '@/components/ui/alert'

const createInstanceSchema = z.object({
  name: z.string().min(1, 'Nome e obrigatorio').max(100, 'Nome deve ter no maximo 100 caracteres'),
  brokerType: z.string().optional(),
  phoneNumber: z.string().optional(),
  webhookUrl: z.string().url('URL invalida').optional().or(z.literal('')),
  // Cloud API fields
  cloudApiAccessToken: z.string().optional(),
  cloudApiPhoneNumberId: z.string().optional(),
  cloudApiWabaId: z.string().optional(),
})

type CreateInstanceForm = z.infer<typeof createInstanceSchema>

// Tipos para o fluxo de etapas
type Step = 'form' | 'choose-connection' | 'qr-code' | 'share-link' | 'pairing-code' | 'success' | 'webhook-config'

interface CreateInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

/**
 * @component CreateInstanceModal
 * @description Modal para criar nova instancia WhatsApp
 * Fluxo: Formulario -> Escolha de Conexao -> QR Code ou Link de Compartilhamento
 */
export function CreateInstanceModal({ isOpen, onClose, onSuccess }: CreateInstanceModalProps) {
  const [step, setStep] = useState<Step>('form')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdInstance, setCreatedInstance] = useState<any>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [isGeneratingQR, setIsGeneratingQR] = useState(false)
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [isGeneratingPairingCode, setIsGeneratingPairingCode] = useState(false)
  const [pairingPhoneNumber, setPairingPhoneNumber] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedField, setCopiedField] = useState<'webhookUrl' | 'verifyToken' | null>(null)

  const createInstanceMutation = useCreateInstance()
  const { canSelectBroker } = usePermissions()

  const form = useForm<CreateInstanceForm>({
    resolver: zodResolver(createInstanceSchema),
    defaultValues: {
      name: '',
      brokerType: BrokerType.UAZAPI,
      phoneNumber: '',
      webhookUrl: '',
      cloudApiAccessToken: '',
      cloudApiPhoneNumberId: '',
      cloudApiWabaId: '',
    },
  })

  // Watch brokerType para mostrar campos condicionais
  const selectedBroker = form.watch('brokerType')
  const isCloudAPI = selectedBroker === BrokerType.CLOUDAPI

  // Etapa 1: Criar a instancia
  const onSubmit = async (data: CreateInstanceForm) => {
    setIsSubmitting(true)

    try {
      // Determinar provider baseado no broker type
      const isCloudAPIBroker = data.brokerType === BrokerType.CLOUDAPI

      // Validar campos Cloud API
      if (isCloudAPIBroker) {
        if (!data.cloudApiAccessToken) {
          toast.error('Token de acesso é obrigatório para Cloud API')
          setIsSubmitting(false)
          return
        }
        if (!data.cloudApiPhoneNumberId) {
          toast.error('ID do telefone é obrigatório para Cloud API')
          setIsSubmitting(false)
          return
        }
        if (!data.cloudApiWabaId) {
          toast.error('ID da WABA é obrigatório para Cloud API')
          setIsSubmitting(false)
          return
        }
      }

      const payload: CreateInstanceInput = {
        name: data.name,
        provider: isCloudAPIBroker ? 'WHATSAPP_CLOUD_API' : 'WHATSAPP_WEB',
        channel: 'WHATSAPP',
        ...(data.phoneNumber && { phoneNumber: data.phoneNumber }),
        // Cloud API fields
        ...(isCloudAPIBroker && {
          cloudApiAccessToken: data.cloudApiAccessToken,
          cloudApiPhoneNumberId: data.cloudApiPhoneNumberId,
          cloudApiWabaId: data.cloudApiWabaId,
        }),
      }

      const result = await createInstanceMutation.mutateAsync(payload)

      // Salvar instancia criada
      setCreatedInstance(result)

      // Para Cloud API, ir para configuração do webhook
      if (isCloudAPIBroker) {
        setStep('webhook-config')
        toast.success('Instância Cloud API criada! Configure o webhook no Meta.')
        onSuccess?.()
        return
      }

      // Para outros brokers, ir para escolha de conexao
      setStep('choose-connection')
      toast.success('Instancia criada! Escolha como deseja conectar.')
    } catch (error: any) {
      console.error('Erro ao criar instancia:', error)
      const errorMessage = error?.response?.data?.message ||
        error?.message ||
        error?.error?.message ||
        'Erro desconhecido ao criar instancia'
      toast.error(`Erro ao criar instancia: ${errorMessage}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Etapa 2a: Gerar QR Code para conectar aqui
  const handleConnectHere = async () => {
    if (!createdInstance?.id && !createdInstance?.data?.id) {
      toast.error('Instancia nao encontrada')
      return
    }

    setIsGeneratingQR(true)
    setStep('qr-code')

    try {
      const instanceId = createdInstance?.id || createdInstance?.data?.id
      const response = await fetch(`/api/v1/instances/${instanceId}/connect`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || errorData.error || 'Erro ao conectar')
      }

      const result = await response.json()
      const data = result.data || result

      if (data.qrcode || data.qr) {
        setQrCode(data.qrcode || data.qr)
      } else {
        toast.info('Aguardando QR Code...')
      }
    } catch (error: any) {
      toast.error(`Erro ao gerar QR Code: ${error.message}`)
      setStep('choose-connection')
    } finally {
      setIsGeneratingQR(false)
    }
  }

  // Etapa 2b: Gerar link de compartilhamento
  const handleGenerateShareLink = async () => {
    const instanceId = createdInstance?.id || createdInstance?.data?.id
    if (!instanceId) {
      toast.error('Instancia nao encontrada')
      return
    }

    setIsGeneratingLink(true)
    setStep('share-link')

    try {
      // Chamar API para gerar token de compartilhamento
      const response = await fetch(`/api/v1/instances/${instanceId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || errorData.error || 'Erro ao gerar link')
      }

      const result = await response.json()
      const shareUrl = result.data?.shareUrl || result.shareUrl

      if (!shareUrl) {
        throw new Error('URL de compartilhamento nao foi gerada')
      }

      setShareLink(shareUrl)
      toast.success('Link de compartilhamento gerado!')
    } catch (error: any) {
      toast.error(`Erro ao gerar link: ${error.message}`)
      setStep('choose-connection')
    } finally {
      setIsGeneratingLink(false)
    }
  }

  // Gerar Código de Pareamento
  const handleGeneratePairingCode = async () => {
    const instanceId = createdInstance?.id || createdInstance?.data?.id
    if (!instanceId) {
      toast.error('Instancia nao encontrada')
      return
    }

    if (!pairingPhoneNumber) {
      // Se não tiver número no state, tenta pegar da instância criada
      const instancePhone = createdInstance?.phoneNumber || createdInstance?.data?.phoneNumber
      if (instancePhone) {
        setPairingPhoneNumber(instancePhone)
      } else {
        // Se não tiver, o usuário vai ter que digitar na UI
      }
    }

    setIsGeneratingPairingCode(true)
    // Se o usuário ainda não digitou o número e não tem na instância, 
    // apenas mudamos o step para mostrar o input.
    // Mas se já estivermos no step e tiver numero, chamamos a API.

    // Simplificação: Vamos para o step 'pairing-code' primeiro.
    setStep('pairing-code')
    setIsGeneratingPairingCode(false)
  }

  const fetchPairingCode = async () => {
    if (!pairingPhoneNumber) {
      toast.error('Informe o número do WhatsApp')
      return
    }

    const instanceId = createdInstance?.id || createdInstance?.data?.id
    setIsGeneratingPairingCode(true)

    try {
      const response = await fetch(`/api/v1/instances/${instanceId}/pairing-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: pairingPhoneNumber }),
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || errorData.error || 'Erro ao gerar código')
      }

      const result = await response.json()
      const code = result.code || result.pairingCode || result.data?.code

      if (!code) {
        throw new Error('Código não retornado pela API')
      }

      setPairingCode(code)
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`)
    } finally {
      setIsGeneratingPairingCode(false)
    }
  }

  // Copiar link para clipboard
  const handleCopyLink = async () => {
    if (!shareLink) return

    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      toast.success('Link copiado!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Erro ao copiar link')
    }
  }

  // Gerar URL do webhook dinâmica por instância
  const getWebhookUrl = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    const instId = createdInstance?.id || createdInstance?.data?.id
    // URL dinâmica com instanceId para isolamento multi-tenant
    return instId
      ? `${baseUrl}/api/v1/webhooks/cloudapi/${instId}`
      : `${baseUrl}/api/v1/webhooks/cloudapi`
  }

  // Copiar URL do webhook (Cloud API)
  const handleCopyWebhookUrl = async () => {
    const webhookUrl = getWebhookUrl()
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopiedField('webhookUrl')
      toast.success('URL do Webhook copiada!')
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.error('Erro ao copiar URL')
    }
  }

  // Token de verificação - usa env pública ou default
  const getVerifyToken = () => process.env.NEXT_PUBLIC_CLOUDAPI_VERIFY_TOKEN || 'quayer-cloudapi-verify'

  // Copiar token de verificação (Cloud API)
  const handleCopyVerifyToken = async () => {
    const verifyToken = getVerifyToken()
    try {
      await navigator.clipboard.writeText(verifyToken)
      setCopiedField('verifyToken')
      toast.success('Token copiado!')
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.error('Erro ao copiar token')
    }
  }

  // Fechar e resetar
  const handleClose = () => {
    if (isSubmitting || isGeneratingQR || isGeneratingLink) return

    form.reset()
    setStep('form')
    setCreatedInstance(null)
    setQrCode(null)
    setShareLink(null)
    setPairingCode(null)
    setPairingPhoneNumber('')
    setCopied(false)
    setCopiedField(null)
    onClose()

    // Se criou instancia, chamar onSuccess
    if (createdInstance) {
      onSuccess?.()
    }
  }

  // Voltar para escolha de conexao
  const handleBack = () => {
    setStep('choose-connection')
    setQrCode(null)
    setShareLink(null)
    setPairingCode(null)
    setPairingPhoneNumber('')
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`${isCloudAPI ? 'sm:max-w-xl' : 'sm:max-w-md'} max-h-[90vh] overflow-y-auto`}>
        {/* Etapa 1: Formulario de criacao */}
        {step === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Nova Instancia WhatsApp
              </DialogTitle>
              <DialogDescription>
                Crie uma nova instancia para conectar uma conta WhatsApp
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Instancia</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ex: Minha Conta Pessoal"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription>
                        Nome identificador para esta instancia
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />


                {/* Seleção de Broker com Cards */}
                {canSelectBroker && (
                  <div className="space-y-3">
                    <FormLabel>Tipo de Broker / Provedor</FormLabel>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* UAZAPI Card */}
                      <div
                        className={`cursor-pointer border-2 rounded-lg p-4 transition-all hover:shadow-sm ${selectedBroker === BrokerType.UAZAPI ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                        onClick={() => form.setValue('brokerType', BrokerType.UAZAPI)}
                      >
                        <div className="flex flex-col items-center text-center space-y-2">
                          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                            <QrCode className="h-6 w-6 text-green-600 dark:text-green-400" />
                          </div>
                          <h4 className="font-semibold text-sm">UAZ API</h4>
                          <p className="text-xs text-muted-foreground">Conexão via QR Code ou Código. Gestão completa.</p>
                        </div>
                      </div>

                      {/* Cloud API Card */}
                      <div
                        className={`cursor-pointer border-2 rounded-lg p-4 transition-all hover:shadow-sm ${selectedBroker === BrokerType.CLOUDAPI ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                        onClick={() => form.setValue('brokerType', BrokerType.CLOUDAPI)}
                      >
                        <div className="flex flex-col items-center text-center space-y-2">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                            <Cloud className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                          </div>
                          <h4 className="font-semibold text-sm">WhatsApp Cloud API</h4>
                          <p className="text-xs text-muted-foreground">API Oficial da Meta. Alta estabilidade (SaaS).</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Campos específicos para Cloud API */}
                {isCloudAPI && (
                  <>
                    <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                      <AlertDescription className="text-sm">
                        Configure sua conta do WhatsApp Business no{' '}
                        <a
                          href="https://developers.facebook.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline font-medium"
                        >
                          Meta for Developers
                        </a>
                      </AlertDescription>
                    </Alert>

                    <FormField
                      control={form.control}
                      name="cloudApiAccessToken"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Token de Acesso *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder="EAAxxxxxxx..."
                              disabled={isSubmitting}
                            />
                          </FormControl>
                          <FormDescription>
                            System User Token do Meta Business
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="cloudApiPhoneNumberId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ID do Telefone (Phone Number ID) *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="123456789012345"
                              disabled={isSubmitting}
                            />
                          </FormControl>
                          <FormDescription>
                            Encontre em WhatsApp {'>'} Getting Started
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="cloudApiWabaId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ID da WABA (WhatsApp Business Account) *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="987654321098765"
                              disabled={isSubmitting}
                            />
                          </FormControl>
                          <FormDescription>
                            Encontre em Configurações {'>'} Conta do WhatsApp
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numero do Telefone (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="+5511999999999"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription>
                        Numero do WhatsApp que sera conectado
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="webhookUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Webhook URL (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://exemplo.com/webhook"
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormDescription>
                        URL para receber notificacoes de mensagens
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Continuar
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </>
        )}

        {/* Etapa 2: Escolher tipo de conexao */}
        {step === 'choose-connection' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Como deseja conectar?
              </DialogTitle>
              <DialogDescription>
                Escolha como deseja conectar o WhatsApp a instancia "{createdInstance?.name || createdInstance?.data?.name}"
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Opcao 1: Conectar aqui com QR Code */}
              <button
                onClick={handleConnectHere}
                className="w-full p-4 rounded-lg border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <QrCode className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">Conectar agora</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Escaneie o QR Code com seu celular para conectar imediatamente
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                </div>
              </button>

              {/* Opcao 2: Gerar link de compartilhamento */}
              <button
                onClick={handleGenerateShareLink}
                className="w-full p-4 rounded-lg border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-full bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                    <Share2 className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">Gerar link de compartilhamento</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Crie um link para enviar a outra pessoa conectar o WhatsApp dela
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                </div>
              </button>

              {/* Opcao 3: Código de Pareamento (Pairing Code) */}
              <button
                onClick={handleGeneratePairingCode}
                className="w-full p-4 rounded-lg border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-left group"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-full bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                    <Key className="h-6 w-6 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">Código de Pareamento</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Conecte usando apenas o número do telefone e um código
                    </p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                </div>
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                Fechar
              </Button>
            </div>
          </>
        )}

        {/* Etapa 3a: QR Code */}
        {step === 'qr-code' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Conectar WhatsApp
              </DialogTitle>
              <DialogDescription>
                Escaneie o QR Code com o WhatsApp do seu celular
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {isGeneratingQR ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center">Iniciando conexão com WhatsApp...<br />Isso pode levar alguns segundos.</p>
                </div>
              ) : qrCode ? (
                <div className="flex justify-center p-4 bg-white rounded-lg border">
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code"
                    width={256}
                    height={256}
                    className="rounded object-contain"
                  />
                </div>
              ) : (
                <Alert>
                  <AlertDescription>
                    Aguardando QR Code... Isso pode levar alguns segundos.
                  </AlertDescription>
                </Alert>
              )}

              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertDescription>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Abra o WhatsApp no celular</li>
                    <li>Toque em <strong>Mais opcoes</strong> ou <strong>Configuracoes</strong></li>
                    <li>Toque em <strong>Aparelhos conectados</strong></li>
                    <li>Toque em <strong>Conectar um aparelho</strong></li>
                    <li>Aponte a camera para o QR Code</li>
                  </ol>
                </AlertDescription>
              </Alert>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button
                type="button"
                onClick={handleClose}
                className="flex-1"
              >
                Concluir
              </Button>
            </div>
          </>
        )}

        {/* Etapa 3b: Link de compartilhamento */}
        {step === 'share-link' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                Link de Compartilhamento
              </DialogTitle>
              <DialogDescription>
                Envie este link para a pessoa que vai conectar o WhatsApp
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {isGeneratingLink ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Gerando link...</p>
                </div>
              ) : shareLink ? (
                <>
                  <div className="relative">
                    <Input
                      value={shareLink}
                      readOnly
                      className="pr-20 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={handleCopyLink}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-1 text-green-500" />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copiar
                        </>
                      )}
                    </Button>
                  </div>

                  <Alert className="bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900">
                    <Share2 className="h-4 w-4 text-emerald-600" />
                    <AlertDescription className="text-emerald-800 dark:text-emerald-200">
                      A pessoa que receber este link podera escanear um QR Code com o WhatsApp dela para conectar a esta instancia.
                    </AlertDescription>
                  </Alert>
                </>
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>
                    Erro ao gerar link. Tente novamente.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button
                type="button"
                onClick={handleClose}
                className="flex-1"
              >
                Concluir
              </Button>
            </div>
          </>
        )}

        {/* Etapa 3c: Código de Pareamento */}
        {step === 'pairing-code' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Código de Pareamento
              </DialogTitle>
              <DialogDescription>
                Conecte seu WhatsApp sem precisar da câmera
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {!pairingCode ? (
                <div className="space-y-4">
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertDescription className="text-amber-800 text-sm">
                      Insira o número de telefone do WhatsApp que você deseja conectar (ex: 5511999999999).
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2">
                    <Label>Número do WhatsApp</Label>
                    <Input
                      placeholder="5511999999999"
                      value={pairingPhoneNumber}
                      onChange={(e) => setPairingPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={fetchPairingCode}
                    disabled={!pairingPhoneNumber || pairingPhoneNumber.length < 10 || isGeneratingPairingCode}
                  >
                    {isGeneratingPairingCode ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...
                      </>
                    ) : (
                      'Gerar Código'
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-6 text-center">
                  <div className="flex flex-col items-center justify-center p-6 bg-secondary/20 rounded-lg border-2 border-dashed border-primary/50">
                    <p className="text-sm text-muted-foreground mb-2">Digite este código no seu celular:</p>
                    <div className="text-4xl font-mono font-bold tracking-widest bg-white dark:bg-black px-6 py-3 rounded border shadow-sm select-all">
                      {pairingCode}
                    </div>
                  </div>

                  <Alert>
                    <Smartphone className="h-4 w-4" />
                    <AlertDescription className="text-left text-xs">
                      <ol className="list-decimal list-inside space-y-1">
                        <li>No WhatsApp, vá em <strong>Aparelhos conectados</strong></li>
                        <li>Toque em <strong>Conectar um aparelho</strong></li>
                        <li>Toque em <strong>Conectar com número de telefone</strong></li>
                        <li>Digite o código acima</li>
                      </ol>
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                className="flex-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button
                type="button"
                onClick={handleClose}
                className="flex-1"
              >
                Concluir
              </Button>
            </div>
          </>
        )}

        {/* Etapa: Sucesso (Cloud API) */}
        {step === 'success' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                Instância Conectada!
              </DialogTitle>
              <DialogDescription>
                Sua instância Cloud API foi criada e conectada com sucesso
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-4">
              <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  <strong>{createdInstance?.name || createdInstance?.data?.name}</strong> está pronta para uso.
                  <br />
                  <span className="text-sm opacity-80">
                    Não esqueça de configurar o webhook no Meta for Developers apontando para sua URL de webhook.
                  </span>
                </AlertDescription>
              </Alert>

              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Nome Verificado:</strong> {createdInstance?.cloudApiVerifiedName || createdInstance?.data?.cloudApiVerifiedName || 'N/A'}</p>
                <p><strong>Telefone:</strong> {createdInstance?.phoneNumber || createdInstance?.data?.phoneNumber || 'N/A'}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={handleClose}
                className="w-full"
              >
                Concluir
              </Button>
            </div>
          </>
        )}

        {/* Etapa: Configuração Webhook (Cloud API) */}
        {step === 'webhook-config' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-blue-600" />
                Configure o Webhook
              </DialogTitle>
              <DialogDescription>
                Para receber mensagens, configure o webhook no Meta for Developers
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* Sucesso da criação com dados da instância */}
              <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  <strong>{createdInstance?.name || createdInstance?.data?.name}</strong> foi criada com sucesso!
                  {(createdInstance?.phoneNumber || createdInstance?.data?.phoneNumber || createdInstance?.cloudApiVerifiedName || createdInstance?.data?.cloudApiVerifiedName) && (
                    <div className="mt-2 pt-2 border-t border-green-300 dark:border-green-700 space-y-1 text-sm">
                      {(createdInstance?.phoneNumber || createdInstance?.data?.phoneNumber) && (
                        <div className="flex items-center gap-2">
                          <span>📱</span>
                          <span>{createdInstance?.phoneNumber || createdInstance?.data?.phoneNumber}</span>
                        </div>
                      )}
                      {(createdInstance?.cloudApiVerifiedName || createdInstance?.data?.cloudApiVerifiedName) && (
                        <div className="flex items-center gap-2">
                          <span>✓</span>
                          <span>{createdInstance?.cloudApiVerifiedName || createdInstance?.data?.cloudApiVerifiedName}</span>
                        </div>
                      )}
                    </div>
                  )}
                </AlertDescription>
              </Alert>

              {/* URL do Webhook - Dinâmica por instância */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">URL do Webhook (Callback URL)</Label>
                <div className="flex gap-2">
                  <Input
                    value={getWebhookUrl()}
                    readOnly
                    className="font-mono text-xs bg-muted"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyWebhookUrl}
                  >
                    {copiedField === 'webhookUrl' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Token de Verificação */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Token de Verificação (Verify Token)</Label>
                <div className="flex gap-2">
                  <Input
                    value={getVerifyToken()}
                    readOnly
                    className="font-mono text-xs bg-muted"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyVerifyToken}
                  >
                    {copiedField === 'verifyToken' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Campos para assinar */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Campos do Webhook (Webhook Fields)</Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs">messages</code>
                  <span>— Obrigatório</span>
                </div>
              </div>

              {/* Instruções */}
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                  <p className="font-medium mb-2">Como configurar:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Acesse o <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-1">Meta for Developers <ExternalLink className="h-3 w-3" /></a></li>
                    <li>Vá em seu App → WhatsApp → Configuration</li>
                    <li>Em "Webhook", clique em <strong>Edit</strong></li>
                    <li>Cole a <strong>URL do Webhook</strong> acima</li>
                    <li>Cole o <strong>Token de Verificação</strong></li>
                    <li>Clique em <strong>Verify and save</strong></li>
                    <li>Marque o campo <code className="bg-white/50 px-1 rounded">messages</code> e clique em <strong>Subscribe</strong></li>
                  </ol>
                </AlertDescription>
              </Alert>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                onClick={handleClose}
                className="w-full"
              >
                Concluir
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
