'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Loader2, Save, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/igniter.client'
import type { Instance } from '@prisma/client'
import { z } from 'zod'

const instanceEditSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  phoneNumber: z.string().optional(),
})

type InstanceEditData = z.infer<typeof instanceEditSchema>

interface EditInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  instance: Instance | null
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
        err.errors.forEach((error) => {
          if (error.path[0]) {
            errors[error.path[0].toString()] = error.message
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
      setError('Por favor, corrija os erros no formulário')
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
        setError((response.error as any)?.message || 'Erro ao atualizar integração')
        return
      }

      onSuccess?.()
      handleClose()
    } catch (err: any) {
      setError(err?.message || 'Erro ao atualizar integração')
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

  const isConnected = instance.status === 'connected'

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Editar Integração</DialogTitle>
          <DialogDescription>
            Atualize as informações da integração WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Status da Conexão</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                {isConnected ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <Badge variant="default">Conectado</Badge>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    <Badge variant="destructive">Desconectado</Badge>
                  </>
                )}
                <span className="text-sm text-muted-foreground ml-auto">
                  O status da conexão é gerenciado automaticamente pelo sistema
                </span>
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Form Fields */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Informações Básicas</h3>

            <div className="space-y-2">
              <Label htmlFor="name">
                Nome da Integração <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Ex: Suporte Principal"
                disabled={isSubmitting}
                className={validationErrors.name ? 'border-red-500' : ''}
              />
              {validationErrors.name && (
                <p className="text-xs text-red-500">{validationErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Telefone (opcional)</Label>
              <Input
                id="phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                placeholder="Ex: 5511999999999"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Número no formato internacional (ex: 5511999999999)
              </p>
            </div>
          </div>

          {/* Metadata Info */}
          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Informações do Sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provedor:</span>
                <span className="font-medium">WhatsApp falecomigo.ai</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID:</span>
                <span className="font-mono text-xs">{instance.id}</span>
              </div>
            </CardContent>
          </Card>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Alterações
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
