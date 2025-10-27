'use client'

import { useState } from 'react'
import { Plus, Search, MoreVertical, Webhook, CheckCircle2, XCircle, Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/igniter.client'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function AdminWebhooksPage() {
  const [searchTerm, setSearchTerm] = useState('')

  // Fetch webhooks from API
  const { data: webhooksData, isLoading, error, refetch } = api.webhooks.list.useQuery()
  const webhooks = webhooksData?.data || []

  // Calculate statistics
  const stats = {
    total: webhooks.length,
    active: webhooks.filter((w: any) => w.isActive).length,
    inactive: webhooks.filter((w: any) => !w.isActive).length,
  }

  // Filter webhooks
  const filteredWebhooks = webhooks.filter((webhook: any) =>
    webhook.url?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    webhook.events?.some((e: string) => e.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (error) {
    return (
      <div className="pt-6">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar webhooks: {(error as any)?.message || 'Erro desconhecido'}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 pt-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Webhooks Globais</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie todos os webhooks configurados no sistema
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Webhook
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Total de Webhooks
            </CardDescription>
            <CardTitle className="text-4xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Ativos
            </CardDescription>
            <CardTitle className="text-4xl">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Inativos
            </CardDescription>
            <CardTitle className="text-4xl">{stats.inactive}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Search and Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por URL ou evento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredWebhooks.length === 0 ? (
            <div className="text-center py-12">
              <Webhook className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                Nenhum webhook encontrado
              </h3>
              <p className="text-muted-foreground mb-4">
                Configure o primeiro webhook para começar
              </p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Criar Webhook
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Organização</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Execução</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWebhooks.map((webhook: any) => (
                  <TableRow key={webhook.id}>
                    <TableCell className="font-medium max-w-xs truncate">
                      {webhook.url}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {webhook.events?.slice(0, 2).map((event: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                        {webhook.events?.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{webhook.events.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{webhook.organization?.name || '-'}</TableCell>
                    <TableCell>{webhook.instance?.name || 'Global'}</TableCell>
                    <TableCell>
                      <Badge variant={webhook.isActive ? 'default' : 'secondary'}>
                        {webhook.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {webhook.lastExecutedAt
                        ? formatDistanceToNow(new Date(webhook.lastExecutedAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })
                        : 'Nunca'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>Ver Detalhes</DropdownMenuItem>
                          <DropdownMenuItem>Editar</DropdownMenuItem>
                          <DropdownMenuItem>Testar Webhook</DropdownMenuItem>
                          <DropdownMenuItem>
                            {webhook.isActive ? 'Desativar' : 'Ativar'}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive">
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
