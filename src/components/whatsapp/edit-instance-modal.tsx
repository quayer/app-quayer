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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '@/igniter.client'
import { ConnectionStatus, type Connection as Instance } from '@prisma/client'
import { z } from 'zod'
import { useAuth } from '@/lib/auth/auth-provider'

const instanceEditSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  phoneNumber: z.string().optional(),
  assignedCustomerId: z.string().optional(),
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
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [formData, setFormData] = useState<InstanceEditData>({
    name: '',
    phoneNumber: '',
    assignedCustomerId: undefined,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [customers, setCustomers] = useState<{ id: string; name: string; email: string }[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)

  // Fetch customers (admin only)
  useEffect(() => {
    if (isAdmin && isOpen) {
      setLoadingCustomers(true)
      api.auth.listUsers.query()
        .then((result: any) => {
          const data = result?.data || result
          setCustomers(data.users || [])
        })
        .catch((err) => {
          console.error('Error loading customers:', err)
        })
        .finally(() => {
          setLoadingCustomers(false)
        })
    }
  }, [isAdmin, isOpen])

  useEffect(() => {
    if (instance) {
      setFormData({
        name: instance.name,
        phoneNumber: instance.phoneNumber || '',
        assignedCustomerId: (instance as any).assignedCustomerId || undefined,
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
      const payload: any = {
        name: formData.name,
        phoneNumber: formData.phoneNumber || undefined,
      }

      // Admin pode atribuir instância a um cliente
      if (isAdmin) {
        payload.assignedCustomerId = formData.assignedCustomerId || null
      }

      const response = await api.instances.update.mutate({
        body: payload
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
    setFormData({ name: '', phoneNumber: '', assignedCustomerId: undefined })
    setError('')
    setValidationErrors({})
    onClose()
  }

  if (!instance) return null

  // Verificar status da conexão - considerar uazStatus do UAZapi se disponível
  const rawStatus = (instance as any).uazStatus || instance.status || 'unknown'
  const normalizedStatus = rawStatus.toString().toLowerCase()
  const isConnected = normalizedStatus === 'connected' || normalizedStatus === 'open' || rawStatus === ConnectionStatus.CONNECTED

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Integração</DialogTitle>
          <DialogDescription>
            Atualize as informações da integração WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status inline */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <Badge variant="default" className="text-xs">Conectado</Badge>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" />
                <Badge variant="destructive" className="text-xs">Desconectado</Badge>
              </>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              Status gerenciado automaticamente
            </span>
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
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

            <div className="space-y-1.5">
              <Label htmlFor="phoneNumber">Telefone (opcional)</Label>
              <Input
                id="phoneNumber"
                value={formData.phoneNumber}
                onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                placeholder="Ex: 5511999999999"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Formato internacional (ex: 5511999999999)
              </p>
            </div>
          </div>

          {/* Admin Only - Customer Assignment */}
          {isAdmin && (
            <div className="space-y-1.5 pt-2 border-t">
              <Label htmlFor="assignedCustomerId">Cliente Atribuído (Admin)</Label>
              <Select
                value={formData.assignedCustomerId || '__none__'}
                onValueChange={(value) => handleInputChange('assignedCustomerId', value === '__none__' ? '' : value)}
                disabled={isSubmitting || loadingCustomers}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingCustomers ? 'Carregando...' : 'Selecione um cliente'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum (Sem atribuição)</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name} ({customer.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Metadata - compact */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>ID: <code className="font-mono">{instance.id ? instance.id.slice(0, 8) : (instance as any).uazInstanceId?.slice(0, 8) || 'N/A'}...</code></span>
            <span>Provedor: UAZapi</span>
          </div>

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
