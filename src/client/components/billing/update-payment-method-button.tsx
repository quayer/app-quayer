'use client'

import { useState } from 'react'
import { CreditCard, ExternalLink } from 'lucide-react'
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
import { toast } from 'sonner'

/**
 * UpdatePaymentMethodButton
 *
 * TODO: integrar com portal do gateway (Efí/Asaas/Stripe). Hoje abre um modal
 * com instruções manuais — quando o backend expuser `/billing/portal-link` ou
 * Stripe Elements, trocar por redirect real.
 */
export function UpdatePaymentMethodButton() {
  const [open, setOpen] = useState(false)

  const handleContactSupport = () => {
    toast.info('Entre em contato com suporte@quayer.com para atualizar o método.')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="h-4 w-4 mr-2" />
          Atualizar método
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atualizar método de pagamento</DialogTitle>
          <DialogDescription>
            A atualização de método de pagamento pelo painel ainda não está disponível.
            Estamos finalizando a integração com o portal de cobrança.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>Enquanto isso você pode:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Cancelar a assinatura atual e criar uma nova com outro método</li>
            <li>Solicitar a troca manual pelo suporte</li>
          </ul>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          <Button onClick={handleContactSupport}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Falar com suporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
