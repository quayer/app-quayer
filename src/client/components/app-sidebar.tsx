"use client"

import * as React from "react"
import Image from "next/image"
import {
  LayoutDashboard,
  Settings2,
  MessagesSquare,
  Building2,
  Plug,
  Shield,
  MonitorPlay,
  Settings,
  FileText,
  Bell,
  Mail,
  ShieldCheck,
  Globe,
  Key,
} from "lucide-react"

import { NavMain } from "@/client/components/nav-main"
import { NavProjects } from "@/client/components/nav-projects"
import { NavSecondary } from "@/client/components/nav-secondary"
import { NavUser } from "@/client/components/nav-user"
import { OrganizationSwitcher } from "@/client/components/organization-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/client/components/ui/sidebar"
import { useAuth } from "@/lib/auth/auth-provider"
import { useCurrentOrganization } from "@/client/hooks/useOrganization"
import { usePresence } from "@/client/hooks/useSocket"
import { OnlineCount } from "@/client/components/chat/PresenceBadge"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const { data: currentOrgData } = useCurrentOrganization()
  const { onlineUsers } = usePresence()

  // Determine effective role for navigation
  const isSystemAdmin = user?.role === 'admin'
  const orgRole = (user as any)?.organizationRole || 'user'

  // ✅ CORREÇÃO BRUTAL: Buscar nome da organização atual via getCurrent
  const selectedOrgName = currentOrgData?.name || null

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
          title: "Integrações",
          url: "/admin/integracoes",
          icon: Plug,
        },
        {
          title: "Sessões",
          url: "/admin/sessions",
          icon: MonitorPlay,
        },
        {
          title: "Convites",
          url: "/admin/invitations",
          icon: Mail,
        },
        {
          title: "Notificações",
          url: "/admin/notificacoes",
          icon: Bell,
        },
        {
          title: "Auditoria",
          url: "/admin/audit",
          icon: FileText,
        },
        {
          title: "Segurança",
          url: "/admin/security",
          icon: Shield,
        },
        {
          title: "Roles",
          url: "/admin/roles",
          icon: ShieldCheck,
        },
        {
          title: "Dominios",
          url: "/admin/domains",
          icon: Globe,
        },
        {
          title: "SCIM",
          url: "/admin/scim",
          icon: Key,
        },
        {
          title: "Configurações",
          url: "/admin/settings",
          icon: Settings,
        },
      ],
    }] : [];

    // ✅ CORREÇÃO BRUTAL: Organization menu apenas quando admin TEM organização
    // Se admin não tem org (onboarding), não mostrar menu de organização
    const hasOrganization = user?.currentOrgId !== null
    
    const orgMenu = ((isSystemAdmin && hasOrganization) || orgRole === 'master' || orgRole === 'manager') ? [
      {
        title: "Integrações",
        url: "/integracoes",
        icon: Plug,
      },
      {
        title: "Conversas",
        url: "/conversas",
        icon: MessagesSquare,
      },
      {
        title: "Segurança",
        url: "/user/seguranca",
        icon: Shield,
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
        title: "Minhas Integrações",
        url: "/integracoes",
        icon: Plug,
      },
      {
        title: "Conversas",
        url: "/conversas",
        icon: MessagesSquare,
      },
      {
        title: "Segurança",
        url: "/user/seguranca",
        icon: Shield,
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
      </SidebarHeader>

      <SidebarContent>
        {/* Admin Global Menu */}
        {data.adminMenu.length > 0 && (
          <>
            <NavMain items={data.adminMenu} />

            {/* Separator with organization name */}
            {data.selectedOrgName && (
              <>
                <SidebarSeparator className="my-2" />
                <div className="px-4 py-2 flex items-center gap-2">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {data.selectedOrgName}
                  </p>
                </div>
              </>
            )}
          </>
        )}

        {/* Organization Menu (for admin viewing as org, or master/manager) */}
        {data.orgMenu.length > 0 && (
          <NavMain items={data.orgMenu} />
        )}

        {/* User Menu (simplified) */}
        {data.userMenu.length > 0 && (
          <NavMain items={data.userMenu} />
        )}

        {data.projects.length > 0 && <NavProjects projects={data.projects} />}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>

      <SidebarFooter>
        <OnlineCount count={onlineUsers.size} className="px-3 pb-1" />
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
