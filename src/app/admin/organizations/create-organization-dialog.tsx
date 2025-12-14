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
  DialogTrigger,
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
import { Plus } from 'lucide-react'
import { api } from '@/igniter.client'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface CreateOrganizationDialogProps {
  onSuccess?: () => void
  children?: React.ReactNode
}

export function CreateOrganizationDialog({ onSuccess, children }: CreateOrganizationDialogProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    document: '',
    type: 'pj' as 'pf' | 'pj',
    billingType: 'free' as 'free' | 'basic' | 'pro' | 'enterprise',
    maxInstances: 5,
    maxUsers: 3,
    adminName: '',
    adminEmail: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await api.organizations.create.mutate({
        body: formData,
      })

      setOpen(false)
      resetForm()
      onSuccess?.()
    } catch (err: any) {
      console.error('Error creating organization:', err)

      // ✅ CORREÇÃO BRUTAL: Extrair mensagem detalhada do erro Igniter.js
      let errorMessage = 'Erro ao criar organização'

      // Igniter.js pode retornar erro em vários formatos
      const errorData = err?.data || err?.error || err

      // 1. Tentar extrair detalhes do erro de validação Zod
      if (errorData?.details && Array.isArray(errorData.details)) {
        const validationErrors = errorData.details
          .map((detail: any) => detail.message)
          .join(', ')
        errorMessage = validationErrors
      }
      // 2. Tentar extrair mensagem direta
      else if (errorData?.message && typeof errorData.message === 'string') {
        errorMessage = errorData.message
      }
      // 3. Tentar extrair erro como string
      else if (errorData?.error && typeof errorData.error === 'string') {
        errorMessage = errorData.error
      }
      // 4. Fallback para message do erro principal
      else if (err?.message && typeof err.message === 'string' && err.message !== '[object Object]') {
        errorMessage = err.message
      }
      // 5. Se ainda for objeto, tentar stringify
      else if (typeof errorData === 'object' && errorData !== null) {
        const stringified = JSON.stringify(errorData)
        if (stringified !== '{}') {
          errorMessage = stringified
        }
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      document: '',
      type: 'pj',
      billingType: 'free',
      maxInstances: 5,
      maxUsers: 3,
      adminName: '',
      adminEmail: '',
    })
    setError('')
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      resetForm()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nova Organização
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Criar Nova Organização</DialogTitle>
            <DialogDescription>
              Preencha os dados da nova organização
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

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
              <Label htmlFor="type">Tipo *</Label>
              <Select
                value={formData.type}
                onValueChange={(value: 'pf' | 'pj') => setFormData({ ...formData, type: value })}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pf">Pessoa Física (CPF)</SelectItem>
                  <SelectItem value="pj">Pessoa Jurídica (CNPJ)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="document">
                {formData.type === 'pf' ? 'CPF' : 'CNPJ'} *
              </Label>
              <Input
                id="document"
                placeholder={formData.type === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
                value={formData.document}
                onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Apenas números
              </p>
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
                <Label htmlFor="adminName">Nome do Admin *</Label>
                <Input
                  id="adminName"
                  placeholder="Nome do administrador"
                  value={formData.adminName}
                  onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="adminEmail">Email do Admin *</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@empresa.com"
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="maxInstances">Max. Instâncias *</Label>
                <Input
                  id="maxInstances"
                  type="number"
                  min="1"
                  max="1000"
                  value={formData.maxInstances}
                  onChange={(e) => setFormData({ ...formData, maxInstances: Math.min(1000, parseInt(e.target.value) || 1) })}
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">Limite: 1-1000</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxUsers">Max. Usuários *</Label>
                <Input
                  id="maxUsers"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.maxUsers}
                  onChange={(e) => setFormData({ ...formData, maxUsers: Math.min(100, parseInt(e.target.value) || 1) })}
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">Limite: 1-100</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Criando...' : 'Criar Organização'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
