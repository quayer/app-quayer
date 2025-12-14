"use client"

import {
  ChevronsUpDown,
  LogOut,
  Building2,
  Search,
  Settings,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useOrganizations, useSwitchOrganization, useCurrentOrganization } from "@/hooks/useOrganization"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
    organizationId?: string
    role?: string
    isAdmin?: boolean
  }
}) {
  const { isMobile } = useSidebar()
  const router = useRouter()
  const [isOrgSwitcherOpen, setIsOrgSwitcherOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  // Fetch organizations and current org (only for admins)
  const { data: organizationsData } = useOrganizations()
  const { data: currentOrgData } = useCurrentOrganization()
  const switchOrganization = useSwitchOrganization()

  // ✅ CORREÇÃO BRUTAL: Tratar caso onde organizations é undefined ou não é array
  const organizations = Array.isArray(organizationsData?.data?.data) 
    ? organizationsData.data.data 
    : []
  
  const currentOrg = (currentOrgData as any)?.data?.name || (currentOrgData as any)?.name || "Sem Organização"

  const filteredOrgs = organizations.filter((org: any) =>
    org?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    router.push('/login')
    router.refresh()
  }

  const handleSwitchOrg = (orgId: string) => {
    switchOrganization.mutate(orgId)
    setIsOrgSwitcherOpen(false)
    setSearchTerm("")
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              {/* Organization Switcher (Admin Only) */}
              {user.isAdmin && (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Contexto Administrativo
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setIsOrgSwitcherOpen(true)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <span className="truncate">{currentOrg}</span>
                    </div>
                    <Search className="h-3 w-3 text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}

              {/* Configurações (Todos os usuários) */}
              <DropdownMenuItem onClick={() => router.push('/integracoes/settings')}>
                <Settings />
                Configurações
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {/* Organization Switcher Modal */}
      <Dialog open={isOrgSwitcherOpen} onOpenChange={setIsOrgSwitcherOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar Organização</DialogTitle>
            <DialogDescription>
              Selecione uma organização para visualizar como administrador
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar organização..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {filteredOrgs.map((org: any) => (
                <Button
                  key={org.id}
                  variant={user.organizationId === org.id ? "secondary" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => handleSwitchOrg(org.id)}
                  disabled={switchOrganization.isPending}
                >
                  <Building2 className="mr-2 h-4 w-4" />
                  {org.name}
                  {user.organizationId === org.id && (
                    <Badge variant="outline" className="ml-auto">Atual</Badge>
                  )}
                </Button>
              ))}
              {filteredOrgs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma organização encontrada
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarMenu>
  )
}
