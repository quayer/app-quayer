'use client'

import {
  Plus, Search, MoreVertical, Plug, Building2, ChevronLeft, ChevronRight,
  RefreshCw, Trash2, CloudOff, Cloud, Wifi, WifiOff, AlertTriangle,
  Download, Signal, ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Card, CardContent, CardHeader } from '@/client/components/ui/card'
import {
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState<AdminInstance | null>(null)

  }

  if (loadError) {
    return (
      <div className="pt-6 px-8">
        <Alert variant="destructive">
        </Alert>
      </div>
    )
  }

  return (
    <TooltipProvider>
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/admin">Admin</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Integracoes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Sync indicator — right side of header */}
        <div className="ml-auto flex items-center gap-3">
          {isSyncing && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-fade-in">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Sincronizando...
            </span>
          )}
          {lastSyncTime && !isSyncing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleManualSync}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                  Sync {formatDistanceToNow(lastSyncTime, { locale: ptBR, addSuffix: true })}
                </button>
              </TooltipTrigger>
              <TooltipContent>Clique para re-sincronizar</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-x-hidden">
        {/* ─── Page Title ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-fade-in-up rounded-xl border border-border/30 bg-gradient-to-r from-muted/40 via-transparent to-muted/20 p-5">
          <div>
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-muted/30 border-transparent focus:border-border focus:bg-background transition-colors"
                />
              </div>
                  </Button>
                )}
              </div>
            ) : (
            )}
          </CardContent>
        </Card>

        {/* ─── Summary footer ────────────────────────────────────────── */}
        {!isLoading && !isLoadingUazapi && unifiedRows.length > 0 && (
          <p className="text-xs text-muted-foreground/60 text-center animate-fade-in">
            {stats.total} importada{stats.total !== 1 ? 's' : ''} + {orphans.length} somente UAZapi = {stats.total + orphans.length} total
          </p>
        )}
      </div>

      {/* ═══════════ DELETE CONFIRMATION ═══════════════════════════════ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integracao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.name}</strong>?
              A instancia sera desconectada da UAZapi e removida do banco.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin mr-2" />
                  Removendo...
                </>
              ) : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════ MODALS ═══════════════════════════════════════════ */}
      <CreateInstanceModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadInstances()
          setIsCreateModalOpen(false)
          toast.success('Integracao criada com sucesso')
        }}
      />

      <ConnectionModal
        instance={selectedInstance as any}
        isOpen={isConnectModalOpen}
        }}
      />

      <EditInstanceModal
        instance={selectedInstance as any}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedInstance(null)
        }}
        onSuccess={() => {
          loadInstances()
          setIsEditModalOpen(false)
          setSelectedInstance(null)
          toast.success('Integracao atualizada')
        }}
      />

      <DetailsModal
        instance={selectedInstance as any}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setSelectedInstance(null)
        }}
  )
}
