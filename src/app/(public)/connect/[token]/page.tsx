'use client'

/**
 * Client Guidance Page
 * Public page for clients to connect WhatsApp via shared link
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, XCircle, RefreshCw, Clock } from 'lucide-react'
import { api } from '@/igniter.client'
import Image from 'next/image'

export default function ConnectPage() {
  const params = useParams()
  const token = params.token as string

  const [step, setStep] = useState<'validating' | 'loading' | 'qr' | 'success' | 'error'>('validating')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(120) // 2 minutes
  const [instanceName, setInstanceName] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')

  // Validate token on mount
  useEffect(() => {
    validateToken()
  }, [token])

  // Timer countdown
  useEffect(() => {
    if (step !== 'qr' || timeLeft <= 0) return

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [step, timeLeft])

  // Poll connection status
  useEffect(() => {
    if (step !== 'qr') return

    const interval = setInterval(async () => {
      await checkConnectionStatus()
    }, 3000) // Check every 3 seconds

    return () => clearInterval(interval)
  }, [step, token])

  const validateToken = async () => {
    try {
      // ✅ FIX: Usar fetch direto para validar token
      const response = await fetch(`/api/v1/share/validate/${token}`)
      const result = await response.json()

      if (!response.ok || !result.data?.valid) {
        setStep('error')
        setErrorMessage('Link inválido ou expirado')
        return
      }

      setInstanceName(result.data.instanceName || 'WhatsApp')
      setStep('loading')
      await generateQRCode()
    } catch (error: any) {
      console.error('[Connect] Error validating token:', error)
      setStep('error')
      setErrorMessage('Erro ao validar token. Tente novamente.')
    }
  }

  const generateQRCode = async () => {
    try {
      const response = await api.share.generateQR.mutate({ body: { token } })

      if (!response.data) {
        setStep('error')
        setErrorMessage('Erro ao gerar QR Code')
        return
      }

      setQrCode((response.data as any).qrCode)
      setTimeLeft(Math.floor((response.data as any).expires / 1000))
      setStep('qr')
    } catch (error: any) {
      setStep('error')
      setErrorMessage('Erro ao gerar QR Code')
    }
  }

  const checkConnectionStatus = async () => {
    try {
      // ✅ FIX: Usar fetch direto para checar status
      const response = await fetch(`/api/v1/share/status/${token}`)
      const result = await response.json()

      if (!response.ok) {
        console.error('[Connect] Error checking status:', result)
        return
      }

      if (result.data?.status === 'connected') {
        setStep('success')
      } else if (result.data?.status === 'expired') {
        setStep('error')
        setErrorMessage('Link expirado')
      }
    } catch (error) {
      console.error('[Connect] Error checking status:', error)
    }
  }

  const handleRefresh = () => {
    setStep('loading')
    setQrCode(null)
    setTimeLeft(120)
    generateQRCode()
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-border/50 shadow-lg">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold text-theme-primary">
            App Quayer
          </CardTitle>
          <CardDescription className="text-lg">
            Conectar WhatsApp - {instanceName}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Validating State */}
          {step === 'validating' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-theme-primary" />
              <p className="text-muted-foreground">Validando link...</p>
            </div>
          )}

          {/* Loading State */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-theme-primary" />
              <p className="text-muted-foreground">Gerando QR Code...</p>
            </div>
          )}

          {/* QR Code State */}
          {step === 'qr' && qrCode && (
            <div className="space-y-6">
              {/* QR Code Display */}
              <div className="flex justify-center">
                <div className="relative p-6 bg-white rounded-xl shadow-inner border-4 border-theme-primary/20">
                  <Image
                    src={qrCode}
                    alt="QR Code"
                    width={300}
                    height={300}
                    className="rounded-lg"
                    unoptimized
                  />
                </div>
              </div>

              {/* Timer */}
              <div className="flex items-center justify-center gap-2 text-lg font-medium">
                <Clock className="h-5 w-5 text-theme-accent" />
                <span className={timeLeft < 30 ? 'text-destructive' : 'text-muted-foreground'}>
                  Expira em: {formatTime(timeLeft)}
                </span>
              </div>

              {/* Instructions */}
              <div className="space-y-4 bg-muted/50 p-6 rounded-lg border border-border/50">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  📱 Como conectar:
                </h3>
                <ol className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-theme-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <span>Abra o WhatsApp no seu celular</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-theme-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    <span>Toque em <strong>Menu</strong> ou <strong>Configurações</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-theme-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      3
                    </span>
                    <span>Selecione <strong>Dispositivos conectados</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-theme-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      4
                    </span>
                    <span>Toque em <strong>Conectar um dispositivo</strong></span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-theme-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      5
                    </span>
                    <span>Aponte a câmera para este QR Code</span>
                  </li>
                </ol>
              </div>

              {/* Refresh Button */}
              {timeLeft === 0 && (
                <Button
                  onClick={handleRefresh}
                  className="w-full bg-theme-primary hover:bg-theme-primary-hover"
                  size="lg"
                >
                  <RefreshCw className="mr-2 h-5 w-5" />
                  Atualizar QR Code
                </Button>
              )}
            </div>
          )}

          {/* Success State */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="rounded-full bg-success/10 p-6">
                <CheckCircle2 className="h-16 w-16 text-success" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-success">Conectado!</h3>
                <p className="text-muted-foreground">
                  WhatsApp conectado com sucesso
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {step === 'error' && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="rounded-full bg-destructive/10 p-6">
                  <XCircle className="h-16 w-16 text-destructive" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold text-destructive">Erro</h3>
                  <p className="text-muted-foreground">{errorMessage}</p>
                </div>
              </div>

              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  Este link pode ter expirado ou não ser mais válido. Entre em contato com quem
                  compartilhou este link para obter um novo.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}