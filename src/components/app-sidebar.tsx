"use client"

import * as React from "react"
import Image from "next/image"
import {
  LayoutDashboard,
  Users,
  Settings2,
  MessagesSquare,
  Building2,
  Plug,
  Webhook,
  ShieldCheck,
  FileText,
  Shield,
  UserCog,
  Mail,
  Bell,
  Wrench,
  Eye,
  ClipboardList,
  X,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth/auth-provider"
import { useCurrentOrganization, useClearOrganizationContext } from "@/hooks/useOrganization"
import { Button } from "@/components/ui/button"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const { data: currentOrgData } = useCurrentOrganization()
  const clearContext = useClearOrganizationContext()

  // Determine effective role for navigation
  const isSystemAdmin = user?.role === 'admin'
  const orgRole = (user as any)?.organizationRole || 'user'

  // ✅ CORREÇÃO BRUTAL: Buscar nome da organização atual via getCurrent
  const selectedOrgName = (currentOrgData as any)?.data?.name || (currentOrgData as any)?.name || null

  const data = React.useMemo(() => {
    const adminMenu = isSystemAdmin ? [{
      title: "Administração",
      url: "/admin",
      icon: Shield,
      isActive: true,
      items: [
        {
          title: "Dashboard Admin",
          url: "/admin",
          icon: LayoutDashboard,
        },
        {
          title: "Organizações",
          url: "/admin/organizations",
          icon: Building2,
        },
        {
          title: "Clientes",
          url: "/admin/clients",
          icon: Users,
        },
        {
          title: "Mensagens",
          url: "/admin/messages",
          icon: Mail,
        },
        {
          title: "Integrações",
          url: "/admin/integracoes",
          icon: Plug,
        },
        {
          title: "Webhooks",
          url: "/admin/webhooks",
          icon: Webhook,
        },
        {
          title: "Logs Técnicos",
          url: "/admin/logs",
          icon: FileText,
        },
        {
          title: "Audit Log",
          url: "/admin/audit",
          icon: ClipboardList,
        },
        {
          title: "Permissões",
          url: "/admin/permissions",
          icon: ShieldCheck,
        },
        {
          title: "Notificações",
          url: "/admin/notificacoes",
          icon: Bell,
        },
        {
          title: "Configurações",
          url: "/admin/settings",
          icon: Settings2,
        },
      ],
    }] : [];

    // ✅ CORREÇÃO BRUTAL: Organization menu apenas quando admin TEM organização
    // Se admin não tem org (onboarding), não mostrar menu de organização
    const hasOrganization = user?.currentOrgId !== null

    const orgMenu = ((isSystemAdmin && hasOrganization) || orgRole === 'master' || orgRole === 'manager') ? [
      {
        title: "Dashboard",
        url: "/integracoes/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Canais",
        url: "/integracoes",
        icon: Plug,
      },
      {
        title: "Conversas",
        url: "/conversas",
        icon: MessagesSquare,
      },
      {
        title: "Contatos",
        url: "/contatos",
        icon: UserCog,
      },
      {
        title: "Equipe",
        url: "/integracoes/users",
        icon: Users,
      },
      {
        title: "Webhooks",
        url: "/configuracoes/webhooks",
        icon: Webhook,
      },
      {
        title: "Ferramentas",
        url: "/ferramentas",
        icon: Wrench,
      },
      {
        title: "Configurações",
        url: "/integracoes/settings",
        icon: Settings2,
      },
    ] : [];

    // User menu (simplified) - AGORA INCLUI CONFIGURAÇÕES
    const userMenu = (!isSystemAdmin && orgRole === 'user') ? [
      {
        title: "Canais",
        url: "/integracoes",
        icon: Plug,
      },
      {
        title: "Conversas",
        url: "/conversas",
        icon: MessagesSquare,
      },
      {
        title: "Contatos",
        url: "/contatos",
        icon: Users,
      },
      {
        title: "Configurações",
        url: "/integracoes/settings",
        icon: Settings2,
      },
    ] : [];

    return {
      user: {
        name: user?.name || "Usuário",
        email: user?.email || "",
        avatar: "/avatars/user.jpg",
        organizationId: (user as any)?.organizationId,
        role: user?.role,
        isAdmin: isSystemAdmin,
      },
      adminMenu,
      orgMenu,
      userMenu,
      selectedOrgName: isSystemAdmin ? selectedOrgName : null,
      navSecondary: [],
      projects: [],
    }
  }, [user, isSystemAdmin, orgRole, selectedOrgName])

  return (
    <Sidebar variant="inset" data-sidebar="sidebar" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href={isSystemAdmin ? "/admin" : "/integracoes"} className="flex items-center gap-2">
                <Image
                  src="/logo.svg"
                  alt="Quayer"
                  width={120}
                  height={28}
                  priority
                  className="dark:invert-0"
                />
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Context Switch Indicator - Shows when admin is viewing an organization */}
        {isSystemAdmin && selectedOrgName && (
          <div className="mx-2 mt-2 p-2.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-700 dark:text-amber-400 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold min-w-0">
                <Eye className="h-4 w-4 shrink-0 animate-pulse" />
                <span className="truncate">{selectedOrgName}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 hover:bg-amber-500/30 text-amber-700 dark:text-amber-400"
                onClick={() => clearContext.mutate()}
                disabled={clearContext.isPending}
                title="Sair do contexto"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-amber-600/80 dark:text-amber-400/70 mt-1 ml-6">
              Ações afetam esta organização
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2 h-7 text-[11px] border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 hover:text-amber-800 dark:hover:text-amber-300"
              onClick={() => clearContext.mutate()}
              disabled={clearContext.isPending}
            >
              {clearContext.isPending ? 'Saindo...' : 'Sair do contexto'}
            </Button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {/* Admin Global Menu */}
        {data.adminMenu.length > 0 && (
          <NavMain items={data.adminMenu} label={null} />
        )}

        {/* Separator between admin and org menus */}
        {data.adminMenu.length > 0 && data.orgMenu.length > 0 && (
          <SidebarSeparator className="my-2" />
        )}

        {/* Organization Menu (for admin viewing as org, or master/manager) */}
        {data.orgMenu.length > 0 && (
          <NavMain
            items={data.orgMenu}
            label={data.selectedOrgName || "Organização"}
          />
        )}

        {/* User Menu (simplified) */}
        {data.userMenu.length > 0 && (
          <NavMain items={data.userMenu} label={null} />
        )}

        {data.projects.length > 0 && <NavProjects projects={data.projects} />}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
