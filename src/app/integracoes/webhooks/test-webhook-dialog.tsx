'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { Loader2, Send, CheckCircle2, XCircle } from 'lucide-react'
import type { Webhook } from '@prisma/client'

interface TestWebhookDialogProps {
  webhook: Webhook | null
  isOpen: boolean
  onClose: () => void
}

const SAMPLE_PAYLOADS: Record<string, object> = {
  'instance.connected': {
    event: 'instance.connected',
    timestamp: new Date().toISOString(),
    data: {
      instanceId: 'instance-123',
      phoneNumber: '+5511999999999',
      name: 'Minha Instância',
    },
  },
  'instance.disconnected': {
    event: 'instance.disconnected',
    timestamp: new Date().toISOString(),
    data: {
      instanceId: 'instance-123',
      reason: 'logout',
    },
  },
  'message.received': {
    event: 'message.received',
    timestamp: new Date().toISOString(),
    data: {
      instanceId: 'instance-123',
      messageId: 'msg-456',
      from: '+5511999999999',
      body: 'Olá! Esta é uma mensagem de teste.',
      timestamp: new Date().toISOString(),
    },
  },
  'message.sent': {
    event: 'message.sent',
    timestamp: new Date().toISOString(),
    data: {
      instanceId: 'instance-123',
      messageId: 'msg-789',
      to: '+5511999999999',
      body: 'Mensagem enviada com sucesso!',
      status: 'sent',
    },
  },
  'qrcode.updated': {
    event: 'qrcode.updated',
    timestamp: new Date().toISOString(),
    data: {
      instanceId: 'instance-123',
      qrcode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  },
}

export function TestWebhookDialog({ webhook, isOpen, onClose }: TestWebhookDialogProps) {
  const [selectedEvent, setSelectedEvent] = useState<string>('')
  const [payload, setPayload] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    statusCode?: number
  } | null>(null)

  const handleEventChange = (event: string) => {
    setSelectedEvent(event)
    const sample = SAMPLE_PAYLOADS[event]
    if (sample) {
      setPayload(JSON.stringify(sample, null, 2))
    }
    setTestResult(null)
  }

  const handleTest = async () => {
    if (!webhook || !selectedEvent || !payload) {
      toast.error('Selecione um evento e preencha o payload')
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      // Validate JSON
      let parsedPayload
      try {
        parsedPayload = JSON.parse(payload)
      } catch {
        toast.error('Payload JSON inválido')
        setIsTesting(false)
        return
      }

      // Send test webhook
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': selectedEvent,
          'X-Webhook-ID': webhook.id,
          ...(webhook.secret && {
            'X-Webhook-Signature': 'test-signature',
          }),
        },
        body: JSON.stringify(parsedPayload),
      })

      if (response.ok) {
        setTestResult({
          success: true,
          message: 'Webhook testado com sucesso!',
          statusCode: response.status,
        })
        toast.success('Webhook testado com sucesso!')
      } else {
        setTestResult({
          success: false,
          message: `Falha ao testar webhook: ${response.statusText}`,
          statusCode: response.status,
        })
        toast.error('Falha ao testar webhook')
      }
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `Erro: ${error.message}`,
      })
      toast.error('Erro ao testar webhook')
    } finally {
      setIsTesting(false)
    }
  }

  const handleClose = () => {
    if (!isTesting) {
      setSelectedEvent('')
      setPayload('')
      setTestResult(null)
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Testar Webhook</DialogTitle>
          <DialogDescription>
            Envie uma requisição de teste para o webhook: <strong>{webhook?.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="event">Selecione o Evento</Label>
            <Select value={selectedEvent} onValueChange={handleEventChange}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um evento" />
              </SelectTrigger>
              <SelectContent>
                {webhook?.events.map((event) => (
                  <SelectItem key={event} value={event}>
                    {event}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="payload">Payload JSON</Label>
            <Textarea
              id="payload"
              placeholder="Cole ou edite o payload JSON aqui"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Edite o payload de teste conforme necessário
            </p>
          </div>

          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              <div className="flex items-start gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 mt-0.5" />
                )}
                <div className="flex-1">
                  <AlertDescription>{testResult.message}</AlertDescription>
                  {testResult.statusCode && (
                    <p className="text-xs mt-1">Status Code: {testResult.statusCode}</p>
                  )}
                </div>
              </div>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isTesting}
          >
            Fechar
          </Button>
          <Button
            type="button"
            onClick={handleTest}
            disabled={isTesting || !selectedEvent || !payload}
          >
            {isTesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Testar Webhook
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
