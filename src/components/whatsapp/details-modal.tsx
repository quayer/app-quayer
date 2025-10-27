'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import { Pencil, CheckCircle2, XCircle, Calendar, Clock, Hash, Building2, User, Smartphone } from 'lucide-react'
import type { Instance } from '@prisma/client'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DetailsModalProps {
  instance: Instance | null
  isOpen: boolean
  onClose: () => void
  onEdit?: (instance: Instance) => void
}

export function DetailsModal({ instance, isOpen, onClose, onEdit }: DetailsModalProps) {
  if (!instance) return null

  const isConnected = instance.status === 'connected'

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">Detalhes da Integração</DialogTitle>
              <div className="flex items-center gap-2 mt-2">
                <img src="/logo.svg" alt="WhatsApp" className="h-5 w-5" />
                <span className="text-sm text-muted-foreground">WhatsApp falecomigo.ai</span>
              </div>
            </div>
            {onEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(instance)}>
                <Pencil className="h-4 w-4 mr-2" />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Status</CardDescription>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <Badge variant="default">Ativo</Badge>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-500" />
                      <Badge variant="secondary">Inativo</Badge>
                    </>
                  )}
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Conexão</CardDescription>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <Badge variant="default">Conectado</Badge>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-500" />
                      <Badge variant="destructive">Desconectado</Badge>
                    </>
                  )}
                </div>
              </CardHeader>
            </Card>
          </div>

          {/* Informações Gerais */}
          <Card>
            <CardHeader>
              <CardTitle>Informações Gerais</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        Criado
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(instance.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        Atualizado
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(instance.updatedAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        Provedor
                      </div>
                    </TableCell>
                    <TableCell>WhatsApp falecomigo.ai</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        Agentes Vinculados
                      </div>
                    </TableCell>
                    <TableCell>0 agente(s)</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* IDs do Sistema */}
          <Card>
            <CardHeader>
              <CardTitle>Identificadores</CardTitle>
              <CardDescription>IDs únicos no sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        ID da Integração
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{instance.id}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        Token da Instância
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{instance.uazapiToken || 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Hash className="h-4 w-4 text-muted-foreground" />
                        ID do Broker
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{instance.brokerId || 'N/A'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Configurações */}
          <Card>
            <CardHeader>
              <CardTitle>Configurações</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Nome nas Configurações</TableCell>
                    <TableCell>{instance.name}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        Telefone
                      </div>
                    </TableCell>
                    <TableCell>{instance.phoneNumber || 'Não configurado'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Tipo de Integração</TableCell>
                    <TableCell>WHATSAPP-BAILEYS</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Último QR Code</TableCell>
                    <TableCell>
                      {instance.updatedAt
                        ? formatDistanceToNow(new Date(instance.updatedAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })
                        : 'Nunca gerado'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
