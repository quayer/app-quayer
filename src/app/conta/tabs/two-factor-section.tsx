'use client'

/**
 * Tab: Segurança — TwoFactorSection (setup wizard, disable e regenerate de
 * recovery codes) + RecoveryCodesGrid. Structural extraction from
 * conta-client.tsx (no behavior change).
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2,
  ShieldCheck,
  ShieldOff,
  Copy,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { Badge } from '@/client/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/client/components/ui/input-otp'

import { apiFetch, formatDate, type TotpDevice, type TotpSetupResponse } from './shared'

// ============================================================================
// Tab: Segurança — helpers
// ============================================================================

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
          Guarde estes códigos em local seguro. Eles não serão mostrados novamente.
          Cada código só pode ser usado uma vez.
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

// ============================================================================
// Tab: Segurança — TwoFactorSection
// ============================================================================

export function TwoFactorSection({ onStatusChange }: { onStatusChange?: (enabled: boolean) => void }) {
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

  const fetchTotpDevices = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: TotpDevice[] }>('/api/v1/auth/totp/devices')
      const deviceList = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? (res as unknown as TotpDevice[]) : []
      setDevices(deviceList)
      const enabled = deviceList.some((d) => d.verified)
      setIs2FAEnabled(enabled)
      onStatusChange?.(enabled)
    } catch {
      setDevices([])
      setIs2FAEnabled(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTotpDevices()
  }, [fetchTotpDevices])

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
      setVerifyError((err as Error).message || 'Código inválido. Tente novamente.')
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleCloseSetup = () => {
    setSetupOpen(false)
    if (setupStep === 3) fetchTotpDevices()
  }

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret)
      toast.success('Secret copiado para a área de transferência')
    }
  }

  const handleCopyCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join('\n'))
    toast.success('Códigos copiados para a área de transferência')
  }

  const handleDownloadCodes = (codes: string[]) => {
    const content = [
      'Quayer - Recovery Codes',
      '========================',
      'Guarde estes códigos em local seguro.',
      'Cada código só pode ser usado uma vez.',
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
    toast.success('Arquivo de códigos baixado')
  }

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
      await apiFetch('/api/v1/auth/totp/disable-request', { method: 'POST', body: JSON.stringify({}) })
      setDisableEmailSent(true)
      toast.success('Código enviado para seu email')
    } catch (err) {
      setDisableError((err as Error).message || 'Erro ao enviar código')
    } finally {
      setDisableEmailSending(false)
    }
  }

  const handleDisable2FA = async () => {
    if (!disableEmailCode || !disableCode) { setDisableError('Preencha todos os campos'); return }
    setDisableLoading(true)
    setDisableError(null)
    try {
      await apiFetch('/api/v1/auth/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ emailCode: disableEmailCode, code: disableCode }),
      })
      toast.success('2FA desabilitado com sucesso')
      setDisableOpen(false)
      fetchTotpDevices()
    } catch (err) {
      setDisableError((err as Error).message || 'Erro ao desabilitar 2FA')
    } finally {
      setDisableLoading(false)
    }
  }

  const handleOpenRegen = () => {
    setRegenOpen(true)
    setRegenCode('')
    setRegenError(null)
    setRegenCodes(null)
  }

  const handleRegenerateCodes = async () => {
    if (regenCode.length !== 6) { setRegenError('Digite o código de 6 dígitos do seu authenticator'); return }
    setRegenLoading(true)
    setRegenError(null)
    try {
      const res = await apiFetch<{ data: { recoveryCodes: string[] } }>('/api/v1/auth/totp/regenerate-codes', {
        method: 'POST',
        body: JSON.stringify({ code: regenCode }),
      })
      const data = res.data || (res as unknown as { recoveryCodes: string[] })
      setRegenCodes(data.recoveryCodes)
      toast.success('Novos códigos de recuperação gerados')
    } catch (err) {
      setRegenError((err as Error).message || 'Erro ao regenerar códigos')
    } finally {
      setRegenLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Autenticação em Duas Etapas</h3>
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Autenticação em Duas Etapas (2FA)</h3>

      {!is2FAEnabled ? (
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ShieldOff className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="font-medium">2FA Desabilitado</p>
              <p className="text-sm text-muted-foreground">
                Adicione uma camada extra de segurança à sua conta com autenticação em duas etapas.
              </p>
            </div>
            <Button onClick={handleStartSetup}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Ativar 2FA
            </Button>
          </CardContent>
        </Card>
      ) : (
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
                <CardDescription>Sua conta está protegida com autenticação em duas etapas.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Button variant="outline" size="sm" onClick={handleOpenRegen}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerar Códigos
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

      {/* Setup Wizard Dialog */}
      <Dialog open={setupOpen} onOpenChange={handleCloseSetup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {setupStep === 1 && 'Passo 1: Escanear QR Code'}
              {setupStep === 2 && 'Passo 2: Verificar Código'}
              {setupStep === 3 && 'Passo 3: Códigos de Recuperação'}
            </DialogTitle>
            <DialogDescription>
              {setupStep === 1 && 'Escaneie o QR code com seu app authenticator (Google Authenticator, Authy, etc.).'}
              {setupStep === 2 && 'Digite o código de 6 dígitos do seu app authenticator para confirmar.'}
              {setupStep === 3 && 'Salve seus códigos de recuperação em local seguro.'}
            </DialogDescription>
          </DialogHeader>

          {setupLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

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
                <Label className="text-xs text-muted-foreground">Não consegue escanear? Use o código manual:</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                    {secretVisible ? setupData.secret : '•'.repeat(32)}
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
                <Button variant="outline" onClick={handleCloseSetup}>Cancelar</Button>
                <Button onClick={() => setSetupStep(2)}>Próximo</Button>
              </DialogFooter>
            </div>
          )}

          {setupStep === 2 && setupData && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={verifyCode} onChange={(value) => { setVerifyCode(value); setVerifyError(null) }}>
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
                <Button variant="outline" onClick={() => { setSetupStep(1); setVerifyCode(''); setVerifyError(null) }}>Voltar</Button>
                <Button onClick={handleVerifySetup} disabled={verifyCode.length !== 6 || verifyLoading}>
                  {verifyLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verificar
                </Button>
              </DialogFooter>
            </div>
          )}

          {setupStep === 3 && setupData && (
            <div className="space-y-4">
              <RecoveryCodesGrid codes={setupData.recoveryCodes} onCopy={handleCopyCodes} onDownload={handleDownloadCodes} />
              <DialogFooter>
                <Button onClick={handleCloseSetup}>Concluir</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desabilitar 2FA</DialogTitle>
            <DialogDescription>
              Para desabilitar a autenticação em duas etapas, envie um código de verificação para seu email e insira o código do authenticator.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Verificação por email</Label>
              {!disableEmailSent ? (
                <Button variant="outline" className="w-full" onClick={handleSendDisableCode} disabled={disableEmailSending}>
                  {disableEmailSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar código por email
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Código enviado! Verifique seu email.</p>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={disableEmailCode} onChange={(value) => { setDisableEmailCode(value); setDisableError(null) }}>
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
                  <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={handleSendDisableCode} disabled={disableEmailSending}>
                    {disableEmailSending ? 'Enviando...' : 'Reenviar código'}
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="disable-totp-code">Código TOTP ou Recovery Code</Label>
              <Input
                id="disable-totp-code"
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
            <Button variant="outline" onClick={() => setDisableOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDisable2FA} disabled={disableLoading || !disableEmailCode || !disableCode}>
              {disableLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Desabilitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate Codes Dialog */}
      <Dialog open={regenOpen} onOpenChange={(open) => { setRegenOpen(open); if (!open) fetchTotpDevices() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerar Códigos de Recuperação</DialogTitle>
            <DialogDescription>
              {!regenCodes
                ? 'Insira o código do seu authenticator para gerar novos códigos de recuperação. Os códigos antigos serão invalidados.'
                : 'Seus novos códigos de recuperação foram gerados. Salve-os em local seguro.'}
            </DialogDescription>
          </DialogHeader>
          {!regenCodes ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={regenCode} onChange={(value) => { setRegenCode(value); setRegenError(null) }}>
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
                <Button variant="outline" onClick={() => setRegenOpen(false)}>Cancelar</Button>
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
                <Button onClick={() => { setRegenOpen(false); fetchTotpDevices() }}>Concluir</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
