'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/client/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/client/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/components/ui/alert-dialog'
import { useAppTokens } from '@/client/hooks/use-app-tokens'
import { ApiKeyModal } from './api-key-modal'
import { ProviderRow } from './provider-row'
import { PROVIDERS, type ProviderKey } from './providers-catalog'
import { useProviders } from './use-providers'

export function IntegracoesPage() {
  const { tokens } = useAppTokens()
  const { records, loading, backendMissing, error, saveKey, removeKey } =
    useProviders()

  // Modal state for configure / update
  const [editingProvider, setEditingProvider] = useState<ProviderKey | null>(null)

  // Confirm state for remove
  const [removingProvider, setRemovingProvider] = useState<ProviderKey | null>(null)
  const [removing, setRemoving] = useState(false)

  const handleConfirmRemove = async () => {
    if (!removingProvider) return
    setRemoving(true)
    try {
      await removeKey(removingProvider)
      toast.success('Chave removida')
      setRemovingProvider(null)
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível remover a chave.')
    } finally {
      setRemoving(false)
    }
  }

  const editingMeta = editingProvider
    ? PROVIDERS.find((p) => p.key === editingProvider) ?? null
    : null
  const editingRecord = editingProvider
    ? records.find((r) => r.provider === editingProvider) ?? null
    : null

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ color: tokens.textPrimary }}
    >
      <header className="border-b" style={{ borderColor: tokens.divider }}>
        <div className="container mx-auto flex flex-col gap-1 px-6 py-8">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: tokens.textPrimary }}
          >
            Integrações
          </h1>
          <p className="text-sm" style={{ color: tokens.textTertiary }}>
            Cole suas próprias chaves de API. O agente vai usar essas em vez das
            chaves globais da plataforma.
          </p>
        </div>
      </header>

      <main className="container mx-auto flex-1 px-6 py-8">
        <div className="mx-auto max-w-3xl space-y-4">
          {error && !backendMissing && (
            <Alert variant="destructive">
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {backendMissing && (
            <Alert>
              <KeyRound className="h-4 w-4" />
              <AlertTitle>Em breve</AlertTitle>
              <AlertDescription>
                A configuração de chaves próprias estará disponível em breve.
                Por enquanto, o agente usa as chaves globais da plataforma.
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="space-y-3">
              {PROVIDERS.map((p) => (
                <Skeleton key={p.key} className="h-[92px] w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <ul
              className="space-y-3"
              aria-label="Lista de provedores de IA"
            >
              {records.map((record) => {
                const meta =
                  PROVIDERS.find((p) => p.key === record.provider) ?? PROVIDERS[0]
                return (
                  <li key={record.provider}>
                    <ProviderRow
                      meta={meta}
                      record={record}
                      disabled={backendMissing}
                      onConfigure={() => setEditingProvider(record.provider)}
                      onRemove={() => setRemovingProvider(record.provider)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>

      <ApiKeyModal
        meta={editingMeta}
        currentRecord={editingRecord}
        open={editingProvider !== null}
        onClose={() => setEditingProvider(null)}
        onSave={saveKey}
      />

      <AlertDialog
        open={removingProvider !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingProvider(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover chave?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? O agente voltará a usar a chave global da plataforma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmRemove()
              }}
              disabled={removing}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
