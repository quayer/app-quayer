'use client'

import { useState, useEffect } from 'react'
import { Building2, Loader2, AlertCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  listOrganizationsForFilterAction,
  assignOrganizationToInstanceAction,
  importInstanceFromUazapiAction,
} from '../actions'

interface AssignOrganizationModalProps {
  instance: any | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface Organization {
  id: string
  name: string
}

export function AssignOrganizationModal({
  instance,
  isOpen,
  onClose,
  onSuccess,
}: AssignOrganizationModalProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Carregar organizacoes ao abrir o modal
  useEffect(() => {
    if (isOpen) {
      loadOrganizations()
      // Pre-selecionar organizacao atual se existir
      if (instance?.organization?.id) {
        setSelectedOrgId(instance.organization.id)
      } else if (instance?.organizationId) {
        setSelectedOrgId(instance.organizationId)
      } else {
        setSelectedOrgId('')
      }
    }
  }, [isOpen, instance])

  const loadOrganizations = async () => {
    try {
      setIsLoadingOrgs(true)
      const result = await listOrganizationsForFilterAction()
      if (result.success && result.data) {
        setOrganizations(result.data)
      }
    } catch (err) {
      console.error('Erro ao carregar organizacoes:', err)
    } finally {
      setIsLoadingOrgs(false)
    }
  }

  const handleSubmit = async () => {
    if (!instance) return

    try {
      setIsLoading(true)
      setError(null)

      // Se a instancia nao esta no banco Quayer, primeiro importar
      if (!instance.inQuayerDB) {
        const importResult = await importInstanceFromUazapiAction({
          uazInstanceId: instance.uazInstanceId,
          uazInstanceName: instance.uazInstanceName,
          uazToken: instance.uazToken,
          uazPhoneNumber: instance.uazPhoneNumber,
          organizationId: selectedOrgId || undefined,
        })

        if (!importResult.success) {
          setError(importResult.error || 'Erro ao importar instancia')
          return
        }
      } else {
        // Se ja esta no banco, apenas atribuir organizacao
        const result = await assignOrganizationToInstanceAction({
          connectionId: instance.id,
          organizationId: selectedOrgId || null,
        })

        if (!result.success) {
          setError(result.error || 'Erro ao atribuir organizacao')
          return
        }
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erro ao processar')
    } finally {
      setIsLoading(false)
    }
  }

  if (!instance) return null

  const displayName = instance.name || instance.uazInstanceName || 'Sem nome'
  const displayPhone = instance.phoneNumber || instance.uazPhoneNumber || 'Sem telefone'
  const isImporting = !instance.inQuayerDB

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {isImporting ? 'Importar e Atribuir Organizacao' : 'Atribuir Organizacao'}
          </DialogTitle>
          <DialogDescription>
            {isImporting
              ? 'Esta instancia sera importada do UAZapi para o Quayer e atribuida a uma organizacao.'
              : 'Selecione a organizacao que tera acesso a esta integracao.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Informacoes da instancia */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Instancia:</span>
              <span className="text-sm">{displayName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Telefone:</span>
              <span className="text-sm font-mono">{displayPhone}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Conexao:</span>
              {(() => {
                const status = instance.uazStatus || instance.status || 'UNKNOWN'
                const isConnected = status === 'CONNECTED' || status === 'open'
                return (
                  <Badge variant={isConnected ? 'default' : 'destructive'}>
                    {isConnected ? 'Conectado' : status === 'close' ? 'Desconectado' : status}
                  </Badge>
                )
              })()}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Origem:</span>
              {instance.inQuayerDB ? (
                <Badge variant="default">No Quayer</Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                  UAZapi only
                </Badge>
              )}
            </div>
          </div>

          {/* Selector de organizacao */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Organizacao</label>
            {isLoadingOrgs ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando organizacoes...
              </div>
            ) : (
              <Select
                value={selectedOrgId || '__none__'}
                onValueChange={(val) => setSelectedOrgId(val === '__none__' ? '' : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isImporting ? "Sem organizacao (opcional)" : "Selecione uma organizacao"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {isImporting ? 'Sem organizacao (vincular depois)' : 'Nenhuma (remover atribuicao)'}
                  </SelectItem>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              {isImporting
                ? 'Opcional: Selecione uma organizacao ou importe sem vincular.'
                : 'Deixe vazio para remover a atribuicao atual.'}
            </p>
          </div>

          {/* Aviso para importacao */}
          {isImporting && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Ao importar, esta instancia sera adicionada ao banco de dados do Quayer e podera ser gerenciada normalmente.
              </AlertDescription>
            </Alert>
          )}

          {/* Erro */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processando...
              </>
            ) : isImporting ? (
              selectedOrgId ? 'Importar e Atribuir' : 'Importar para Quayer'
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
