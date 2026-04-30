'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Receipt,
  ChevronLeft,
  ChevronRight,
  Filter,
  FileText,
  Download,
} from 'lucide-react'
import { Card, CardContent } from '@/client/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/client/components/ui/select'
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
import { INVOICE_STATUS_CONFIG, NFSE_STATUS_CONFIG } from '@/lib/utils/billing-constants'
import { toast } from 'sonner'
import { getAdminAllInvoicesAction, type AdminInvoice } from '../actions'

const PAGE_SIZE = 8

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<AdminInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  useEffect(() => {
    loadInvoices()
  }, [])

  const loadInvoices = async () => {
    try {
      setIsLoading(true)
      const result = await getAdminAllInvoicesAction()
      if (result.success) {
        setInvoices(result.data)
      } else {
        toast.error(result.error || 'Erro ao carregar faturas')
      }
    } catch {
      toast.error('Erro ao carregar faturas')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setPage(0) // Reset pagination on filter change
  }

  const filtered = statusFilter === 'all'
    ? invoices
    : invoices.filter((inv) => inv.status === statusFilter)

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
            <BreadcrumbLink href="/admin/billing">Cobranca</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Faturas</BreadcrumbPage>
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
            <div>
              <Skeleton className="h-9 w-32 mb-2" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
          <Skeleton className="h-9 w-48" />
          <Card>
            <CardContent className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      {breadcrumbHeader}

      <div className="flex-1 space-y-6 p-8 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Faturas</h2>
            <p className="text-muted-foreground">Todas as faturas de todas as organizacoes.</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin/billing">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Link>
          </Button>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="PAID">Pago</SelectItem>
              <SelectItem value="PENDING">Pendente</SelectItem>
              <SelectItem value="OVERDUE">Atrasado</SelectItem>
              <SelectItem value="CANCELED">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Organizacao</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>NFS-e</TableHead>
                  <TableHead className="text-center">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((inv) => {
                  const sCfg = INVOICE_STATUS_CONFIG[inv.status] || {
                    label: inv.status,
                    className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
                  }
                  const nCfg = NFSE_STATUS_CONFIG[inv.nfseStatus] || {
                    label: inv.nfseStatus || 'N/A',
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
                      <TableCell>
                        <Badge className={nCfg.className}>{nCfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {inv.pdfUrl ? (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" aria-label="Download PDF">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {paginated.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      Nenhuma fatura encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Pagina {page + 1} de {totalPages} ({filtered.length} faturas)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Proxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
