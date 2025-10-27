/**
 * QR Code Modal
 *
 * Modal para exibir QR Code de conexão WhatsApp
 */

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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react'
import Image from 'next/image'

interface QRCodeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  connectionName: string
}

export function QRCodeModal({
  open,
  onOpenChange,
  connectionId,
  connectionName,
}: QRCodeModalProps) {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'qr' | 'connected' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Poll status a cada 3 segundos
  useEffect(() => {
    if (!open) return

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/v1/connections/${connectionId}/status`)

        if (!response.ok) {
          throw new Error('Erro ao verificar status')
        }

        const data = await response.json()

        if (data.connected) {
          setStatus('connected')
          setQrCode(null)
        } else if (data.qr) {
          setStatus('qr')
          setQrCode(data.qr)
          setError(null)
        } else if (data.status === 'ERROR') {
          setStatus('error')
          setError(data.error || 'Erro na conexão')
        }
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Erro desconhecido')
      }
    }

    // Check inicial
    checkStatus()

    // Poll a cada 3s
    const interval = setInterval(checkStatus, 3000)

    return () => clearInterval(interval)
  }, [connectionId, open])

  const handleConnect = async () => {
    setIsRefreshing(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/connections/${connectionId}/connect`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Erro ao conectar')
      }

      const data = await response.json()

      if (data.qr) {
        setStatus('qr')
        setQrCode(data.qr)
      } else if (data.status === 'CONNECTED') {
        setStatus('connected')
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Erro ao conectar')
    } finally {
      setIsRefreshing(false)
    }
  }

  // Auto-connect ao abrir
  useEffect(() => {
    if (open && status === 'loading') {
      handleConnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
          <DialogDescription>{connectionName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Loading */}
          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
            </div>
          )}

          {/* QR Code */}
          {status === 'qr' && qrCode && (
            <div className="space-y-4">
              <div className="flex justify-center p-4 bg-white rounded-lg border">
                <Image
                  src={qrCode}
                  alt="QR Code"
                  width={256}
                  height={256}
                  className="rounded"
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
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
              <div className="text-center space-y-2">
                <p className="font-semibold text-lg">Conectado com sucesso!</p>
                <p className="text-sm text-muted-foreground">
                  Sua conexão está ativa e pronta para uso
                </p>
              </div>
              <Button onClick={() => onOpenChange(false)} className="mt-4">
                Fechar
              </Button>
            </div>
          )}

          {/* Erro */}
          {status === 'error' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error || 'Erro ao conectar'}</AlertDescription>
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
                    Tentando novamente...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
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
