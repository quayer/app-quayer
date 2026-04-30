'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/client/components/ui/dialog'
import { Button } from '@/client/components/ui/button'
import { Badge } from '@/client/components/ui/badge'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/client/components/ui/tooltip'
import { QrCode, Smartphone, Clock, CheckCircle, Loader2, RefreshCw, Copy, Share2, Hash, Link2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { ModalInstance } from '@/types/instance'
import type { QRCodeResponse } from '@/server/communication/instances/instances.interfaces'
import { useConnectInstance, useInstanceStatus, useShareInstance } from '@/client/hooks/useInstance'
import { useQRTimer } from '@/client/hooks/use-qr-timer'

interface ConnectionModalProps { instance: ModalInstance | null; isOpen: boolean; onClose: () => void; forceReconnect?: boolean }
type Mode = 'qr' | 'phone' | 'share'

export function ConnectionModal({ instance, isOpen, onClose, forceReconnect = false }: ConnectionModalProps) {
  const [mode, setMode] = useState<Mode>('qr')
  const [qrData, setQrData] = useState<QRCodeResponse | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [step, setStep] = useState(1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareExpiry, setShareExpiry] = useState<string | null>(null)

  const connectMutation = useConnectInstance()
  const shareMutation = useShareInstance()
  const { data: statusData, isLoading: statusLoading } = useInstanceStatus(instance?.id || '', isOpen && !!instance)
  const { left: timeLeft, reset: resetTimer, fmt: formatTime } = useQRTimer(timerSeconds, () => setStep(3))

  const resetState = useCallback(() => {
    setQrData(null)
    setTimerSeconds(0)
    resetTimer(0)
    setStep(1)
    setErrorMessage(null)
    setShareUrl(null)
    setShareExpiry(null)
  }, [resetTimer])

  const handleApiError = (error: unknown, fallback: string) => {
    const err = error as Record<string, unknown>
    const data = (err?.response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined
    const msg = (data?.error as Record<string, string> | undefined)?.message || (data?.message as string) || (typeof err?.message === 'string' ? err.message : fallback)
    setErrorMessage(msg); setStep(3)
  }

  const generateQRCode = useCallback(async () => {
    if (!instance) return
    try {
      setStep(1); setErrorMessage(null)
      const response = await connectMutation.mutateAsync({ id: instance.id, forceReconnect })
      if (!response?.qrcode) throw new Error('QR Code não foi gerado pela API')
      const secs = Math.floor(response.expires / 1000)
      setQrData(response); setTimerSeconds(secs); resetTimer(secs); setStep(2)
    } catch (e) { handleApiError(e, 'Erro ao gerar QR Code') }
  }, [instance, connectMutation, resetTimer, forceReconnect])

  const generatePairingCode = async () => {
    if (!instance || !phoneInput.trim()) return
    try {
      setStep(1); setErrorMessage(null)
      const response = await connectMutation.mutateAsync({ id: instance.id, phone: phoneInput.trim() })
      if (!response?.pairingCode) throw new Error('Pairing code não foi gerado pela API')
      const secs = Math.floor(response.expires / 1000)
      setQrData(response); setTimerSeconds(secs); resetTimer(secs); setStep(2)
    } catch (e) { handleApiError(e, 'Erro ao gerar código') }
  }

  const generateShareLink = useCallback(async () => {
    if (!instance) return
    try {
      setStep(1); setErrorMessage(null)
      const data = await shareMutation.mutateAsync(instance.id)
      setShareUrl(data.shareUrl)
      const exp = new Date(data.expiresAt)
      setShareExpiry(exp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      setStep(2)
    } catch (e) { handleApiError(e, 'Erro ao gerar link') }
  }, [instance, shareMutation])

  useEffect(() => {
    if (isOpen && instance) {
      resetState()
      const status = (instance.status ?? '').toUpperCase()
      if (status === 'CONNECTED' && !forceReconnect) {
        // Already connected — show success state immediately
        setStep(4)
      } else {
        generateQRCode()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, instance])

  useEffect(() => {
    if (!isOpen) return
    const s = ((statusData?.status as string) ?? '').toLowerCase()
    if (s !== 'connected' || step === 4) return
    setStep(4)
    const id = setTimeout(() => handleClose(), 2000)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusData?.status, isOpen, step])

  const switchMode = useCallback((next: Mode) => {
    setMode(next)
    resetState()
    if (next === 'qr') generateQRCode()
    else if (next === 'share') generateShareLink()
  }, [resetState, generateQRCode, generateShareLink])

  const handleClose = () => { resetState(); setPhoneInput(''); setMode('qr'); onClose() }

  const handleCopyQR = async () => {
    if (!qrData?.qrcode) return
    try { const b = await (await fetch(qrData.qrcode)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast.success('QR Code copiado!') }
    catch { toast.error('Erro ao copiar — navegador não suporta') }
  }
  const handleShareQR = async () => {
    if (!qrData?.qrcode) return
    try {
      const b = await (await fetch(qrData.qrcode)).blob()
      const file = new File([b], 'qrcode-whatsapp.png', { type: 'image/png' })
      if (navigator.share) { await navigator.share({ title: `Conectar WhatsApp - ${instance?.name}`, text: 'Escaneie este QR Code', files: [file] }) }
      else { const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = 'qrcode-whatsapp.png'; a.click(); URL.revokeObjectURL(url); toast.success('QR Code baixado!') }
    } catch { toast.error('Erro ao compartilhar') }
  }
  const handleCopyCode = async () => {
    if (!qrData?.pairingCode) return
    try { await navigator.clipboard.writeText(qrData.pairingCode); toast.success('Código copiado!') }
    catch { toast.error('Erro ao copiar') }
  }
  const handleCopyLink = async () => {
    if (!shareUrl) return
    try { await navigator.clipboard.writeText(shareUrl); toast.success('Link copiado!') }
    catch { toast.error('Erro ao copiar') }
  }

  if (!instance) return null
  const isQr = mode === 'qr'
  const isPhone = mode === 'phone'
  const isShare = mode === 'share'
  const isMutating = connectMutation.isPending || shareMutation.isPending

  const phoneReady = isPhone && !isMutating && step === 1
  const stepMeta = {
    1: { Icon: phoneReady ? Smartphone : Loader2, title: isShare ? 'Gerando link...' : isQr ? 'Gerando QR Code...' : phoneReady ? 'Conectar por número' : 'Aguarde...', desc: phoneReady ? 'Digite o número do WhatsApp.' : 'Preparando...', cls: phoneReady ? 'text-blue-400' : 'animate-spin text-blue-400' },
    2: { Icon: isQr ? QrCode : isPhone ? Hash : Link2, title: isQr ? 'Escaneie o QR Code' : isPhone ? 'Digite o código' : 'Link gerado', desc: isQr ? 'Abra o WhatsApp e escaneie:' : isPhone ? 'Insira o código no WhatsApp.' : 'Compartilhe o link abaixo.', cls: 'text-blue-400' },
    3: { Icon: RefreshCw, title: errorMessage ? 'Erro' : 'Expirado', desc: errorMessage || 'Gere novamente.', cls: 'text-red-400' },
    4: { Icon: CheckCircle, title: 'Conectado!', desc: 'Instância conectada.', cls: 'text-emerald-400' },
  }[step] ?? { Icon: QrCode, title: 'Conectando...', desc: '', cls: 'text-blue-400' }
  const { Icon: StepIcon, title, desc, cls } = stepMeta

  const tabs: { key: Mode; label: string; Icon: typeof QrCode }[] = [
    { key: 'qr', label: 'QR Code', Icon: QrCode },
    { key: 'phone', label: 'Código', Icon: Smartphone },
    { key: 'share', label: 'Compartilhar', Icon: Link2 },
  ]

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <StepIcon className={`h-5 w-5 ${cls}`} />{title}
            </DialogTitle>
            <DialogDescription className="text-xs">{desc}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Mode tabs */}
            <div className="flex rounded-lg border border-border/40 p-0.5 gap-0.5">
              {tabs.map(({ key, label, Icon: TabIcon }) => (
                <button key={key} onClick={() => switchMode(key)} className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${mode === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  <TabIcon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>

            {/* Instance info */}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Instância</span><span className="font-medium">{instance.name}</span></div>
              {instance.phoneNumber && <div className="flex justify-between"><span className="text-muted-foreground">Número</span><span className="font-mono text-xs">{instance.phoneNumber}</span></div>}
            </div>

            {/* QR mode */}
            {isQr && step === 2 && qrData && (
              <div className="space-y-3">
                <div className="bg-white p-4 rounded-lg flex justify-center mx-auto w-fit">
                  <img src={qrData.qrcode!} alt="QR Code WhatsApp" className="w-44 h-44" />
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs font-mono">{formatTime(timeLeft)}</Badge>
                </div>
                <div className="flex gap-2">
                  <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="flex-1" onClick={handleCopyQR}><Copy className="h-3.5 w-3.5 mr-1.5" />Copiar</Button></TooltipTrigger><TooltipContent>Copiar QR como imagem</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="flex-1" onClick={handleShareQR}><Share2 className="h-3.5 w-3.5 mr-1.5" />Enviar</Button></TooltipTrigger><TooltipContent>Compartilhar ou baixar QR</TooltipContent></Tooltip>
                </div>
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5"><Smartphone className="h-3.5 w-3.5 text-blue-400" /><span className="text-xs font-medium text-blue-400">Como conectar</span></div>
                  <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside"><li>Abra o WhatsApp</li><li>Menu → Dispositivos conectados</li><li>Conectar um dispositivo</li><li>Escaneie o QR acima</li></ol>
                </div>
              </div>
            )}

            {/* Phone mode — form */}
            {isPhone && step === 1 && !isMutating && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone-input" className="text-xs">Número do WhatsApp</Label>
                  <Input id="phone-input" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="+5511999999999" className="text-sm" onKeyDown={e => e.key === 'Enter' && generatePairingCode()} />
                </div>
                <Button size="sm" className="w-full" onClick={generatePairingCode} disabled={!phoneInput.trim() || isMutating}>
                  <Hash className="h-3.5 w-3.5 mr-1.5" />Gerar código
                </Button>
              </div>
            )}

            {/* Phone mode — code display */}
            {isPhone && step === 2 && qrData?.pairingCode && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground text-center">Código:</p>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-center text-3xl font-mono tracking-widest font-semibold">{qrData.pairingCode}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyCode}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Expira em</span>
                    <Badge variant="outline" className="text-xs font-mono">{formatTime(timeLeft)}</Badge>
                  </div>
                </div>
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5"><Smartphone className="h-3.5 w-3.5 text-blue-400" /><span className="text-xs font-medium text-blue-400">Como conectar</span></div>
                  <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside"><li>Abra o WhatsApp</li><li>Menu → Dispositivos conectados</li><li>Conectar com número de telefone</li><li>Digite o código acima</li></ol>
                </div>
              </div>
            )}

            {/* Share mode */}
            {isShare && step === 2 && shareUrl && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Link de conexão — válido até {shareExpiry ?? '—'}:</p>
                  <div className="flex items-center gap-2">
                    <Input value={shareUrl} readOnly className="text-xs font-mono h-8" />
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopyLink}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
                    <ExternalLink className="h-3 w-3" />Abrir link
                  </a>
                </div>
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-xs text-muted-foreground">Envie este link para quem precisa escanear o QR Code. Funciona no celular ou computador, sem precisar de login.</p>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={generateShareLink} disabled={isMutating}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Gerar novo link
                </Button>
              </div>
            )}

            {statusLoading && <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Verificando conexão...</div>}

            {step === 4 && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-emerald-400">Conectado com sucesso!</p>
                <p className="text-xs text-muted-foreground mt-1">Fechando automaticamente...</p>
              </div>
            )}

            <div className="flex gap-2">
              {step === 3 && (
                <Button size="sm" onClick={isQr ? generateQRCode : isPhone ? () => { setStep(1) } : generateShareLink} disabled={isMutating} className="flex-1">
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />{isQr ? 'Novo QR' : isPhone ? 'Novo código' : 'Novo link'}
                </Button>
              )}
              {step !== 4 && <Button variant="ghost" size="sm" onClick={handleClose} className={step === 3 ? '' : 'w-full'}>Cancelar</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
