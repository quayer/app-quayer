"use client"

import * as React from "react"
import Image from "next/image"
import {
  Settings2,
  MessagesSquare,
  Building2,
  Plug,
  Shield,
  ShieldCheck,
  Wrench,
  Bot,
  FileText,
  Megaphone,
  PenTool,
} from "lucide-react"

import { NavMain } from "@/client/components/nav-main"
import { NavProjects } from "@/client/components/nav-projects"
import { NavSecondary } from "@/client/components/nav-secondary"
import { NavUser } from "@/client/components/nav-user"
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
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-provider"
import { useCurrentOrganization } from "@/client/hooks/useOrganization"
import { usePresence } from "@/client/hooks/useSocket"
import { OnlineCount } from "@/client/components/chat/PresenceBadge"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()
  const pathname = usePathname()
  const { data: currentOrgData } = useCurrentOrganization()
  const { onlineUsers } = usePresence()

  const isSystemAdmin = user?.role === 'admin'
  const orgRole = user?.organizationRole || 'user'
  const selectedOrgName = (currentOrgData as any)?.name || (currentOrgData as any)?.data?.name || null

  const data = React.useMemo(() => {
    if (!user) {
      return {
        user: { name: '', email: '', avatar: '/avatars/user.jpg', role: undefined, isAdmin: false },
        adminMenu: [],
        mainMenu: [],
        settingsMenu: [],
        selectedOrgName: null,
        navSecondary: [],
        projects: [],
      }
    }

    const adminMenu = isSystemAdmin ? [
      {
        title: "Administração",
        url: "/admin",
        icon: ShieldCheck,
        isActive: pathname?.startsWith('/admin'),
        items: [
          { title: "Dashboard",      url: "/admin" },
          { title: "Organizações",   url: "/admin/organizations" },
          { title: "Conexões",       url: "/admin/integracoes" },
          { title: "Sessões",        url: "/admin/sessions" },
          { title: "Convites",       url: "/admin/invitations" },
          { title: "Notificações",   url: "/admin/notificacoes" },
          { title: "Auditoria",      url: "/admin/audit" },
          { title: "Cobrança",       url: "/admin/billing" },
          { title: "Segurança",      url: "/admin/security" },
          { title: "Configurações",  url: "/admin/settings" },
        ],
      },
    ] : [];

    const hasOrganization = user?.currentOrgId !== null
    const isOrgMember = (isSystemAdmin && hasOrganization) || orgRole === 'master' || orgRole === 'manager' || orgRole === 'user'

    // ── Principal ────────────────────────────────────────────────────────
    const mainMenu = isOrgMember ? [
      { title: "Conversas",   url: "/conversas",    icon: MessagesSquare },
      { title: "Conexões",    url: "/integracoes",  icon: Plug },
      { title: "Agentes IA",  url: "/integracoes/agents", icon: Bot },
      { title: "Templates",   url: "/integracoes/settings/templates", icon: FileText },
      { title: "Campanhas",   url: "/integracoes/settings/campaigns", icon: Megaphone },
      { title: "Ferramentas", url: "/ferramentas",  icon: Wrench },
      { title: "Quadros",     url: "/quadros",      icon: PenTool },
    ] : []

    // ── Configurações ────────────────────────────────────────────────────
    const isOrgAdmin = orgRole === 'master' || orgRole === 'manager' || isSystemAdmin
    const settingsMenu = isOrgMember ? [
      {
        title: "Configurações",
        url: "/integracoes/settings",
        icon: Settings2,
        ...(isOrgAdmin ? {
          items: [
            { title: "Organização",  url: "/integracoes/settings/organization" },
            { title: "Cobrança",     url: "/integracoes/settings/billing" },
            { title: "Roles",        url: "/integracoes/settings/roles" },
            { title: "Domínios",     url: "/integracoes/settings/domains" },
            { title: "SCIM",         url: "/integracoes/settings/scim" },
          ],
        } : {}),
      },
      { title: "Segurança", url: "/user/seguranca", icon: Shield },
    ] : []

    return {
      user: {
        name: user?.name || "Usuário",
        email: user?.email || "",
        avatar: "/avatars/user.jpg",
        organizationId: user?.organizationId,
        role: user?.role,
        isAdmin: isSystemAdmin,
      },
      adminMenu,
      mainMenu,
      settingsMenu,
      selectedOrgName: isSystemAdmin ? selectedOrgName : null,
      navSecondary: [],
      projects: [],
    }
  }, [user, isSystemAdmin, orgRole, selectedOrgName, pathname])

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

        {/* Main */}
        {data.mainMenu.length > 0 && (
          <NavMain items={data.mainMenu} />
        )}

        {/* Configurações */}
        {data.settingsMenu.length > 0 && (
          <>
            <SidebarSeparator className="my-1" />
            <NavMain label="Configurações" items={data.settingsMenu} />
          </>
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
