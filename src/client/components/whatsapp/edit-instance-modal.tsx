'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/client/components/ui/dialog'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { Loader2, Save, AlertCircle } from 'lucide-react'
import { api } from '@/igniter.client'
import type { ModalInstance } from '@/types/instance'
import { z } from 'zod'

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP_WEB: 'UAZapi (WhatsApp Web)',
  WHATSAPP_CLOUD_API: 'Cloud API (Meta Oficial)',
  WHATSAPP_BUSINESS_API: 'WhatsApp Business API',
  INSTAGRAM_META: 'Instagram (Meta)',
  TELEGRAM_BOT: 'Telegram Bot',
  EMAIL_SMTP: 'Email SMTP',
}

function getProviderLabel(brokerType: string | undefined | null): string {
  if (!brokerType) return 'UAZapi (WhatsApp Web)'
  return PROVIDER_LABELS[brokerType] ?? brokerType
}

const instanceEditSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  phoneNumber: z.string().optional(),
})

type InstanceEditData = z.infer<typeof instanceEditSchema>

interface EditInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  instance: ModalInstance | null
  onSuccess?: () => void
}

export function EditInstanceModal({
  isOpen,
  onClose,
  instance,
  onSuccess,
}: EditInstanceModalProps) {
  const [formData, setFormData] = useState<InstanceEditData>({
    name: '',
    phoneNumber: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (instance) {
      setFormData({
        name: instance.name,
        phoneNumber: instance.phoneNumber || '',
      })
    }
  }, [instance])

  const handleInputChange = (field: keyof InstanceEditData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setValidationErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })
  }

  const validateForm = (): boolean => {
    try {
      instanceEditSchema.parse(formData)
      setValidationErrors({})
      return true
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string> = {}
        err.errors.forEach((zodErr) => {
          if (zodErr.path[0]) {
            errors[zodErr.path[0].toString()] = zodErr.message
          }
        })
        setValidationErrors(errors)
      }
      return false
    }
  }

  const handleSubmit = async () => {
    if (!instance) return

    if (!validateForm()) {
      setError('Corrija os erros no formulario')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await api.instances.update.mutate({
        body: {
          name: formData.name,
          phoneNumber: formData.phoneNumber || undefined,
        }
      })

      if (response.error) {
        setError((response.error as Record<string, string>)?.message || 'Erro ao atualizar')
        return
      }

      onSuccess?.()
      handleClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar integracao')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setFormData({ name: '', phoneNumber: '' })
    setError('')
    setValidationErrors({})
    onClose()
  }

  if (!instance) return null

  const isConnected = instance.status === 'connected' || instance.status === 'open'
  const providerLabel = getProviderLabel(instance.brokerType)

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            Editar Integracao
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-xs">
            <span>{providerLabel}</span>
            <span className="text-muted-foreground/30">|</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-400'}`} />
              <span className={isConnected ? 'text-emerald-400' : 'text-red-400'}>
                {isConnected ? 'Online' : 'Offline'}
              </span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Form Fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs font-medium">
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Ex: Suporte Principal"
                disabled={isSubmitting}
                className={`bg-muted/30 border-transparent focus:border-border ${validationErrors.name ? 'border-red-500!' : ''}`}
              />
              {validationErrors.name && (
                <p className="text-xs text-red-500">{validationErrors.name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-phone" className="text-xs font-medium">
                Telefone
              </Label>
              <Input
                id="edit-phone"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                placeholder="5511999999999"
                disabled={isSubmitting}
                className="bg-muted/30 border-transparent focus:border-border font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Formato internacional (ex: 5511999999999)
              </p>
            </div>
          </div>

          {/* Metadata — compact */}
          <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <code className="font-mono text-foreground/70 truncate max-w-[200px]">{instance.id}</code>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Salvar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
