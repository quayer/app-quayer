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
import {
  PROVIDERS,
  type ProviderKey,
  type ProviderKeyRecord,
} from './providers-catalog'
import { useProviders } from './use-providers'

export function IntegracoesPage() {
  const { tokens } = useAppTokens()
  const { groups, loading, backendMissing, error, createKey, removeKey } =
    useProviders()

  // Modal state for adding a new key to a provider.
  const [addingProvider, setAddingProvider] = useState<ProviderKey | null>(null)

  // Confirm state for removing a specific key.
  const [removingKey, setRemovingKey] = useState<ProviderKeyRecord | null>(null)
  const [removing, setRemoving] = useState(false)

  const handleConfirmRemove = async () => {
    if (!removingKey) return
    setRemoving(true)
    try {
      await removeKey(removingKey.id)
      toast.success('Chave removida')
      setRemovingKey(null)
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível remover a chave.')
    } finally {
      setRemoving(false)
    }
  }

  const addingMeta = addingProvider
    ? PROVIDERS.find((p) => p.key === addingProvider) ?? null
    : null

  return (
    <div className="space-y-6" style={{ color: tokens.textPrimary }}>
      <header className="flex flex-col gap-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: tokens.textPrimary }}
        >
          Integrações
        </h1>
        <p className="text-sm" style={{ color: tokens.textTertiary }}>
          Cole suas próprias chaves de API. Você pode ter várias chaves por
          provedor e escolher qual cada agente usa.
        </p>
      </header>

      <main>
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
                A configuração de chaves próprias estará disponível em breve. Por
                enquanto, o agente usa as chaves globais da plataforma.
              </AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="space-y-3">
              {PROVIDERS.map((p) => (
                <Skeleton key={p.key} className="h-[120px] w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <ul className="space-y-3" aria-label="Lista de provedores de IA">
              {PROVIDERS.map((meta) => {
                const group = groups.find((g) => g.provider === meta.key)
                return (
                  <li key={meta.key}>
                    <ProviderRow
                      meta={meta}
                      keys={group?.keys ?? []}
                      disabled={backendMissing}
                      onAddKey={() => setAddingProvider(meta.key)}
                      onRemoveKey={(k) => setRemovingKey(k)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>

      <ApiKeyModal
        meta={addingMeta}
        open={addingProvider !== null}
        onClose={() => setAddingProvider(null)}
        onSave={createKey}
      />

      <AlertDialog
        open={removingKey !== null}
        onOpenChange={(open) => {
          if (!open) setRemovingKey(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover chave?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover
              {removingKey ? ` "${removingKey.name}"` : ' esta chave'}? Agentes
              que a usavam voltarão a usar a chave global da plataforma.
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
