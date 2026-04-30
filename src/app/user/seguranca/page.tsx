'use client'

import { useState, useEffect, useCallback } from 'react'
import { Monitor, Smartphone, Shield, Loader2, ShieldCheck, ShieldOff, Copy, Download, RefreshCw, Eye, EyeOff, KeyRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/client/components/ui/input-otp'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/client/components/ui/alert-dialog'
import { toast } from 'sonner'
import { getCsrfHeaders } from '@/client/hooks/use-csrf-token'

// ============================================
// Types
// ============================================

interface DeviceSession {
  id: string
  userId: string
  deviceName: string | null
  userAgent: string | null
  ipAddress: string | null
  location: string | null
  lastActiveAt: string
  isRevoked: boolean
  revokedAt: string | null
  createdAt: string
}

interface TotpDevice {
  id: string
  name: string
  verified: boolean
  createdAt: string
}

interface TotpSetupResponse {
  qrCode: string
  secret: string
  deviceId: string
  recoveryCodes: string[]
}

// ============================================
// Helpers
// ============================================

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...getCsrfHeaders(), ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || body.error || `Erro ${res.status}`)
  }
  return res.json()
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return 'Agora mesmo'
  if (diffMin < 60) return `${diffMin} min atr\u00e1s`
  if (diffHours < 24) return `${diffHours}h atr\u00e1s`
  if (diffDays < 7) return `${diffDays}d atr\u00e1s`

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getDeviceIcon(userAgent: string | null) {
  if (!userAgent) return Monitor
  const ua = userAgent.toLowerCase()
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return Smartphone
  }
  return Monitor
}

function isCurrentDevice(deviceUserAgent: string | null): boolean {
  if (!deviceUserAgent || typeof navigator === 'undefined') return false
  return navigator.userAgent === deviceUserAgent
}

// ============================================
// Recovery Codes Grid (module-scope to prevent re-creation on each render)
// ============================================

interface RecoveryCodesGridProps {
  codes: string[]
  onCopy: (codes: string[]) => void
  onDownload: (codes: string[]) => void
}

function RecoveryCodesGrid({ codes, onCopy, onDownload }: RecoveryCodesGridProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {codes.map((code, i) => (
          <div
            key={i}
            className="bg-muted rounded-md px-3 py-2 text-center font-mono text-sm tracking-wider"
          >
            {code}
          </div>
        ))}
      </div>
      <Alert>
        <KeyRound className="h-4 w-4" />
        <AlertDescription>
          Guarde estes codigos em local seguro. Eles nao serao mostrados novamente.
          Cada codigo so pode ser usado uma vez.
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onCopy(codes)}>
          <Copy className="h-4 w-4 mr-2" />
          Copiar todos
        </Button>
        <Button variant="outline" size="sm" onClick={() => onDownload(codes)}>
          <Download className="h-4 w-4 mr-2" />
          Download .txt
        </Button>
      </div>
    </div>
  )
}

// ============================================
// 2FA Section Component
// ============================================

function TwoFactorSection() {
  const [devices, setDevices] = useState<TotpDevice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [is2FAEnabled, setIs2FAEnabled] = useState(false)

  // Setup wizard state
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupStep, setSetupStep] = useState(1)
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null)
  const [setupLoading, setSetupLoading] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [secretVisible, setSecretVisible] = useState(false)

  // Disable 2FA modal state
  const [disableOpen, setDisableOpen] = useState(false)
  const [disableEmailCode, setDisableEmailCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disableLoading, setDisableLoading] = useState(false)
  const [disableError, setDisableError] = useState<string | null>(null)
  const [disableEmailSent, setDisableEmailSent] = useState(false)
  const [disableEmailSending, setDisableEmailSending] = useState(false)

  // Regenerate codes modal state
  const [regenOpen, setRegenOpen] = useState(false)
  const [regenCode, setRegenCode] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [regenCodes, setRegenCodes] = useState<string[] | null>(null)

  const fetchDevices = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: TotpDevice[] }>('/api/v1/auth/totp/devices')
      const deviceList = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? (res as unknown as TotpDevice[]) : []
      setDevices(deviceList)
      setIs2FAEnabled(deviceList.some(d => d.verified))
    } catch {
      // User might not have any devices yet — that's fine
      setDevices([])
      setIs2FAEnabled(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // ------- Setup Wizard -------

  const handleStartSetup = async () => {
    setSetupOpen(true)
    setSetupStep(1)
    setSetupData(null)
    setVerifyCode('')
    setVerifyError(null)
    setSecretVisible(false)
    setSetupLoading(true)

    try {
      const res = await apiFetch<{ data: TotpSetupResponse }>('/api/v1/auth/totp/setup', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setSetupData(res.data || (res as unknown as TotpSetupResponse))
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao iniciar setup de 2FA')
      setSetupOpen(false)
    } finally {
      setSetupLoading(false)
    }
  }

  const handleVerifySetup = async () => {
    if (!setupData || verifyCode.length !== 6) return
    setVerifyLoading(true)
    setVerifyError(null)

    try {
      await apiFetch('/api/v1/auth/totp/verify', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode, deviceId: setupData.deviceId }),
      })
      setSetupStep(3)
      toast.success('2FA ativado com sucesso!')
    } catch (err) {
      setVerifyError((err as Error).message || 'Codigo invalido. Tente novamente.')
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleCloseSetup = () => {
    setSetupOpen(false)
    if (setupStep === 3) {
      fetchDevices()
    }
  }

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret)
      toast.success('Secret copiado para a area de transferencia')
    }
  }

  const handleCopyCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join('\n'))
    toast.success('Codigos copiados para a area de transferencia')
  }

  const handleDownloadCodes = (codes: string[]) => {
    const content = [
      'Quayer - Recovery Codes',
      '========================',
      'Guarde estes codigos em local seguro.',
      'Cada codigo so pode ser usado uma vez.',
      '',
      ...codes,
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quayer-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Arquivo de codigos baixado')
  }

  // ------- Disable 2FA -------

  const handleOpenDisable = () => {
    setDisableOpen(true)
    setDisableEmailCode('')
    setDisableCode('')
    setDisableError(null)
    setDisableEmailSent(false)
    setDisableEmailSending(false)
  }

  const handleSendDisableCode = async () => {
    setDisableEmailSending(true)
    setDisableError(null)

    try {
      await apiFetch('/api/v1/auth/totp/disable-request', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setDisableEmailSent(true)
      toast.success('Codigo enviado para seu email')
    } catch (err) {
      setDisableError((err as Error).message || 'Erro ao enviar codigo')
    } finally {
      setDisableEmailSending(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!disableEmailCode || !disableCode) {
      setDisableError('Preencha todos os campos')
      return
    }
    setDisableLoading(true)
    setDisableError(null)

    try {
      await apiFetch('/api/v1/auth/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ emailCode: disableEmailCode, code: disableCode }),
      })
      toast.success('2FA desabilitado com sucesso')
      setDisableOpen(false)
      fetchDevices()
    } catch (err) {
      setDisableError((err as Error).message || 'Erro ao desabilitar 2FA')
    } finally {
      setDisableLoading(false)
    }
  }

  // ------- Regenerate Codes -------

  const handleOpenRegen = () => {
    setRegenOpen(true)
    setRegenCode('')
    setRegenError(null)
    setRegenCodes(null)
  }

  const handleRegenerateCodes = async () => {
    if (regenCode.length !== 6) {
      setRegenError('Digite o codigo de 6 digitos do seu authenticator')
      return
    }
    setRegenLoading(true)
    setRegenError(null)

    try {
      const res = await apiFetch<{ data: { recoveryCodes: string[] } }>('/api/v1/auth/totp/regenerate-codes', {
        method: 'POST',
        body: JSON.stringify({ code: regenCode }),
      })
      const data = res.data || (res as unknown as { recoveryCodes: string[] })
      setRegenCodes(data.recoveryCodes)
      toast.success('Novos codigos de recuperacao gerados')
    } catch (err) {
      setRegenError((err as Error).message || 'Erro ao regenerar codigos')
    } finally {
      setRegenLoading(false)
    }
  }

  // ------- Loading -------

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Autenticacao em Duas Etapas</h3>
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Autenticacao em Duas Etapas (2FA)</h3>

      {/* 2FA Status Card */}
      {!is2FAEnabled ? (
        // ---- Disabled State ----
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShieldOff className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium">2FA Desabilitado</p>
              <p className="text-sm text-muted-foreground">
                Adicione uma camada extra de seguranca a sua conta com autenticacao em duas etapas.
              </p>
            </div>
            <Button onClick={handleStartSetup}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Ativar 2FA
            </Button>
          </CardContent>
        </Card>
      ) : (
        // ---- Enabled State ----
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 dark:bg-green-400/10">
                <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base flex items-center gap-2">
                  2FA Ativo
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                    Ativo
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Sua conta esta protegida com autenticacao em duas etapas.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Button variant="outline" size="sm" onClick={handleOpenRegen}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerar Codigos
            </Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleOpenDisable}>
              <ShieldOff className="h-4 w-4 mr-2" />
              Desabilitar 2FA
            </Button>
          </CardContent>
          {devices.length > 0 && (
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">
                Dispositivo configurado em {formatDate(devices[0].createdAt)}
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* ---- Setup Wizard Dialog ---- */}
      <Dialog open={setupOpen} onOpenChange={handleCloseSetup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {setupStep === 1 && 'Passo 1: Escanear QR Code'}
              {setupStep === 2 && 'Passo 2: Verificar Codigo'}
              {setupStep === 3 && 'Passo 3: Codigos de Recuperacao'}
            </DialogTitle>
            <DialogDescription>
              {setupStep === 1 && 'Escaneie o QR code com seu app authenticator (Google Authenticator, Authy, etc.).'}
              {setupStep === 2 && 'Digite o codigo de 6 digitos do seu app authenticator para confirmar.'}
              {setupStep === 3 && 'Salve seus codigos de recuperacao em local seguro.'}
            </DialogDescription>
          </DialogHeader>

          {setupLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Step 1: QR Code */}
          {setupStep === 1 && setupData && !setupLoading && (
            <div className="space-y-4">
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setupData.qrCode}
                  alt="QR Code para configurar 2FA"
                  className="h-48 w-48 rounded-lg border bg-white p-2"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Nao consegue escanear? Use o codigo manual:
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                    {secretVisible ? setupData.secret : '\u2022'.repeat(32)}
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => setSecretVisible(!secretVisible)} aria-label={secretVisible ? 'Ocultar secret' : 'Mostrar secret'}>
                    {secretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleCopySecret} aria-label="Copiar secret">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCloseSetup}>
                  Cancelar
                </Button>
                <Button onClick={() => setSetupStep(2)}>
                  Proximo
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 2: Verify Code */}
          {setupStep === 2 && setupData && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={verifyCode}
                  onChange={(value) => {
                    setVerifyCode(value)
                    setVerifyError(null)
                  }}
                  onComplete={() => {
                    // Auto-submit when all 6 digits are entered
                  }}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {verifyError && (
                <Alert variant="destructive">
                  <AlertDescription>{verifyError}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setSetupStep(1); setVerifyCode(''); setVerifyError(null) }}>
                  Voltar
                </Button>
                <Button onClick={handleVerifySetup} disabled={verifyCode.length !== 6 || verifyLoading}>
                  {verifyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verificar
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Step 3: Recovery Codes */}
          {setupStep === 3 && setupData && (
            <div className="space-y-4">
              <RecoveryCodesGrid codes={setupData.recoveryCodes} onCopy={handleCopyCodes} onDownload={handleDownloadCodes} />
              <DialogFooter>
                <Button onClick={handleCloseSetup}>
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Disable 2FA Dialog ---- */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desabilitar 2FA</DialogTitle>
            <DialogDescription>
              Para desabilitar a autenticacao em duas etapas, envie um codigo de verificacao para seu email e insira o codigo do authenticator.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Verificacao por email</Label>
              {!disableEmailSent ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSendDisableCode}
                  disabled={disableEmailSending}
                >
                  {disableEmailSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar codigo por email
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Codigo enviado! Verifique seu email.</p>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={disableEmailCode}
                      onChange={(value) => {
                        setDisableEmailCode(value)
                        setDisableError(null)
                      }}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-xs"
                    onClick={handleSendDisableCode}
                    disabled={disableEmailSending}
                  >
                    {disableEmailSending ? 'Enviando...' : 'Reenviar codigo'}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="disable-code">Codigo TOTP ou Recovery Code</Label>
              <Input
                id="disable-code"
                value={disableCode}
                onChange={(e) => { setDisableCode(e.target.value); setDisableError(null) }}
                placeholder="000000 ou recovery code"
                className="font-mono"
              />
            </div>

            {disableError && (
              <Alert variant="destructive">
                <AlertDescription>{disableError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisable2FA}
              disabled={disableLoading || !disableEmailCode || !disableCode}
            >
              {disableLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desabilitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Regenerate Codes Dialog ---- */}
      <Dialog open={regenOpen} onOpenChange={(open) => { setRegenOpen(open); if (!open) fetchDevices() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerar Codigos de Recuperacao</DialogTitle>
            <DialogDescription>
              {!regenCodes
                ? 'Insira o codigo do seu authenticator para gerar novos codigos de recuperacao. Os codigos antigos serao invalidados.'
                : 'Seus novos codigos de recuperacao foram gerados. Salve-os em local seguro.'
              }
            </DialogDescription>
          </DialogHeader>

          {!regenCodes ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={regenCode}
                  onChange={(value) => {
                    setRegenCode(value)
                    setRegenError(null)
                  }}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {regenError && (
                <Alert variant="destructive">
                  <AlertDescription>{regenError}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setRegenOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleRegenerateCodes} disabled={regenCode.length !== 6 || regenLoading}>
                  {regenLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Regenerar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <RecoveryCodesGrid codes={regenCodes} onCopy={handleCopyCodes} onDownload={handleDownloadCodes} />
              <DialogFooter>
                <Button onClick={() => { setRegenOpen(false); fetchDevices() }}>
                  Concluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================
// Main Page
// ============================================

export default function SegurancaPage() {
  const [devices, setDevices] = useState<DeviceSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [isRevokingAll, setIsRevokingAll] = useState(false)

  const fetchDevices = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/v1/device-sessions', { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar dispositivos')
      const json = (await res.json()) as unknown
      // Igniter pode retornar:
      //  - { data: sessions[] } ou
      //  - { data: { data: sessions[] } } (envelope de response.success) ou
      //  - { success: true, data: sessions[] }
      // Defensive unwrap até encontrar um array.
      const unwrap = (value: unknown): DeviceSession[] => {
        if (Array.isArray(value)) return value as DeviceSession[]
        if (value && typeof value === 'object' && 'data' in value) {
          return unwrap((value as { data: unknown }).data)
        }
        return []
      }
      setDevices(unwrap(json))
    } catch (err) {
      setError((err as Error).message)
      setDevices([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const handleRevoke = async (deviceSessionId: string) => {
    setRevokingId(deviceSessionId)
    try {
      const res = await fetch('/api/v1/device-sessions/revoke', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceSessionId }),
      })
      if (!res.ok) throw new Error('Erro ao desconectar dispositivo')
      await fetchDevices()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRevokingId(null)
    }
  }

  const handleRevokeAll = async () => {
    setIsRevokingAll(true)
    try {
      // Find current device to exclude
      const currentDevice = devices.find(d => isCurrentDevice(d.userAgent))
      const res = await fetch('/api/v1/device-sessions/revoke-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentDeviceSessionId: currentDevice?.id,
        }),
      })
      if (!res.ok) throw new Error('Erro ao desconectar dispositivos')
      await fetchDevices()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsRevokingAll(false)
    }
  }

  const activeDevices = Array.isArray(devices)
    ? devices.filter((d) => !d.isRevoked)
    : []
  const hasOtherActiveDevices = activeDevices.some(d => !isCurrentDevice(d.userAgent))

  return (
    <div className="flex-1 space-y-6 p-4 pt-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Seguran\u00e7a da Conta</h2>
        <p className="text-muted-foreground">
          Gerencie a autenticacao em duas etapas, dispositivos e sessoes ativas
        </p>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 2FA Section */}
      <TwoFactorSection />

      {/* Devices Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Meus Dispositivos</h3>
          {hasOtherActiveDevices && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isRevokingAll}>
                  {isRevokingAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Desconectar Todos os Outros Dispositivos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desconectar todos os outros dispositivos?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso encerrar\u00e1 todas as sess\u00f5es exceto este dispositivo. Voc\u00ea precisar\u00e1
                    fazer login novamente nos outros dispositivos.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRevokeAll}>
                    Desconectar Todos
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && devices.length === 0 && !error && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum dispositivo registrado</p>
            </CardContent>
          </Card>
        )}

        {/* Device List */}
        {!isLoading && devices.length > 0 && (
          <div className="space-y-3">
            {devices.map(device => {
              const DeviceIcon = getDeviceIcon(device.userAgent)
              const isCurrent = isCurrentDevice(device.userAgent)

              return (
                <Card key={device.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <DeviceIcon className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {device.deviceName || 'Dispositivo desconhecido'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {device.ipAddress || 'IP desconhecido'} &middot;{' '}
                          {device.location || 'Local desconhecido'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          \u00daltimo acesso: {formatDate(device.lastActiveAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isCurrent && (
                        <Badge variant="outline">Este dispositivo</Badge>
                      )}
                      {!isCurrent && !device.isRevoked && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revokingId === device.id}
                          onClick={() => handleRevoke(device.id)}
                        >
                          {revokingId === device.id && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Desconectar
                        </Button>
                      )}
                      {device.isRevoked && (
                        <Badge variant="destructive">Desconectado</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
