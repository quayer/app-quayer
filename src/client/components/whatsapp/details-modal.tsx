'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/client/components/ui/dialog'
import { Button } from '@/client/components/ui/button'
import { Separator } from '@/client/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/client/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/client/components/ui/command'
import {
  Pencil, Calendar, Clock, Building2, Smartphone,
  Copy, CheckCircle, RefreshCw, ChevronsUpDown, Check,
} from 'lucide-react'
import type { ModalInstance } from '@/types/instance'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const PROVIDER_LABELS: Record<string, string> = {
  WHATSAPP_WEB: 'UAZapi (WhatsApp Web)',
  WHATSAPP_CLOUD_API: 'Cloud API (Meta Oficial)',
  WHATSAPP_BUSINESS_API: 'WhatsApp Business API',
  INSTAGRAM_META: 'Instagram (Meta)',
  TELEGRAM_BOT: 'Telegram Bot',
  EMAIL_SMTP: 'Email SMTP',
}

function getProviderLabel(brokerType: string | undefined | null): string {
  if (!brokerType) return 'UAZapi (WhatsApp Web)'
  return PROVIDER_LABELS[brokerType] ?? brokerType
}

interface DetailsModalProps {
  instance: ModalInstance | null
  isOpen: boolean
  onClose: () => void
  onEdit?: (instance: ModalInstance) => void
  orgs?: { id: string; name: string }[]
  onChangeOrg?: (instanceId: string, orgId: string) => Promise<void>
}

function CopyableId({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success('Copiado!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <code className="text-xs font-mono text-foreground/80 truncate max-w-[240px]">
          {value || '---'}
        </code>
        {value && (
          <button
            onClick={handleCopy}
            className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
          >
            {copied ? (
              <CheckCircle className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export function DetailsModal({ instance, isOpen, onClose, onEdit, orgs, onChangeOrg }: DetailsModalProps) {
  const [changingOrg, setChangingOrg] = useState(false)
  const [orgSearch, setOrgSearch] = useState('')
  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false)

  if (!instance) return null

  const isConnected = instance.status === 'connected' || instance.status === 'open'
  const providerLabel = getProviderLabel(instance.brokerType)
  const orgName = instance.organization?.name

  const filteredOrgs = orgs
    ? orgs.filter((o) => o.name.toLowerCase().includes(orgSearch.toLowerCase()))
    : []

  const handleOrgChange = async (orgId: string) => {
    if (!onChangeOrg) return
    setOrgPopoverOpen(false)
    setChangingOrg(true)
    try {
      await onChangeOrg(instance.id, orgId)
      toast.success('Organizacao atualizada')
    } catch {
      toast.error('Erro ao alterar organizacao')
    } finally {
      setChangingOrg(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-0">
            <div className="space-y-1 min-w-0">
              <DialogTitle className="text-lg font-semibold tracking-tight truncate">
                {instance.name}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{providerLabel}</span>
                <span className="text-muted-foreground/30">|</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse-dot' : 'bg-red-400'}`} />
                  <span className={`text-xs font-medium ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onEdit && (
                <Button variant="outline" size="sm" onClick={() => onEdit(instance)}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <span className="sr-only">Fechar</span>
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                  <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
                </svg>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* ─── Info Grid ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <InfoItem
              icon={Calendar}
              label="Criado"
              value={formatDistanceToNow(new Date(instance.createdAt), { addSuffix: true, locale: ptBR })}
            />
            <InfoItem
              icon={Clock}
              label="Atualizado"
              value={instance.updatedAt
                ? formatDistanceToNow(new Date(instance.updatedAt), { addSuffix: true, locale: ptBR })
                : 'Nunca'}
            />
            <InfoItem
              icon={Smartphone}
              label="Telefone"
              value={instance.phoneNumber || 'Nao configurado'}
              mono={!!instance.phoneNumber}
            />
            {/* Org — combobox with search if orgs provided, else static */}
            {orgs && orgs.length > 0 && onChangeOrg ? (
              <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Organizacao</span>
                </div>
                <Popover open={orgPopoverOpen} onOpenChange={setOrgPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={changingOrg}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border border-border/40',
                        'bg-background/50 px-3 h-9 text-sm transition-colors',
                        'hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                        'disabled:opacity-50 disabled:pointer-events-none'
                      )}
                    >
                      {changingOrg ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Salvando...
                        </span>
                      ) : (
                        <span className={cn(orgName ? 'text-foreground' : 'text-muted-foreground')}>
                          {orgName || 'Sem organizacao'}
                        </span>
                      )}
                      <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[280px]" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Buscar organizacao..."
                        value={orgSearch}
                        onValueChange={setOrgSearch}
                      />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>Nenhuma organizacao encontrada.</CommandEmpty>
                        <CommandGroup>
                          {filteredOrgs.slice(0, 50).map((org) => (
                            <CommandItem
                              key={org.id}
                              value={org.id}
                              onSelect={() => handleOrgChange(org.id)}
                              className="gap-2"
                            >
                              <Check className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                instance.organization?.id === org.id ? 'opacity-100 text-primary' : 'opacity-0'
                              )} />
                              <span className="truncate">{org.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              <InfoItem
                icon={Building2}
                label="Organizacao"
                value={orgName || 'Sem organizacao'}
              />
            )}
          </div>

          <Separator className="bg-border/40" />

          {/* ─── System IDs ───────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Identificadores
            </p>
            <div className="rounded-lg border border-border/40 bg-muted/20 px-3 divide-y divide-border/30">
              <CopyableId label="ID" value={instance.id} />
              <CopyableId label="Token UAZapi" value={instance.uazapiToken || ''} />
              <CopyableId label="Broker ID" value={instance.brokerId || ''} />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InfoItem({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-sm font-medium truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  )
}
