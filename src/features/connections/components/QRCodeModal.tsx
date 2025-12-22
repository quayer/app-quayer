/**
 * QR Code Modal
 *
 * Modal para exibir QR Code de conexão WhatsApp
 * Usa useInstanceStatus hook para polling automático (igual ao Admin)
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useInstanceStatus, useConnectInstance } from '@/hooks/useInstance'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, Smartphone, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
// Using regular img tag instead of next/image for base64 data URLs

/**
 * Extrai mensagem de erro de forma robusta, evitando [object Object]
 */
function extractErrorMessage(data: any, fallback: string = 'Erro desconhecido'): string {
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data.message === 'string') return data.message
  if (typeof data.error === 'string') return data.error
  if (typeof data.error?.message === 'string') return data.error.message
  if (typeof data.data?.message === 'string') return data.data.message
  if (typeof data.data?.error === 'string') return data.data.error
  return fallback
}

interface QRCodeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  connectionName: string
  onConnected?: () => void
}

// Tempo de expiração do QR Code em segundos
const QR_EXPIRATION_SECONDS = 120

export function QRCodeModal({
  open,
  onOpenChange,
  connectionId,
  connectionName,
  onConnected,
}: QRCodeModalProps) {
  const queryClient = useQueryClient()
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'qr' | 'connected' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [qrJustUpdated, setQrJustUpdated] = useState(false) // Para animação pulse
  const [countdown, setCountdown] = useState<number>(QR_EXPIRATION_SECONDS) // Countdown em segundos
  const connectedHandledRef = useRef(false) // Evitar callbacks duplicados
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ✅ USAR HOOK DO REACT QUERY COM POLLING 3s (IGUAL AO ADMIN)
  const { data: statusData } = useInstanceStatus(
    connectionId,
    open && !!connectionId && status !== 'connected' // Só pollar se modal aberto e não conectado
  )

  // ✅ DETECTAR CONEXÃO BEM-SUCEDIDA VIA HOOK (IGUAL AO ADMIN)
  useEffect(() => {
    if (!open || connectedHandledRef.current) return

    const statusValue = statusData?.status?.toLowerCase()

    if (statusValue === 'connected' || statusValue === 'open') {
      connectedHandledRef.current = true
      setStatus('connected')
      setQrCode(null)
      setError(null)

      toast.success('WhatsApp conectado com sucesso!', {
        description: `${connectionName} está pronto para uso.`,
        duration: 4000,
      })

      // Invalidar cache para atualizar lista de instâncias
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      queryClient.invalidateQueries({ queryKey: ['instances', connectionId] })
      queryClient.invalidateQueries({ queryKey: ['instances', connectionId, 'status'] })
      queryClient.invalidateQueries({ queryKey: ['instances', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['all-instances'] })

      // Callback para atualizar lista
      onConnected?.()

      // Auto-fechar após 3s
      setTimeout(() => {
        onOpenChange(false)
      }, 3000)
    } else if (statusValue === 'error' || statusValue === 'failed') {
      setStatus('error')
      setError('Erro na conexão. Tente novamente.')
    }
  }, [statusData?.status, open, connectionName, connectionId, queryClient, onConnected, onOpenChange])

  const handleConnect = async () => {
    setIsRefreshing(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/instances/${connectionId}/connect`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(extractErrorMessage(errorData, 'Erro ao conectar'))
      }

      const result = await response.json()
      // Desencapsular resposta: pode ser { data: { qrcode } } ou { qrcode } ou { qr }
      const data = result.data || result

      // Extrair QR code de múltiplos formatos possíveis
      const qrCodeValue = data.qrcode || data.qr || data.qrCode || data.base64 || data.code

      if (qrCodeValue) {
        setStatus('qr')
        setQrCode(qrCodeValue)
        // Resetar countdown
        setCountdown(QR_EXPIRATION_SECONDS)
        // Ativar animação pulse por 1.5 segundos
        setQrJustUpdated(true)
        setTimeout(() => setQrJustUpdated(false), 1500)
        toast.success('QR Code gerado com sucesso!')
      } else if (data.status?.toLowerCase() === 'connected') {
        setStatus('connected')
      } else {
        // Se não retornou QR code nem status connected, tentar buscar status
        console.warn('[QRCodeModal] Resposta sem qrcode:', data)
        setStatus('loading')
        // Toast informativo para o usuário
        toast.info('Aguardando QR Code... Tentando novamente em 3s')
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Erro ao conectar')
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar QR Code')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Auto-connect ao abrir e reset ao fechar
  useEffect(() => {
    if (open && status === 'loading') {
      handleConnect()
    }
    // Reset estado quando fecha
    if (!open) {
      setStatus('loading')
      setQrCode(null)
      setError(null)
      setIsRefreshing(false)
      setCountdown(QR_EXPIRATION_SECONDS)
      // Limpar intervalo do countdown
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Countdown para expiração do QR Code
  useEffect(() => {
    // Só ativar countdown quando QR code estiver visível
    if (status !== 'qr' || !qrCode) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
      return
    }

    // Iniciar countdown
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Tempo esgotado, auto-refresh
          handleConnect()
          return QR_EXPIRATION_SECONDS
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, qrCode])

  // Formatar countdown em MM:SS
  const formatCountdown = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby="qr-modal-description">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
          <DialogDescription id="qr-modal-description">
            Escaneie o QR Code para conectar {connectionName} ao WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" role="region" aria-live="polite" aria-atomic="true">
          {/* Loading */}
          {status === 'loading' && (
            <div
              className="flex flex-col items-center justify-center py-12 space-y-4"
              role="status"
              aria-busy="true"
              aria-label="Gerando QR Code, aguarde..."
            >
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
            </div>
          )}

          {/* QR Code */}
          {status === 'qr' && qrCode && (
            <div className="space-y-4">
              {/* Countdown Timer */}
              <div className="flex items-center justify-center gap-2">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                  countdown <= 30
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : countdown <= 60
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "bg-muted text-muted-foreground"
                )}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" strokeWidth="2" className="opacity-30" />
                    <path
                      strokeLinecap="round"
                      strokeWidth="2"
                      d={`M12 2 A10 10 0 ${countdown / QR_EXPIRATION_SECONDS > 0.5 ? 1 : 0} 1 ${12 + 10 * Math.sin(2 * Math.PI * (1 - countdown / QR_EXPIRATION_SECONDS))} ${12 - 10 * Math.cos(2 * Math.PI * (1 - countdown / QR_EXPIRATION_SECONDS))}`}
                    />
                  </svg>
                  <span aria-live="polite" aria-label={`QR Code expira em ${formatCountdown(countdown)}`}>
                    Expira em {formatCountdown(countdown)}
                  </span>
                </div>
              </div>

              <div className={cn(
                "flex justify-center p-4 bg-white rounded-lg border transition-all duration-300",
                qrJustUpdated && "ring-4 ring-primary/40 animate-pulse"
              )}>
                <img
                  src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt={`QR Code para conectar ${connectionName} ao WhatsApp. Escaneie este código com seu celular.`}
                  width={256}
                  height={256}
                  className={cn(
                    "rounded object-contain transition-transform",
                    qrJustUpdated && "scale-105"
                  )}
                  role="img"
                />
              </div>

              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertDescription>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Abra o WhatsApp no seu celular</li>
                    <li>
                      Toque em <strong>Mais opções</strong> ou{' '}
                      <strong>Configurações</strong>
                    </li>
                    <li>
                      Toque em <strong>Aparelhos conectados</strong>
                    </li>
                    <li>
                      Toque em <strong>Conectar um aparelho</strong>
                    </li>
                    <li>Aponte seu celular para esta tela para escanear o QR code</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleConnect}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Gerar novo QR Code
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Conectado */}
          {status === 'connected' && (
            <div
              className="flex flex-col items-center justify-center py-12 space-y-4"
              role="status"
              aria-label="WhatsApp conectado com sucesso"
              aria-live="polite"
            >
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                <div className="relative rounded-full bg-gradient-to-br from-green-400 to-emerald-600 p-4 shadow-lg shadow-green-500/30">
                  <PartyPopper className="h-12 w-12 text-white" aria-hidden="true" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="font-bold text-xl text-green-600 dark:text-green-400">
                  Conectado com sucesso!
                </p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  <strong>{connectionName}</strong> está ativo e pronto para enviar e receber mensagens.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-full">
                <Loader2 className="h-3 w-3 animate-spin" />
                Fechando automaticamente...
              </div>
              <Button
                onClick={() => onOpenChange(false)}
                className="mt-2 bg-green-600 hover:bg-green-700"
                autoFocus
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Fechar agora
              </Button>
            </div>
          )}

          {/* Erro */}
          {status === 'error' && (
            <div className="space-y-4" role="alert" aria-live="assertive">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>{error || 'Erro ao conectar'}</AlertDescription>
              </Alert>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleConnect}
                disabled={isRefreshing}
                aria-label={isRefreshing ? 'Tentando reconectar...' : 'Tentar conectar novamente'}
              >
                {isRefreshing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Tentando novamente...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Tentar novamente
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
