"use client"

import { useState, useEffect } from "react"
import { Mail, Search, Download, RefreshCcw, Shield, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

// Helper para formatar datas com segurança
function safeFormatDate(date: any): string {
  if (!date) return "N/A"
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return "N/A"
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
  } catch {
    return "N/A"
  }
}

import {
  listMessagesAction,
  getMessagesStatsAction,
  listOrganizationsForFilterAction,
  listMessagesFromUazapiAction,
  getMessagesStatsFromUazapiAction,
} from "../actions"

/**
 * Admin Messages Page
 *
 * Exibe mensagens de TODAS as organizações
 * Acesso: SOMENTE admin
 *
 * ✅ CORREÇÃO: Usando dados reais via Server Actions
 */

interface Message {
  id: string
  content: string
  direction: string
  status: string
  type: string
  author: string
  createdAt: Date
  contact: {
    id: string
    phoneNumber: string
    name: string | null
  }
  session: {
    id: string
    organizationId: string | null
    organization: {
      id: string
      name: string
    } | null
  }
  instance?: {
    id: string
    name: string
    token?: string
  }
  source?: 'local' | 'uazapi'
}

interface Stats {
  totalMessages: number
  totalDelivered: number
  totalRead: number
  totalFailed: number
  messagesLast24h: number
  deliveryRate: string
  readRate: string
  failedRate: string
  totalOutbound?: number
  totalInbound?: number
  connectedInstances?: number
}

interface Organization {
  id: string
  name: string
}

export default function AdminMessagesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [orgFilter, setOrgFilter] = useState("all")
  const [directionFilter, setDirectionFilter] = useState("all")
  const [dataSource, setDataSource] = useState<"uazapi" | "local">("uazapi") // Fonte de dados
  const [page, setPage] = useState(1)
  const [limit] = useState(20)

  // Data state
  const [messages, setMessages] = useState<Message[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load data on mount and when filters change
  useEffect(() => {
    loadData()
  }, [page, statusFilter, orgFilter, directionFilter, dataSource])

  // Load stats and organizations once, and when data source changes
  useEffect(() => {
    loadStats()
    loadOrganizations()
  }, [dataSource])

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      let result: any

      if (dataSource === "uazapi") {
        // Buscar do UAZapi diretamente
        result = await listMessagesFromUazapiAction({
          page,
          limit,
        })
      } else {
        // Buscar do banco local
        result = await listMessagesAction({
          page,
          limit,
          search: searchQuery || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          organizationId: orgFilter !== "all" ? orgFilter : undefined,
        })
      }

      if (result.success && result.data) {
        // Aplicar filtro de direcao localmente caso a API nao suporte
        let filteredData = result.data.data || []
        if (directionFilter !== "all") {
          filteredData = filteredData.filter((m: Message) => m.direction === directionFilter)
        }
        setMessages(filteredData)
        setPagination({
          total: result.data.pagination?.total || 0,
          totalPages: result.data.pagination?.totalPages || 0,
        })
      } else {
        setError(result.error || "Erro ao carregar mensagens")
      }
    } catch (err: any) {
      setError(err.message || "Erro ao carregar mensagens")
    } finally {
      setIsLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      let result: any

      if (dataSource === "uazapi") {
        result = await getMessagesStatsFromUazapiAction()
      } else {
        result = await getMessagesStatsAction()
      }

      if (result.success && result.data) {
        setStats(result.data)
      }
    } catch (err) {
      console.error("Erro ao carregar estatísticas:", err)
    }
  }

  const loadOrganizations = async () => {
    try {
      const result = await listOrganizationsForFilterAction()
      if (result.success && result.data) {
        setOrganizations(result.data)
      }
    } catch (err) {
      console.error("Erro ao carregar organizações:", err)
    }
  }

  const handleSearch = () => {
    setPage(1)
    loadData()
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      delivered: "default",
      sent: "default",
      read: "secondary",
      failed: "destructive",
      pending: "outline",
    }

    const labels: Record<string, string> = {
      delivered: "Entregue",
      sent: "Enviado",
      read: "Lido",
      failed: "Falhou",
      pending: "Pendente",
    }

    return (
      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    )
  }

  const getTypeBadge = (direction: string) => {
    return (
      <Badge variant={direction === "OUTBOUND" ? "default" : "secondary"}>
        {direction === "OUTBOUND" ? "Enviada" : "Recebida"}
      </Badge>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar mensagens: {error}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mensagens (Global)</h1>
          <p className="text-muted-foreground mt-1">
            Visão de todas as mensagens de todas as {dataSource === "uazapi" ? "instâncias UAZapi" : "organizações"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dataSource} onValueChange={(v: "uazapi" | "local") => { setDataSource(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Fonte de dados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uazapi">UAZapi (Direto)</SelectItem>
              <SelectItem value="local">Banco Local</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant={dataSource === "uazapi" ? "default" : "secondary"} className="h-6">
            {dataSource === "uazapi" ? "UAZapi" : "Local"}
          </Badge>
          <Badge variant="destructive" className="h-6">
            Admin
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mensagens</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats ? (
              <>
                <div className="text-2xl font-bold">{stats.totalMessages.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  Ultimas 24h: {stats.messagesLast24h.toLocaleString()}
                </p>
              </>
            ) : (
              <Skeleton className="h-8 w-20" />
            )}
          </CardContent>
        </Card>

        {dataSource === "uazapi" ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Enviadas</CardTitle>
                <Mail className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                {stats ? (
                  <>
                    <div className="text-2xl font-bold text-blue-600">{(stats.totalOutbound || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      De {stats.totalMessages.toLocaleString()} mensagens
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-8 w-20" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recebidas</CardTitle>
                <Mail className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                {stats ? (
                  <>
                    <div className="text-2xl font-bold text-green-600">{(stats.totalInbound || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      De {stats.totalMessages.toLocaleString()} mensagens
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-8 w-20" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Instâncias Conectadas</CardTitle>
                <Mail className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                {stats ? (
                  <>
                    <div className="text-2xl font-bold text-purple-600">{(stats.connectedInstances || 0).toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">Produzindo mensagens</p>
                  </>
                ) : (
                  <Skeleton className="h-8 w-20" />
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Entrega</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats ? (
                  <>
                    <div className="text-2xl font-bold">{stats.deliveryRate}%</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.totalDelivered.toLocaleString()} / {stats.totalMessages.toLocaleString()}
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-8 w-20" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Leitura</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {stats ? (
                  <>
                    <div className="text-2xl font-bold">{stats.readRate}%</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.totalRead.toLocaleString()} / {stats.totalMessages.toLocaleString()}
                    </p>
                  </>
                ) : (
                  <Skeleton className="h-8 w-20" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Falhadas</CardTitle>
                <Mail className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                {stats ? (
                  <>
                    <div className="text-2xl font-bold text-destructive">
                      {stats.totalFailed.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">{stats.failedRate}% do total</p>
                  </>
                ) : (
                  <Skeleton className="h-8 w-20" />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Busca</CardTitle>
          <CardDescription>
            Filtre mensagens por organizacao, status e palavras-chave
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por telefone, mensagem..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-8"
                />
              </div>
            </div>

            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Organizacao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Organizacoes</SelectItem>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="delivered">Entregue</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="read">Lido</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>

            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Direcao" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="OUTBOUND">Enviadas</SelectItem>
                <SelectItem value="INBOUND">Recebidas</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" onClick={loadData}>
              <RefreshCcw className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                // Exportar mensagens visíveis como CSV
                if (messages.length === 0) return
                const headers = ["Data", "Organizacao", "Telefone", "Mensagem", "Direcao", "Status"]
                const rows = messages.map(m => [
                  new Date(m.createdAt).toLocaleString("pt-BR"),
                  m.session?.organization?.name || "N/A",
                  m.contact?.phoneNumber || "N/A",
                  `"${(m.content || "").replace(/"/g, '""')}"`,
                  m.direction === "OUTBOUND" ? "Enviada" : "Recebida",
                  m.status
                ])
                const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
                const url = URL.createObjectURL(blob)
                const link = document.createElement("a")
                link.href = url
                link.download = `mensagens-${new Date().toISOString().split("T")[0]}.csv`
                link.click()
                URL.revokeObjectURL(url)
              }}
              disabled={messages.length === 0}
            >
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historico de Mensagens</CardTitle>
          <CardDescription>
            Todas as mensagens enviadas e recebidas por todas as organizacoes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Nenhuma mensagem encontrada
              </h3>
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== "all" || orgFilter !== "all"
                  ? "Tente ajustar os filtros"
                  : "Ainda nao ha mensagens registradas no sistema"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  {dataSource === "uazapi" ? (
                    <TableHead>Instância</TableHead>
                  ) : (
                    <TableHead>Organização</TableHead>
                  )}
                  <TableHead>Telefone</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-mono text-xs">
                      {safeFormatDate(message.createdAt)}
                    </TableCell>
                    {dataSource === "uazapi" ? (
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
                            {message.instance?.name || "N/A"}
                          </Badge>
                        </div>
                      </TableCell>
                    ) : (
                      <TableCell className="font-medium">
                        {message.session?.organization?.name || "N/A"}
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-sm">
                      {message.contact?.phoneNumber || "N/A"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {message.contact?.name || message.author || "Desconhecido"}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {message.content}
                    </TableCell>
                    <TableCell>{getTypeBadge(message.direction)}</TableCell>
                    <TableCell>{getStatusBadge(message.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {pagination.total > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {messages.length} de {pagination.total.toLocaleString()} mensagens
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                >
                  Proximo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-yellow-500/50 bg-yellow-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Aviso de Privacidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Esta pagina exibe mensagens de <strong>todas as organizacoes</strong> do sistema.
            Acesso restrito apenas para administradores do sistema. Use com responsabilidade e
            respeite a privacidade dos usuarios conforme LGPD.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
