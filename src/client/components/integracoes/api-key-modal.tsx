'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { Label } from '@/client/components/ui/label'
import { Textarea } from '@/client/components/ui/textarea'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import type {
  ProviderKey,
  ProviderMeta,
  ProviderRecord,
} from './providers-catalog'

interface ApiKeyModalProps {
  meta: ProviderMeta | null
  currentRecord: ProviderRecord | null
  open: boolean
  onClose: () => void
  onSave: (provider: ProviderKey, apiKey: string) => Promise<void>
}

export function ApiKeyModal({
  meta,
  currentRecord,
  open,
  onClose,
  onSave,
}: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)

  // Reset state every time the modal opens for a different provider.
  useEffect(() => {
    if (open) {
      setApiKey('')
      setInlineError(null)
      setSaving(false)
    }
  }, [open, meta?.key])

  const isUpdate = Boolean(currentRecord?.isConfigured)

  const handleSave = async () => {
    if (!meta) return
    const trimmed = apiKey.trim()
    if (!trimmed) {
      setInlineError('Cole a chave de API antes de salvar.')
      return
    }
    setSaving(true)
    setInlineError(null)
    try {
      await onSave(meta.key, trimmed)
      toast.success('Chave salva')
      onClose()
    } catch (err) {
      setInlineError(
        (err as Error).message || 'Não foi possível salvar a chave.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isUpdate ? 'Atualizar chave' : 'Configurar chave'}
          </DialogTitle>
          <DialogDescription>
            {meta
              ? `Cole sua chave de API ${meta.name}.`
              : 'Cole sua chave de API.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="integracoes-provider-name">Provedor</Label>
            <input
              id="integracoes-provider-name"
              type="text"
              value={meta?.name ?? ''}
              readOnly
              disabled
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="integracoes-api-key">Chave de API</Label>
            <Textarea
              id="integracoes-api-key"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setInlineError(null)
              }}
              placeholder={meta?.keyPlaceholder ?? 'sk-...'}
              rows={4}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              className="font-mono text-sm"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Sua chave fica criptografada no banco. Nunca exibida em texto
              puro.
            </p>
          </div>

          {inlineError && (
            <Alert variant="destructive">
              <AlertDescription>{inlineError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || apiKey.trim().length === 0}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
