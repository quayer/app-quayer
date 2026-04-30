'use client'

import { useState } from 'react'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/client/components/ui/dialog'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { createOrganizationAction } from '../actions'

interface CreateOrganizationDialogProps {
  onSuccess?: () => void
}

export function CreateOrganizationDialog({ onSuccess }: CreateOrganizationDialogProps) {
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
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await createOrganizationAction(formData)

      if (!result.success) {
        setError(result.error || 'Erro ao criar organização')
        return
      }

      toast.success('Organização criada com sucesso')
      setOpen(false)
      resetForm()
      onSuccess?.()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar organização'
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
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nova Organização
        </Button>
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
                <SelectTrigger aria-label="Tipo de organização">
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
                placeholder={formData.type === 'pf' ? 'Digite o CPF' : 'Digite o CNPJ'}
                inputMode="numeric"
                value={formData.document}
                onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                required
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Informe apenas números, sem pontos ou traços
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="billingType">Plano *</Label>
              <Select
                value={formData.billingType}
                onValueChange={(value: string) => setFormData({ ...formData, billingType: value as 'free' | 'basic' | 'pro' | 'enterprise' })}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? 'Criando...' : 'Criar Organização'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
