'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const SidebarContext = React.createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: true,
  setOpen: () => {},
})

const SidebarProvider = ({ children, defaultOpen = true, className, style }: { children: React.ReactNode; defaultOpen?: boolean; className?: string; style?: React.CSSProperties }) => {
  const [open, setOpen] = React.useState(defaultOpen)
  return (
    <SidebarContext.Provider value={{ open, setOpen }}>
      <div className={cn('group/sidebar-wrapper flex min-h-svh w-full', className)} style={style}>
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

const useSidebar = () => React.useContext(SidebarContext)

const Sidebar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex h-full flex-col border-r bg-sidebar text-sidebar-foreground', className)} {...props} />
  )
)
Sidebar.displayName = 'Sidebar'

const SidebarHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col gap-2 p-2', className)} {...props} />
)
SidebarHeader.displayName = 'SidebarHeader'

const SidebarContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto', className)} {...props} />
)
SidebarContent.displayName = 'SidebarContent'

const SidebarFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col gap-2 p-2', className)} {...props} />
)
SidebarFooter.displayName = 'SidebarFooter'

const SidebarGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('relative flex w-full min-w-0 flex-col p-2', className)} {...props} />
)
SidebarGroup.displayName = 'SidebarGroup'

const SidebarGroupLabel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none', className)} {...props} />
  )
)
SidebarGroupLabel.displayName = 'SidebarGroupLabel'

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('w-full text-sm', className)} {...props} />
)
SidebarGroupContent.displayName = 'SidebarGroupContent'

const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  ({ className, ...props }, ref) => <ul ref={ref} className={cn('flex w-full min-w-0 flex-col gap-1', className)} {...props} />
)
SidebarMenu.displayName = 'SidebarMenu'

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.HTMLAttributes<HTMLLIElement>>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn('group/menu-item relative', className)} {...props} />
)
SidebarMenuItem.displayName = 'SidebarMenuItem'

const SidebarMenuButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean; asChild?: boolean }>(
  ({ className, isActive, ...props }, ref) => (
    <button
      ref={ref}
      data-active={isActive}
      className={cn('peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground', className)}
      {...props}
    />
  )
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, onClick, ...props }, ref) => {
    const { open, setOpen } = useSidebar()
    return (
      <button
        ref={ref}
        onClick={(e) => { setOpen(!open); onClick?.(e) }}
        className={cn('inline-flex h-7 w-7 items-center justify-center', className)}
        {...props}
      />
    )
  }
)
SidebarTrigger.displayName = 'SidebarTrigger'

const SidebarInset = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <main ref={ref} className={cn('relative flex min-h-svh flex-1 flex-col bg-background', className)} {...props} />
)
SidebarInset.displayName = 'SidebarInset'

export { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar }
