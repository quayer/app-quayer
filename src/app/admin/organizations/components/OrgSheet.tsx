'use client'

import { useEffect, useState } from 'react'
import { Plug, Webhook } from 'lucide-react'
import { UserManageModal } from './UserManageModal'
import { listOrgMembersAction, listOrgInstancesAction, listOrgWebhooksAction, type OrgMember, type OrgInstance, type OrgWebhook } from '../../actions'
import type { Organization } from '../page'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface OrgSheetProps {
  org: Organization | null
  open: boolean
  onOpenChange: (open: boolean) => void
  allOrganizations: Organization[]
}

const ORG_ROLE_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  master: { label: 'Master', variant: 'default' },
  manager: { label: 'Gerente', variant: 'secondary' },
  user: { label: 'Usuário', variant: 'outline' },
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function OrgSheet({ org, open, onOpenChange, allOrganizations }: OrgSheetProps) {
  const [members, setMembers] = useState<OrgMember[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [managingMember, setManagingMember] = useState<OrgMember | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const [instances, setInstances] = useState<OrgInstance[]>([])
  const [isLoadingInstances, setIsLoadingInstances] = useState(false)

  const [webhooks, setWebhooks] = useState<OrgWebhook[]>([])
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false)

  useEffect(() => {
    if (open && org) {
      loadMembers(org.id)
      loadInstances(org.id)
      loadWebhooks(org.id)
    }
  }, [open, org])

  const loadMembers = async (organizationId: string) => {
    setIsLoading(true)
    try {
      const result = await listOrgMembersAction(organizationId)
      if (result.success) setMembers(result.data)
    } finally {
      setIsLoading(false)
    }
  }

  const loadInstances = async (organizationId: string) => {
    setIsLoadingInstances(true)
    try {
      const result = await listOrgInstancesAction(organizationId)
      if (result.success) setInstances(result.data)
    } finally {
      setIsLoadingInstances(false)
    }
  }

  const loadWebhooks = async (organizationId: string) => {
    setIsLoadingWebhooks(true)
    try {
      const result = await listOrgWebhooksAction(organizationId)
      if (result.success) setWebhooks(result.data)
    } finally {
      setIsLoadingWebhooks(false)
    }
  }

  const handleManage = (member: OrgMember) => {
    setManagingMember(member)
    setModalOpen(true)
  }

  const handleModalSaved = () => {
    if (org) loadMembers(org.id)
  }

  if (!org) return null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] flex flex-col">
          <SheetHeader>
            <SheetTitle>{org.name}</SheetTitle>
            <SheetDescription className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{org.type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
              <Badge variant="outline">{org.billingType.toUpperCase()}</Badge>
              <Badge variant={org.isActive ? 'default' : 'secondary'}>
                {org.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="users" className="flex-1 flex flex-col mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="users" className="text-xs">Usuários ({members.length})</TabsTrigger>
              <TabsTrigger value="instances" className="text-xs">Instâncias ({instances.length})</TabsTrigger>
              <TabsTrigger value="webhooks" className="text-xs">Webhooks ({webhooks.length})</TabsTrigger>
              <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
            </TabsList>

            <TabsContent value="users" className="flex-1 mt-4 space-y-3">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))
              ) : members.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum usuário nesta organização
                </div>
              ) : (
                members.map((member) => {
                  const roleConfig = ORG_ROLE_CONFIG[member.role] ?? { label: member.role, variant: 'outline' as const }
                  return (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="text-xs">
                          {initials(member.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.user.email}</p>
                      </div>
                      <Badge variant={roleConfig.variant} className="shrink-0 text-xs">
                        {roleConfig.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs h-7"
                        onClick={() => handleManage(member)}
                      >
                        Gerenciar
                      </Button>
                    </div>
                  )
                })
              )}
            </TabsContent>

            <TabsContent value="instances" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                {instances.length} / {org.maxInstances} instâncias usadas
              </p>
              {isLoadingInstances ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))
              ) : instances.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhuma instância configurada nesta organização
                </div>
              ) : (
                instances.map((instance) => (
                  <div
                    key={instance.id}
                    className="flex items-center gap-3 p-3 rounded-lg border"
                  >
                    <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{instance.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {instance.phoneNumber || '—'}
                      </p>
                    </div>
                    <Badge
                      variant={instance.status === 'connected' ? 'default' : 'secondary'}
                      className="shrink-0 text-xs"
                    >
                      {instance.status === 'connected' ? 'Conectado' : 'Desconectado'}
                    </Badge>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="webhooks" className="mt-4 space-y-3">
              {isLoadingWebhooks ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))
              ) : webhooks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum webhook configurado nesta organização
                </div>
              ) : (
                webhooks.map((wh) => (
                  <div key={wh.id} className="flex items-start gap-3 p-3 rounded-lg border">
                    <Webhook className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate">{wh.url}</p>
                      <div className="flex flex-wrap gap-1">
                        {wh.events.slice(0, 2).map((ev) => (
                          <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>
                        ))}
                        {wh.events.length > 2 && (
                          <Badge variant="outline" className="text-xs">+{wh.events.length - 2}</Badge>
                        )}
                      </div>
                      {wh.instanceName && (
                        <p className="text-xs text-muted-foreground">Instância: {wh.instanceName}</p>
                      )}
                    </div>
                    <Badge
                      variant={wh.isActive ? 'default' : 'secondary'}
                      className="shrink-0 text-xs"
                    >
                      {wh.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="info" className="mt-4 space-y-4">
              <div className="rounded-lg border p-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Limite de instâncias</span>
                  <span className="font-medium">{org.maxInstances}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Limite de usuários</span>
                  <span className="font-medium">{org.maxUsers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plano</span>
                  <Badge>{org.billingType.toUpperCase()}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={org.isActive ? 'default' : 'secondary'}>
                    {org.isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <UserManageModal
        member={managingMember}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSaved={handleModalSaved}
        allOrganizations={allOrganizations}
      />
    </>
  )
}
