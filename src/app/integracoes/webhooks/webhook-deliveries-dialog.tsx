'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Package } from 'lucide-react'
import type { Webhook } from '@prisma/client'

interface WebhookDeliveriesDialogProps {
  webhook: Webhook | null
  isOpen: boolean
  onClose: () => void
}

// Real deliveries - empty until webhook delivery tracking is implemented
export function WebhookDeliveriesDialog({ webhook, isOpen, onClose }: WebhookDeliveriesDialogProps) {
  const isLoading = false
  const deliveries: any[] = []

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Entregas do Webhook</DialogTitle>
          <DialogDescription>
            Histórico de entregas do webhook: <strong>{webhook?.id}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Nenhuma entrega registrada
              </h3>
              <p className="text-muted-foreground">
                As entregas aparecerão aqui quando eventos forem disparados
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Total de {deliveries.length} entrega(s)
                </p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Código HTTP</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <Badge variant="outline">{delivery.event}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={delivery.success ? 'default' : 'destructive'}>
                          {delivery.success ? 'Sucesso' : 'Falha'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`font-mono text-sm ${
                          delivery.statusCode >= 200 && delivery.statusCode < 300
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {delivery.statusCode}
                        </span>
                      </TableCell>
                      <TableCell>
                        {delivery.attemptCount} tentativa(s)
                      </TableCell>
                      <TableCell>
                        {formatDistanceToNow(new Date(delivery.createdAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Alert className="mt-4">
                <AlertDescription>
                  <strong>Nota:</strong> As entregas são mantidas por 30 dias. Tentativas de reenvio são feitas automaticamente em caso de falha (máximo 3 tentativas).
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
