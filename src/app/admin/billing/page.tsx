'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DollarSign,
  Users,
  TrendingDown,
  AlertCircle,
  ChevronRight,
  Receipt,
  CreditCard,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/client/components/ui/card'
import { Badge } from '@/client/components/ui/badge'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table'
import { SidebarTrigger } from '@/client/components/ui/sidebar'
import { Separator } from '@/client/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/client/components/ui/breadcrumb'
import { formatCurrency } from '@/lib/utils/format-currency'
import { formatDate } from '@/lib/utils/format-date'
import { INVOICE_STATUS_CONFIG } from '@/lib/utils/billing-constants'
import { toast } from 'sonner'
import {
  getAdminBillingStatsAction,
  getAdminRecentInvoicesAction,
  type BillingStats,
  type PlanCount,
  type RecentInvoice,
} from './actions'

export default function AdminBillingPage() {
  const [stats, setStats] = useState<BillingStats | null>(null)
  const [planCounts, setPlanCounts] = useState<PlanCount[]>([])
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [statsResult, invoicesResult] = await Promise.all([
        getAdminBillingStatsAction(),
        getAdminRecentInvoicesAction(),
      ])

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data.stats)
        setPlanCounts(statsResult.data.planCounts)
      } else {
        toast.error('Erro ao carregar estatisticas de cobranca')
      }

      if (invoicesResult.success) {
        setRecentInvoices(invoicesResult.data)
      }
    } catch {
      toast.error('Erro ao carregar dados de cobranca')
    } finally {
      setIsLoading(false)
    }
  }

  const breadcrumbHeader = (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin">Administracao</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Cobranca</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )

  if (isLoading) {
    return (
      <>
        {breadcrumbHeader}
        <div className="flex-1 space-y-6 p-8 pt-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-48" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-36" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32 mb-2" />
                  <Skeleton className="h-3 w-48" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {breadcrumbHeader}

      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Cobranca</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/billing/subscriptions">
                <CreditCard className="h-4 w-4 mr-2" />
                Assinaturas
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/billing/invoices">
                <Receipt className="h-4 w-4 mr-2" />
                Todas as faturas
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">MRR</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats?.mrr ?? 0)}</div>
              <p className="text-xs text-muted-foreground">Receita recorrente mensal</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assinantes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalSubscribers ?? 0}</div>
              <p className="text-xs text-muted-foreground">Total de organizacoes pagantes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Churn rate</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.churnRate ?? 0}%</div>
              <p className="text-xs text-muted-foreground">Taxa de cancelamento mensal</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Faturas pendentes</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.pendingInvoices ?? 0}</div>
              <p className="text-xs text-muted-foreground">Aguardando pagamento</p>
            </CardContent>
          </Card>
        </div>

        {/* Plan Distribution + Recent Invoices */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Plan Counts */}
          <Card>
            <CardHeader>
              <CardTitle>Assinaturas por plano</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {planCounts.length > 0 ? (
                planCounts.map((item) => (
                  <div key={item.plan} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.plan}</span>
                    <Badge variant="secondary">{item.count}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma organizacao cadastrada.</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Invoices */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Faturas recentes</CardTitle>
                <CardDescription>Ultimas faturas emitidas</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/billing/invoices">
                  Ver todas
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numero</TableHead>
                    <TableHead>Organizacao</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInvoices.length > 0 ? (
                    recentInvoices.map((inv) => {
                      const sCfg = INVOICE_STATUS_CONFIG[inv.status] || {
                        label: inv.status,
                        className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
                      }
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-xs">{inv.number}</TableCell>
                          <TableCell className="text-sm">{inv.orgName}</TableCell>
                          <TableCell className="text-sm">{formatCurrency(inv.amount)}</TableCell>
                          <TableCell>
                            <Badge className={sCfg.className}>{sCfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(inv.date)}</TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhuma fatura emitida ainda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
