'use client'

import { useState, useTransition } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Badge } from '@/client/components/ui/badge'
import { Switch } from '@/client/components/ui/switch'
import { Separator } from '@/client/components/ui/separator'
import { formatCurrency } from '@/lib/utils/format-currency'
import { toast } from 'sonner'
import { api } from '@/igniter.client'
import { useRouter } from 'next/navigation'
import type { OrgBillingPlanSummary } from './actions'

interface ChangePlanDialogProps {
  plans: OrgBillingPlanSummary[]
  currentPlanId: string | null
  trigger?: React.ReactNode
}

function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`
  return `${mb} MB`
}

export function ChangePlanDialog({ plans, currentPlanId, trigger }: ChangePlanDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isYearly, setIsYearly] = useState(false)
  const [pending, startTransition] = useTransition()
  const [targetPlanId, setTargetPlanId] = useState<string | null>(null)

  const sorted = [...plans].sort((a, b) => a.priceMonthly - b.priceMonthly)

  const handleChange = (planId: string) => {
    if (planId === currentPlanId) return
    setTargetPlanId(planId)
    startTransition(async () => {
      try {
        const result = await api.subscriptions.changePlan.mutate({
          body: {
            planId,
            billingCycle: isYearly ? 'YEARLY' : 'MONTHLY',
          },
        })
        const data = (result as unknown as { data?: { gatewaySetupFailed?: boolean; message?: string } }).data
        if (data?.gatewaySetupFailed) {
          toast.warning(data.message ?? 'Plano alterado, verifique o gateway.')
        } else {
          toast.success(data?.message ?? 'Plano alterado com sucesso.')
        }
        setOpen(false)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Falha ao alterar o plano.')
      } finally {
        setTargetPlanId(null)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm">Mudar plano</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escolha seu plano</DialogTitle>
          <DialogDescription>
            Compare os planos disponíveis e altere a qualquer momento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 py-2">
          <span className={`text-sm ${!isYearly ? 'font-semibold' : 'text-muted-foreground'}`}>
            Mensal
          </span>
          <Switch checked={isYearly} onCheckedChange={setIsYearly} />
          <span className={`text-sm ${isYearly ? 'font-semibold' : 'text-muted-foreground'}`}>
            Anual
          </span>
          {isYearly && (
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              2 meses grátis
            </Badge>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((plan) => {
            const isCurrent = plan.id === currentPlanId
            const price = isYearly && plan.priceYearly ? plan.priceYearly : plan.priceMonthly
            const priceLabel = plan.isFree
              ? 'Grátis'
              : formatCurrency(price) + (isYearly ? '/ano' : '/mês')

            return (
              <Card key={plan.id} className={isCurrent ? 'border-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {isCurrent && <Badge variant="secondary">Atual</Badge>}
                  </div>
                  <CardDescription className="line-clamp-2">
                    {plan.description ?? '—'}
                  </CardDescription>
                  <div className="pt-2">
                    <span className="text-2xl font-bold">{priceLabel}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Separator />
                  <ul className="space-y-2 text-sm">
                    <Feat ok>{plan.maxUsers} usuário{plan.maxUsers > 1 ? 's' : ''}</Feat>
                    <Feat ok>
                      {plan.maxMessages.toLocaleString('pt-BR')} mensagens/mês
                    </Feat>
                    <Feat ok>{plan.maxAiCredits.toLocaleString('pt-BR')} créditos IA</Feat>
                    <Feat ok>{formatStorage(plan.maxStorage)} armazenamento</Feat>
                    <Feat ok={plan.hasAiAgents}>Agentes IA</Feat>
                    <Feat ok={plan.hasApi}>Acesso API</Feat>
                    <Feat ok={plan.hasPrioritySupport}>Suporte prioritário</Feat>
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrent ? 'outline' : 'default'}
                    disabled={isCurrent || pending}
                    onClick={() => handleChange(plan.id)}
                  >
                    {pending && targetPlanId === plan.id && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {isCurrent ? 'Plano atual' : 'Selecionar'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Feat({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      )}
      <span className={ok ? '' : 'text-muted-foreground/50'}>{children}</span>
    </li>
  )
}
