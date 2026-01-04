"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

// Helper to ensure string safety for React rendering
function safeString(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return String(obj?.name ?? obj?.title ?? obj?.label ?? '')
  }
  return String(value)
}

export function NavMain({
  items,
  label = "Platform",
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
  label?: string | null
}) {
  // Ensure label is always a safe string
  const safeLabel = label ? safeString(label) : null

  return (
    <SidebarGroup>
      {safeLabel && <SidebarGroupLabel>{safeLabel}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const itemTitle = safeString(item.title)
          return (
            <Collapsible key={itemTitle} asChild defaultOpen={item.isActive}>
              <SidebarMenuItem>
                {/* Container para manter botão e ação alinhados */}
                <div className="relative flex items-center">
                  <SidebarMenuButton asChild tooltip={itemTitle} className="flex-1">
                    <a href={item.url}>
                      <item.icon />
                      <span>{itemTitle}</span>
                    </a>
                  </SidebarMenuButton>
                  {item.items?.length ? (
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction className="data-[state=open]:rotate-90 relative top-0 translate-y-0 right-0">
                        <ChevronRight />
                        <span className="sr-only">Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                  ) : null}
                </div>
                {item.items?.length ? (
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => {
                        const subItemTitle = safeString(subItem.title)
                        return (
                          <SidebarMenuSubItem key={subItemTitle}>
                            <SidebarMenuSubButton asChild>
                              <a href={subItem.url}>
                                <span>{subItemTitle}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
