"use client"

import { useState } from "react"
import { Mail, Search, Filter, Download, RefreshCcw, Shield } from "lucide-react"
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

/**
 * Admin Messages Page
 *
 * Exibe mensagens de TODAS as organizações
 * Acesso: SOMENTE admin
 *
 * Conforme especificação ADMIN_SIDEBAR_REFINADO
 */

export default function AdminMessagesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [orgFilter, setOrgFilter] = useState("all")

  // TODO: Fetch real data from API
  const messages = [
    {
      id: "1",
      organization: "ACME Corporation",
      phone: "+55 11 99999-9999",
      message: "Olá, preciso de ajuda com meu pedido",
      status: "delivered",
      timestamp: "2025-10-18 10:30:00",
      type: "received",
    },
    {
      id: "2",
      organization: "Tech Solutions Ltda",
      phone: "+55 11 98888-8888",
      message: "Sua compra foi aprovada!",
      status: "read",
      timestamp: "2025-10-18 10:25:00",
      type: "sent",
    },
    {
      id: "3",
      organization: "Marketing Pro",
      phone: "+55 11 97777-7777",
      message: "Promoção especial só hoje!",
      status: "failed",
      timestamp: "2025-10-18 10:20:00",
      type: "sent",
    },
  ]

  const getStatusBadge = (status: string) => {
    const variants = {
      delivered: "default",
      read: "secondary",
      failed: "destructive",
      pending: "outline",
    }

    const labels = {
      delivered: "Entregue",
      read: "Lido",
      failed: "Falhou",
      pending: "Pendente",
    }

    return (
      <Badge variant={variants[status] as any}>
        {labels[status]}
      </Badge>
    )
  }

  const getTypeBadge = (type: string) => {
    return (
      <Badge variant={type === "sent" ? "default" : "secondary"}>
        {type === "sent" ? "Enviada" : "Recebida"}
      </Badge>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mensagens (Global)</h1>
          <p className="text-muted-foreground">
            Visão de todas as mensagens de todas as organizações
          </p>
        </div>
        <Badge variant="destructive" className="h-6">
          Acesso Admin
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Enviadas</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12,345</div>
            <p className="text-xs text-muted-foreground">Últimas 24h: 1,234</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Entrega</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">95.6%</div>
            <p className="text-xs text-muted-foreground">11,800 / 12,345</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Leitura</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">77.5%</div>
            <p className="text-xs text-muted-foreground">9,567 / 12,345</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhadas</CardTitle>
            <Mail className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">545</div>
            <p className="text-xs text-muted-foreground">4.4% do total</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros e Busca</CardTitle>
          <CardDescription>
            Filtre mensagens por organização, status e palavras-chave
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
                  className="pl-8"
                />
              </div>
            </div>

            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Organização" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Organizações</SelectItem>
                <SelectItem value="acme">ACME Corporation</SelectItem>
                <SelectItem value="tech">Tech Solutions Ltda</SelectItem>
                <SelectItem value="marketing">Marketing Pro</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="delivered">Entregue</SelectItem>
                <SelectItem value="read">Lido</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon">
              <RefreshCcw className="h-4 w-4" />
            </Button>

            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Mensagens</CardTitle>
          <CardDescription>
            Todas as mensagens enviadas e recebidas por todas as organizações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Organização</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((message) => (
                <TableRow key={message.id}>
                  <TableCell className="font-mono text-xs">
                    {message.timestamp}
                  </TableCell>
                  <TableCell className="font-medium">
                    {message.organization}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {message.phone}
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {message.message}
                  </TableCell>
                  <TableCell>{getTypeBadge(message.type)}</TableCell>
                  <TableCell>{getStatusBadge(message.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando 3 de 12,345 mensagens
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Anterior
              </Button>
              <Button variant="outline" size="sm">
                Próximo
              </Button>
            </div>
          </div>
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
            Esta página exibe mensagens de <strong>todas as organizações</strong> do sistema.
            Acesso restrito apenas para administradores do sistema. Use com responsabilidade e
            respeite a privacidade dos usuários conforme LGPD.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
