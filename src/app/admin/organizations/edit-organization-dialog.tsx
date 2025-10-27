'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/igniter.client'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Organization {
  id: string
  name: string
  document: string
  type: 'pf' | 'pj'
  billingType: string
  maxInstances: number
  maxUsers: number
}

interface EditOrganizationDialogProps {
  organization: Organization | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function EditOrganizationDialog({
  organization,
  open,
  onOpenChange,
  onSuccess
}: EditOrganizationDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    billingType: 'free' as 'free' | 'basic' | 'pro' | 'enterprise',
    maxInstances: 5,
    maxUsers: 3,
  })

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name,
        billingType: organization.billingType as any,
        maxInstances: organization.maxInstances,
        maxUsers: organization.maxUsers,
      })
    }
  }, [organization])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organization) return

    setError('')
    setIsLoading(true)

    try {
      await (api.organizations.update.mutate as any)({
        params: { id: organization.id },
        body: formData,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err: any) {
      const errorMessage = err?.message || err?.response?.data?.message || 'Erro ao atualizar organização'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  if (!organization) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar Organização</DialogTitle>
            <DialogDescription>
              Atualize os dados da organização
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label>Documento</Label>
              <Input
                value={organization.document}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                O documento não pode ser alterado
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Input
                value={organization.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Nome da organização"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={isLoading}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="billingType">Plano *</Label>
              <Select
                value={formData.billingType}
                onValueChange={(value: any) => setFormData({ ...formData, billingType: value })}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free (Gratuito)</SelectItem>
                  <SelectItem value="basic">Basic (Básico)</SelectItem>
                  <SelectItem value="pro">Pro (Profissional)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (Empresarial)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="maxInstances">Max. Instâncias *</Label>
                <Input
                  id="maxInstances"
                  type="number"
                  min="1"
                  value={formData.maxInstances}
                  onChange={(e) => setFormData({ ...formData, maxInstances: parseInt(e.target.value) || 1 })}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxUsers">Max. Usuários *</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  min="1"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) || 1 })}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
