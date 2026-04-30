import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import {
  AlertCircle,
  Calendar,
  CreditCard,
  FileText,
  MessageSquare,
  Bot,
  Users,
  Receipt,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card'
import { Badge } from '@/client/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table'
import { formatCurrency } from '@/lib/utils/format-currency'
import { formatDate } from '@/lib/utils/format-date'
import { INVOICE_STATUS_CONFIG } from '@/lib/utils/billing-constants'
import {
  getOrgBillingDataAction,
  type OrgBillingUsage,
} from '@/client/components/billing/actions'
import { ChangePlanDialog } from '@/client/components/billing/change-plan-dialog'
import { DownloadInvoiceButton } from '@/client/components/billing/download-invoice-button'
import { UpdatePaymentMethodButton } from '@/client/components/billing/update-payment-method-button'

export const metadata: Metadata = {
  title: 'Cobrança | Quayer',
}

export const dynamic = 'force-dynamic'

// ── Helpers ──────────────────────────────────────────────────────────────

function pct(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

function barColorClass(percent: number): string {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 70) return 'bg-yellow-500'
  return 'bg-emerald-500'
}

function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function billingCycleLabel(cycle: string): string {
  switch (cycle) {
    case 'YEARLY':
      return 'Anual'
    case 'QUARTERLY':
      return 'Trimestral'
    case 'MONTHLY':
    default:
      return 'Mensal'
  }
}

// ── Subcomponents ────────────────────────────────────────────────────────

interface UsageCardProps {
  icon: React.ElementType
  label: string
  used: number
  limit: number
  formatter?: (n: number) => string
}

function UsageCard({ icon: Icon, label, used, limit, formatter }: UsageCardProps) {
  const fmt = formatter ?? ((n: number) => n.toLocaleString('pt-BR'))
  const p = pct(used, limit)
  const color = barColorClass(p)
  const unlimited = limit <= 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {label}
          </CardTitle>
          {!unlimited && p >= 90 && (
            <Badge variant="destructive" className="h-5">
              Limite próximo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {fmt(used)}
          <span className="text-sm font-normal text-muted-foreground">
            {' '}
            / {unlimited ? '∞' : fmt(limit)}
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${color}`}
            style={{ width: unlimited ? '5%' : `${p}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {unlimited ? 'Uso ilimitado' : `${p}% utilizado este mês`}
        </p>
      </CardContent>
    </Card>
  )
}

function UsageSection({ usage }: { usage: OrgBillingUsage }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <UsageCard
        icon={MessageSquare}
        label="Mensagens"
        used={usage.messagesUsed}
        limit={usage.messagesLimit}
      />
      <UsageCard
        icon={Bot}
        label="Créditos IA"
        used={usage.aiCreditsUsed}
        limit={usage.aiCreditsLimit}
      />
      <UsageCard
        icon={Users}
        label="Usuários ativos"
        used={usage.contactsCount}
        limit={usage.contactsLimit}
      />
      <UsageCard
        icon={FileText}
        label="Armazenamento"
        used={usage.storageUsedMb}
        limit={usage.storageLimitMb}
        formatter={formatStorage}
      />
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export default async function OrgBillingPage() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) redirect('/login')
  if (!orgId) redirect('/')

  const result = await getOrgBillingDataAction()

  if (!result.success || !result.data) {
    return (
      <div className="flex-1 p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Erro ao carregar cobrança
            </CardTitle>
            <CardDescription>
              {result.error ?? 'Não foi possível carregar os dados de cobrança.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const { subscription, usage, invoices, plans, paymentMethod } = result.data

  return (
    <div className="flex-1 space-y-8 p-6 md:p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cobrança</h1>
        <p className="text-muted-foreground">
          Acompanhe seu plano, uso, método de pagamento e faturas.
        </p>
      </div>

      {/* 1. Plano atual */}
      <section aria-labelledby="plano-atual">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle id="plano-atual" className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Plano atual
              </CardTitle>
              <CardDescription>
                Seu plano, valor e data da próxima cobrança.
              </CardDescription>
            </div>
            <ChangePlanDialog
              plans={plans}
              currentPlanId={subscription?.planId ?? null}
            />
          </CardHeader>
          <CardContent>
            {subscription ? (
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Plano
                  </p>
                  <p className="text-2xl font-bold mt-1">{subscription.planName}</p>
                  <Badge variant="secondary" className="mt-2">
                    {billingCycleLabel(subscription.billingCycle)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Valor
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    {subscription.isFree
                      ? 'Grátis'
                      : formatCurrency(subscription.currentPriceCents)}
                  </p>
                  {!subscription.isFree && (
                    <p className="text-xs text-muted-foreground mt-1">
                      por {billingCycleLabel(subscription.billingCycle).toLowerCase()}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Próxima cobrança
                  </p>
                  <p className="text-2xl font-bold mt-1 flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    {subscription.nextBillingDate
                      ? formatDate(subscription.nextBillingDate)
                      : '—'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-3">
                <p className="text-muted-foreground">
                  Sua organização está no plano gratuito.
                </p>
                <ChangePlanDialog
                  plans={plans}
                  currentPlanId={null}
                  trigger={<button className="text-sm text-primary underline">Ver planos disponíveis</button>}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 2. Uso do mês */}
      <section aria-labelledby="uso-do-mes" className="space-y-3">
        <div>
          <h2 id="uso-do-mes" className="text-xl font-semibold">
            Uso do mês
          </h2>
          <p className="text-sm text-muted-foreground">
            {usage?.period ?? 'Período atual'} — limites conforme o plano contratado.
          </p>
        </div>
        {usage ? (
          <UsageSection usage={usage} />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Contrate um plano para ver o uso e limites da sua organização.
            </CardContent>
          </Card>
        )}
      </section>

      {/* 3. Método de pagamento */}
      <section aria-labelledby="metodo-pagamento">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle id="metodo-pagamento" className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Método de pagamento
              </CardTitle>
              <CardDescription>
                Como você paga pela sua assinatura Quayer.
              </CardDescription>
            </div>
            <UpdatePaymentMethodButton />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="h-12 w-16 rounded-md border bg-muted flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{paymentMethod.label}</p>
                <p className="text-sm text-muted-foreground">
                  {paymentMethod.last4
                    ? `•••• •••• •••• ${paymentMethod.last4}`
                    : paymentMethod.kind === 'NONE'
                      ? 'Nenhum método cadastrado'
                      : 'Detalhes do cartão não disponíveis'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 4. Faturas */}
      <section aria-labelledby="faturas">
        <Card>
          <CardHeader>
            <CardTitle id="faturas" className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Faturas
            </CardTitle>
            <CardDescription>
              Últimas faturas emitidas (12 mais recentes).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-center">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length > 0 ? (
                  invoices.map((inv) => {
                    const cfg = INVOICE_STATUS_CONFIG[inv.status] ?? {
                      label: inv.status,
                      className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
                    }
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">
                          {inv.number}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.issuedAt)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(inv.amountCents)}
                        </TableCell>
                        <TableCell>
                          <Badge className={cfg.className}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(inv.dueDate)}
                        </TableCell>
                        <TableCell className="text-center">
                          <DownloadInvoiceButton
                            invoiceId={inv.id}
                            invoiceNumber={inv.number}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-10 text-muted-foreground"
                    >
                      Nenhuma fatura emitida ainda.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
