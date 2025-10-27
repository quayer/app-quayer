'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  QrCode,
  Smartphone,
  Clock,
  CheckCircle,
  Loader2,
  RefreshCw,
  X,
  Copy,
  Share2
} from 'lucide-react'
import { toast } from 'sonner'
import type { Instance } from '@prisma/client'
import type { QRCodeResponse } from '@/features/instances/instances.interfaces'
import { useConnectInstance, useInstanceStatus } from '@/hooks/useInstance'

interface ConnectionModalProps {
  instance: Instance | null
  isOpen: boolean
  onClose: () => void
}

/**
 * @component ConnectionModal
 * @description Modal para conectar instância WhatsApp via QR Code
 * Inclui countdown timer, auto-refresh e instruções passo a passo
 */
export function ConnectionModal({ instance, isOpen, onClose }: ConnectionModalProps) {
  const [qrData, setQrData] = useState<QRCodeResponse | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [isExpired, setIsExpired] = useState(false)
  const [step, setStep] = useState(1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const connectMutation = useConnectInstance()
  const { data: statusData, isLoading: statusLoading } = useInstanceStatus(
    instance?.id || '',
    isOpen && !!instance
  )

  // Business Logic: Gerar QR Code quando modal abrir
  useEffect(() => {
    if (isOpen && instance && !connectMutation.loading) {
      generateQRCode()
    }
  }, [isOpen, instance])

  // Business Logic: Verificar se instância foi conectada
  useEffect(() => {
    if (!isOpen) return

    if (statusData?.status === 'connected' && step !== 4) {
      setStep(4) // Conectado com sucesso
      setTimeout(() => {
        onClose()
        // Reset states on close
        setQrData(null)
        setTimeLeft(120)
        setIsExpired(false)
        setStep(0)
        setErrorMessage(null)
      }, 2000)
    }
  }, [statusData?.status, isOpen, step])

  // Business Logic: Countdown timer para QR Code
  useEffect(() => {
    if (!qrData || isExpired) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsExpired(true)
          setStep(3) // QR Expirado
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [qrData, isExpired])

  const generateQRCode = async () => {
    if (!instance) return

    try {
      setStep(1) // Gerando QR
      setIsExpired(false)
      setErrorMessage(null)
      const response = await connectMutation.mutateAsync(instance.id)

      // Validar resposta da API
      if (!response) {
        throw new Error('Resposta vazia da API')
      }

      if (!response.qrcode) {
        throw new Error('QR Code não foi gerado pela API')
      }

      setQrData(response)

      // Aceitar expires em segundos ou milissegundos
      // Se > 10000, já está em milissegundos, senão converter
      const expiresMs = response.expires > 10000
        ? response.expires
        : response.expires * 1000

      setTimeLeft(Math.floor(expiresMs / 1000)) // Converter para segundos
      setStep(2) // QR Gerado
    } catch (error: any) {
      // Capturar mensagem de erro da API
      const apiError = error?.response?.data?.error?.message ||
                       error?.response?.data?.message ||
                       error?.message ||
                       'Erro desconhecido ao gerar QR Code'

      console.error('Erro ao gerar QR Code:', apiError, error)
      setErrorMessage(apiError)
      setStep(3) // Erro
    }
  }

  const handleRefresh = () => {
    generateQRCode()
  }

  const handleClose = () => {
    // Reset all states when closing
    setQrData(null)
    setTimeLeft(120)
    setIsExpired(false)
    setStep(0)
    setErrorMessage(null)
    onClose()
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Copiar QR Code como imagem
  const handleCopyQR = async () => {
    if (!qrData?.qrcode) return

    try {
      const response = await fetch(qrData.qrcode)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
      toast.success('✅ QR Code copiado!', {
        description: 'Cole em qualquer lugar (WhatsApp, Email, etc)'
      })
    } catch (error) {
      console.error('Erro ao copiar:', error)
      toast.error('❌ Erro ao copiar', {
        description: 'Seu navegador não suporta copiar imagens'
      })
    }
  }

  // Compartilhar QR Code via Web Share API
  const handleShareQR = async () => {
    if (!qrData?.qrcode) return

    try {
      const response = await fetch(qrData.qrcode)
      const blob = await response.blob()
      const file = new File([blob], 'qrcode-whatsapp.png', { type: 'image/png' })

      if (navigator.share) {
        await navigator.share({
          title: `Conectar WhatsApp - ${instance?.name}`,
          text: 'Escaneie este QR Code para conectar seu WhatsApp',
          files: [file]
        })
        toast.success('✅ Compartilhado com sucesso!')
      } else {
        // Fallback: Download
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'qrcode-whatsapp.png'
        a.click()
        URL.revokeObjectURL(url)
        toast.success('✅ QR Code baixado!', {
          description: 'Envie o arquivo para conectar'
        })
      }
    } catch (error) {
      console.error('Erro ao compartilhar:', error)
      toast.error('❌ Erro ao compartilhar')
    }
  }

  const getStepIcon = () => {
    switch (step) {
      case 1:
        return <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      case 2:
        return <QrCode className="h-8 w-8 text-blue-400" />
      case 3:
        return <X className="h-8 w-8 text-red-400" />
      case 4:
        return <CheckCircle className="h-8 w-8 text-emerald-400" />
      default:
        return <QrCode className="h-8 w-8 text-blue-400" />
    }
  }

  const getStepTitle = () => {
    switch (step) {
      case 1:
        return 'Gerando QR Code...'
      case 2:
        return 'Escaneie o QR Code'
      case 3:
        return errorMessage ? 'Erro ao Conectar' : 'QR Code Expirado'
      case 4:
        return 'Conectado com Sucesso!'
      default:
        return 'Conectando...'
    }
  }

  const getStepDescription = () => {
    switch (step) {
      case 1:
        return 'Estamos preparando o QR Code para conectar sua conta WhatsApp...'
      case 2:
        return 'Abra o WhatsApp no seu celular e escaneie o código abaixo:'
      case 3:
        return errorMessage || 'O QR Code expirou. Clique em "Atualizar" para gerar um novo código.'
      case 4:
        return 'Parabéns! Sua instância foi conectada com sucesso.'
      default:
        return ''
    }
  }

  if (!instance) return null

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {getStepIcon()}
            {getStepTitle()}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {getStepDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações da Instância */}
          <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Instância:</span>
              <span className="text-white font-medium">{instance.name}</span>
            </div>
            {instance.phoneNumber && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Número:</span>
                <span className="text-white font-mono text-sm">{instance.phoneNumber}</span>
              </div>
            )}
          </div>

          {/* QR Code ou Status */}
          {step === 2 && qrData && (
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-lg flex justify-center">
                <img 
                  src={qrData.qrcode} 
                  alt="QR Code WhatsApp" 
                  className="w-48 h-48"
                />
              </div>
              
              {/* Timer */}
              <div className="flex items-center justify-center gap-2">
                <Clock className="h-4 w-4 text-theme-accent" />
                <Badge
                  variant="outline"
                  className="border-theme-accent/20 text-theme-accent"
                >
                  Expira em: {formatTime(timeLeft)}
                </Badge>
              </div>

              {/* Botões de Compartilhamento */}
              <div className="flex gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={handleCopyQR}
                      className="flex-1 border-gray-600 hover:bg-gray-800"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar QR
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copiar QR Code como imagem para a área de transferência</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      onClick={handleShareQR}
                      className="flex-1 border-gray-600 hover:bg-gray-800"
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Compartilhar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Compartilhar QR Code via WhatsApp, Email ou outras apps</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

          {/* Status de Conexão */}
          {statusLoading && (
            <div className="flex items-center justify-center gap-2 text-theme-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Verificando conexão...</span>
            </div>
          )}

          {/* Instruções */}
          {step === 2 && (
            <div className="bg-theme-primary/10 border border-theme-primary/20 rounded-lg p-4">
              <h4 className="text-theme-primary font-medium mb-2 flex items-center gap-2">
                <Smartphone className="h-4 w-4" />
                Como conectar:
              </h4>
              <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                <li>Abra o WhatsApp no seu celular</li>
                <li>Toque em "Menu" ou "Configurações"</li>
                <li>Selecione "Dispositivos conectados"</li>
                <li>Toque em "Conectar um dispositivo"</li>
                <li>Escaneie o QR Code acima</li>
              </ol>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3">
            {step === 3 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleRefresh}
                    disabled={connectMutation.loading}
                    className="flex-1 bg-theme-primary hover:bg-theme-primary-hover"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Atualizar QR
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Gerar um novo QR Code (o anterior expirou)</p>
                </TooltipContent>
              </Tooltip>
            )}

            {step !== 4 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleClose}
                    className="border-gray-600 text-gray-300 hover:bg-gray-800"
                  >
                    Cancelar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Fechar e cancelar conexão</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Sucesso */}
          {step === 4 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
              <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-emerald-400 font-medium">
                Conexão estabelecida com sucesso!
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Esta janela será fechada automaticamente...
              </p>
            </div>
          )}
        </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
