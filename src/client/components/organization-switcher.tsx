'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Building2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Button } from '@/client/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/client/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/client/components/ui/popover'
import { api, getAuthHeaders } from '@/igniter.client'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'

export function OrganizationSwitcher() {
  const { user, updateAuth } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [isSwitching, setIsSwitching] = React.useState(false)
  const [organizations, setOrganizations] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  const isSystemAdmin = user?.role === 'admin'

  // Admin: buscar todas as organizações via API
  const { data: adminOrgsData } = useQuery({
    queryKey: ['organizations', 'all-for-switcher'],
    queryFn: async () => {
      const result = await (api['organizations'].list as any).query({
        query: { limit: 100, isActive: true },
        headers: getAuthHeaders(),
      })
      return result.data as { data: any[]; pagination: any }
    },
    enabled: isSystemAdmin && !!user,
  })

  // Sincronizar organizações conforme o tipo de usuário
  React.useEffect(() => {
    if (!user) {
      setIsLoading(false)
      return
    }

    if (isSystemAdmin) {
      // Admin: lista vem da query acima
      if (adminOrgsData) {
        setOrganizations(adminOrgsData.data ?? [])
        setIsLoading(false)
      }
      return
    }

    // Usuário comum: extrair organizações do JWT
    const userOrgs = (user as any).organizations || []
    const orgsData = userOrgs
      .filter((uo: any) => uo.isActive)
      .map((uo: any) => uo.organization)

    setOrganizations(orgsData)
    setIsLoading(false)
  }, [user, isSystemAdmin, adminOrgsData])

  const currentOrg = organizations.find((org: any) => org.id === user?.currentOrgId)

  const handleSwitchOrganization = async (orgId: string) => {
    if (isSwitching || orgId === user?.currentOrgId) {
      setOpen(false)
      return
    }

    setIsSwitching(true)
    try {
      const result = await (api.auth.switchOrganization as any).mutate({
        body: { organizationId: orgId },
        headers: getAuthHeaders(),
      })

      const data = result?.data as { currentOrgId?: string; organizationRole?: string | null } | undefined

      if (data?.currentOrgId) {
        updateAuth({
          ...user,
          currentOrgId: data.currentOrgId,
          organizationRole: data.organizationRole ?? undefined,
        })

        toast.success('Organização alterada com sucesso!')
        window.location.reload()
      } else {
        toast.error('Erro ao trocar organização')
      }
    } catch (error) {
      console.error('Error switching organization:', error)
      toast.error('Erro ao trocar organização')
    } finally {
      setIsSwitching(false)
      setOpen(false)
    }
  }

  // Não mostrar se usuário não está autenticado
  if (!user) {
    return null
  }

  // Não mostrar se tem apenas 1 organização ou nenhuma
  if (organizations.length <= 1) {
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Selecionar organização"
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="truncate">
              {isLoading
                ? 'Carregando...'
                : currentOrg
                ? currentOrg.name
                : 'Selecione uma organização'}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Buscar organização..." />
          <CommandList>
            <CommandEmpty>Nenhuma organização encontrada.</CommandEmpty>
            <CommandGroup heading="Organizações">
              {organizations.map((org: any) => (
                <CommandItem
                  key={org.id}
                  value={org.name}
                  onSelect={() => handleSwitchOrganization(org.id)}
                  className="cursor-pointer"
                  disabled={isSwitching}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  <div className="flex flex-col">
                    <span className="font-medium">{org.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {org.slug}
                    </span>
                  </div>
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      currentOrg?.id === org.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
