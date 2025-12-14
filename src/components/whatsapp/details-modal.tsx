'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
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
import { Pencil, CheckCircle2, XCircle, Calendar, Clock, Hash, Building2, User, Smartphone, Copy, Check } from 'lucide-react'
import { ConnectionStatus, type Connection as Instance } from '@prisma/client'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useState } from 'react'
import { toast } from 'sonner'

interface DetailsModalProps {
  instance: any | null
  isOpen: boolean
  onClose: () => void
  onEdit?: (instance: any) => void
}

// Helper para formatar datas com segurança
function safeFormatDate(date: any): string {
  if (!date) return 'N/A'
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return 'N/A'
    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR })
  } catch {
    return 'N/A'
  }
}

// Determinar o provider correto
function getProviderName(instance: any): string {
  if (instance?.provider === 'UAZAPI' || instance?.uazInstanceId) return 'Quayer (UAZapi)'
  if (instance?.provider) return instance.provider
  return 'WhatsApp'
}

export function DetailsModal({ instance, isOpen, onClose, onEdit }: DetailsModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  if (!instance) return null

  // Normalizar status para comparação
  const rawStatus = (instance.uazStatus || instance.status || '').toLowerCase()
  const isConnected = rawStatus === 'connected' || rawStatus === 'open' || instance.status === ConnectionStatus.CONNECTED
  const providerName = getProviderName(instance)

  // Função para copiar texto com feedback
  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      toast.success(`${fieldName} copiado!`)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast.error('Erro ao copiar')
    }
  }

  // Componente de célula copiável
  const CopyableCell = ({ value, fieldName }: { value: string, fieldName: string }) => (
    <div className="flex items-center gap-2 group">
      <span className="font-mono text-xs select-all">{value}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => handleCopy(value, fieldName)}
        aria-label={`Copiar ${fieldName}`}
      >
        {copiedField === fieldName ? (
          <Check className="h-3 w-3 text-green-500" aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3" aria-hidden="true" />
        )}
      </Button>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        aria-describedby="details-modal-description"
      >
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl flex items-center gap-2">
                Detalhes da Integração
              </DialogTitle>
              <DialogDescription id="details-modal-description" className="flex items-center gap-2 mt-2">
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                <span>{providerName} - {instance.name}</span>
              </DialogDescription>
            </div>
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(instance)}
                aria-label={`Editar integração ${instance.name}`}
              >
                <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
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
                    <TableCell>{safeFormatDate(instance.createdAt)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        Atualizado
                      </div>
                    </TableCell>
                    <TableCell>{safeFormatDate(instance.updatedAt)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        Provedor
                      </div>
                    </TableCell>
                    <TableCell>{providerName}</TableCell>
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
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                Identificadores
              </CardTitle>
              <CardDescription>IDs únicos no sistema (clique para copiar)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table aria-label="Identificadores da integração">
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium w-1/3">
                      ID da Integração
                    </TableCell>
                    <TableCell>
                      {instance.id ? (
                        <CopyableCell value={instance.id} fieldName="ID da Integração" />
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      Token da Instância
                    </TableCell>
                    <TableCell>
                      {instance.uazapiToken ? (
                        <CopyableCell value={instance.uazapiToken} fieldName="Token" />
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">
                      ID do Broker
                    </TableCell>
                    <TableCell>
                      {(instance as any).brokerId ? (
                        <CopyableCell value={(instance as any).brokerId} fieldName="ID do Broker" />
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
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
                    <TableCell>{providerName}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Último QR Code</TableCell>
                    <TableCell>{safeFormatDate(instance.updatedAt) !== 'N/A' ? safeFormatDate(instance.updatedAt) : 'Nunca gerado'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-4" />

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            aria-label="Fechar detalhes da integração"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
