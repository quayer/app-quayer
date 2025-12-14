'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, Building2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { api } from '@/igniter.client'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'

export function OrganizationSwitcher() {
  const { user, updateAuth } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [isSwitching, setIsSwitching] = React.useState(false)
  const [organizations, setOrganizations] = React.useState<any[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  // Buscar organizações do usuário (apenas para não-admin)
  React.useEffect(() => {
    // Admin não usa switcher
    if (!user || user.role === 'admin') {
      setIsLoading(false)
      return
    }

    // Extrair organizações do usuário autenticado
    const userOrgs = (user as any).organizations || []
    const orgsData = userOrgs
      .filter((uo: any) => uo.isActive)
      .map((uo: any) => uo.organization)

    setOrganizations(orgsData)
    setIsLoading(false)
  }, [user])

  const currentOrg = organizations.find((org: any) => org.id === user?.currentOrgId)

  const handleSwitchOrganization = async (orgId: string) => {
    if (isSwitching || orgId === user?.currentOrgId) {
      setOpen(false)
      return
    }

    setIsSwitching(true)
    try {
      const result = await api.auth.switchOrganization.mutate({
        body: { organizationId: orgId },
      })

      const data = result.data as any
      if (data && !data.error) {
        // Atualizar token e contexto do usuário
        if (data.accessToken) {
          document.cookie = `accessToken=${data.accessToken}; path=/; max-age=900; SameSite=Lax`
        }

        // Atualizar estado do usuário
        updateAuth({
          ...user,
          currentOrgId: data.currentOrgId,
          organizationRole: data.organizationRole,
        })

        toast.success('Organização alterada com sucesso!')

        // Recarregar página para atualizar dados
        window.location.reload()
      } else {
        toast.error(data?.error || (result as any).error?.message || 'Erro ao trocar organização')
      }
    } catch (error) {
      console.error('Error switching organization:', error)
      toast.error('Erro ao trocar organização')
    } finally {
      setIsSwitching(false)
      setOpen(false)
    }
  }

  // Não mostrar para admin (ele tem acesso global)
  if (!user || user.role === 'admin') {
    return null
  }

  // Não mostrar se usuário tem apenas 1 organização ou nenhuma
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
