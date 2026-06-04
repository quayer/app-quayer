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
import { Input } from '@/client/components/ui/input'
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
  open: boolean
  onClose: () => void
  onSave: (provider: ProviderKey, apiKey: string, name: string) => Promise<void>
  /**
   * @deprecated Ignorado — surface legada single-key. O modal agora sempre cria
   * uma nova chave rotulada. Mantido p/ consumidores fora desta refatoração.
   */
  currentRecord?: ProviderRecord | null
}

export function ApiKeyModal({ meta, open, onClose, onSave }: ApiKeyModalProps) {
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null)

  // Reset state every time the modal opens for a different provider.
  useEffect(() => {
    if (open) {
      setName('')
      setApiKey('')
      setInlineError(null)
      setSaving(false)
    }
  }, [open, meta?.key])

  const handleSave = async () => {
    if (!meta) return
    const trimmedName = name.trim()
    const trimmedKey = apiKey.trim()
    if (!trimmedName) {
      setInlineError('Dê um nome (rótulo) para a chave.')
      return
    }
    if (!trimmedKey) {
      setInlineError('Cole a chave de API antes de salvar.')
      return
    }
    setSaving(true)
    setInlineError(null)
    try {
      await onSave(meta.key, trimmedKey, trimmedName)
      toast.success('Chave salva')
      onClose()
    } catch (err) {
      setInlineError((err as Error).message || 'Não foi possível salvar a chave.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = name.trim().length > 0 && apiKey.trim().length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova chave</DialogTitle>
          <DialogDescription>
            {meta
              ? `Adicione uma chave de API ${meta.name}. Você pode ter várias.`
              : 'Adicione uma chave de API.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="integracoes-key-name">Nome (rótulo)</Label>
            <Input
              id="integracoes-key-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setInlineError(null)
              }}
              placeholder="Ex.: Produção, Conta cliente X"
              maxLength={60}
              autoComplete="off"
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Use um rótulo para identificar esta chave depois.
            </p>
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
              Sua chave fica criptografada no banco. Nunca exibida em texto puro.
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
          <Button type="button" onClick={handleSave} disabled={saving || !canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
