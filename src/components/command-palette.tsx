'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import {
  MessageCircle,
  Users,
  Settings,
  Home,
  LayoutDashboard,
  Building2,
  Shield,
  Bell,
  Webhook,
  UserCog,
  Search,
  Moon,
  Sun,
  LogOut,
  FileText,
  HelpCircle,
  Zap,
  BarChart3,
  Phone,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'

interface CommandItem {
  id: string
  title: string
  description?: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  keywords?: string[]
  shortcut?: string
  group: 'navigation' | 'actions' | 'settings' | 'help'
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { setTheme, theme } = useTheme()

  // Navigation items
  const navigationItems: CommandItem[] = [
    {
      id: 'home',
      title: 'Inicio',
      description: 'Ir para a pagina inicial',
      icon: Home,
      action: () => router.push('/'),
      keywords: ['home', 'inicio', 'dashboard'],
      group: 'navigation',
    },
    {
      id: 'integrations',
      title: 'Canais de Comunicacao',
      description: 'Gerenciar conexoes WhatsApp',
      icon: MessageCircle,
      action: () => router.push('/integracoes'),
      keywords: ['whatsapp', 'integracoes', 'canais', 'conexoes'],
      shortcut: 'G I',
      group: 'navigation',
    },
    {
      id: 'dashboard',
      title: 'Dashboard',
      description: 'Ver metricas e analytics',
      icon: BarChart3,
      action: () => router.push('/integracoes/dashboard'),
      keywords: ['dashboard', 'metricas', 'analytics', 'relatorios'],
      group: 'navigation',
    },
    {
      id: 'conversations',
      title: 'Conversas',
      description: 'Ver todas as conversas',
      icon: Phone,
      action: () => router.push('/integracoes/conversations'),
      keywords: ['conversas', 'mensagens', 'chat', 'atendimento'],
      shortcut: 'G C',
      group: 'navigation',
    },
    {
      id: 'contacts',
      title: 'Contatos',
      description: 'Gerenciar contatos',
      icon: Users,
      action: () => router.push('/contatos'),
      keywords: ['contatos', 'clientes', 'pessoas'],
      shortcut: 'G T',
      group: 'navigation',
    },
    {
      id: 'departments',
      title: 'Departamentos',
      description: 'Configurar departamentos',
      icon: Building2,
      action: () => router.push('/configuracoes/departamentos'),
      keywords: ['departamentos', 'setores', 'equipes'],
      group: 'navigation',
    },
    {
      id: 'webhooks',
      title: 'Webhooks',
      description: 'Configurar webhooks',
      icon: Webhook,
      action: () => router.push('/configuracoes/webhooks'),
      keywords: ['webhooks', 'integracao', 'api'],
      group: 'navigation',
    },
    {
      id: 'settings',
      title: 'Configuracoes',
      description: 'Ajustar configuracoes gerais',
      icon: Settings,
      action: () => router.push('/integracoes/settings'),
      keywords: ['configuracoes', 'ajustes', 'preferencias'],
      shortcut: 'G S',
      group: 'navigation',
    },
    {
      id: 'users',
      title: 'Usuarios',
      description: 'Gerenciar usuarios da equipe',
      icon: UserCog,
      action: () => router.push('/integracoes/users'),
      keywords: ['usuarios', 'equipe', 'time', 'membros'],
      group: 'navigation',
    },
  ]

  // Admin items (conditional)
  const adminItems: CommandItem[] = [
    {
      id: 'admin-dashboard',
      title: 'Admin Dashboard',
      description: 'Painel administrativo',
      icon: Shield,
      action: () => router.push('/admin'),
      keywords: ['admin', 'administrador', 'painel'],
      group: 'navigation',
    },
    {
      id: 'admin-organizations',
      title: 'Organizacoes',
      description: 'Gerenciar todas as organizacoes',
      icon: Building2,
      action: () => router.push('/admin/organizations'),
      keywords: ['organizacoes', 'empresas', 'clientes'],
      group: 'navigation',
    },
    {
      id: 'admin-settings',
      title: 'Configuracoes do Sistema',
      description: 'Ajustar configuracoes globais',
      icon: Settings,
      action: () => router.push('/admin/settings'),
      keywords: ['sistema', 'global', 'configuracoes'],
      group: 'navigation',
    },
  ]

  // Action items
  const actionItems: CommandItem[] = [
    {
      id: 'new-connection',
      title: 'Nova Conexao WhatsApp',
      description: 'Conectar novo numero',
      icon: Zap,
      action: () => {
        router.push('/integracoes')
        toast.info('Clique em "Conectar WhatsApp" para iniciar')
      },
      keywords: ['novo', 'conexao', 'whatsapp', 'adicionar'],
      group: 'actions',
    },
    {
      id: 'search-contacts',
      title: 'Buscar Contatos',
      description: 'Pesquisar na lista de contatos',
      icon: Search,
      action: () => router.push('/contatos'),
      keywords: ['buscar', 'pesquisar', 'contatos'],
      group: 'actions',
    },
  ]

  // Settings items
  const settingsItems: CommandItem[] = [
    {
      id: 'theme-light',
      title: 'Tema Claro',
      description: 'Mudar para tema claro',
      icon: Sun,
      action: () => {
        setTheme('light')
        toast.success('Tema alterado para claro')
      },
      keywords: ['tema', 'claro', 'light', 'branco'],
      group: 'settings',
    },
    {
      id: 'theme-dark',
      title: 'Tema Escuro',
      description: 'Mudar para tema escuro',
      icon: Moon,
      action: () => {
        setTheme('dark')
        toast.success('Tema alterado para escuro')
      },
      keywords: ['tema', 'escuro', 'dark', 'preto'],
      group: 'settings',
    },
    {
      id: 'notifications',
      title: 'Notificacoes',
      description: 'Configurar notificacoes',
      icon: Bell,
      action: () => router.push('/integracoes/settings'),
      keywords: ['notificacoes', 'alertas', 'avisos'],
      group: 'settings',
    },
  ]

  // Help items
  const helpItems: CommandItem[] = [
    {
      id: 'documentation',
      title: 'Documentacao',
      description: 'Abrir documentacao',
      icon: FileText,
      action: () => window.open('https://docs.quayer.com', '_blank'),
      keywords: ['documentacao', 'docs', 'ajuda', 'manual'],
      group: 'help',
    },
    {
      id: 'support',
      title: 'Suporte',
      description: 'Entrar em contato com suporte',
      icon: HelpCircle,
      action: () => window.open('mailto:suporte@quayer.com', '_blank'),
      keywords: ['suporte', 'ajuda', 'contato'],
      group: 'help',
    },
    {
      id: 'logout',
      title: 'Sair',
      description: 'Encerrar sessao',
      icon: LogOut,
      action: () => router.push('/login'),
      keywords: ['sair', 'logout', 'desconectar'],
      group: 'help',
    },
  ]

  // Combine all items
  const allItems = [...navigationItems, ...adminItems, ...actionItems, ...settingsItems, ...helpItems]

  // Handle keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Digite um comando ou pesquise..." />
      <CommandList>
        <CommandEmpty>
          <div className="py-6 text-center text-sm">
            <Search className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="font-medium">Nenhum resultado encontrado</p>
            <p className="text-muted-foreground">Tente buscar por outra palavra</p>
          </div>
        </CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navegacao">
          {navigationItems.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.title} ${item.keywords?.join(' ')}`}
              onSelect={() => runCommand(item.action)}
              className="cursor-pointer"
            >
              <item.icon className="mr-2 h-4 w-4" />
              <div className="flex-1">
                <span>{item.title}</span>
                {item.description && (
                  <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                    {item.description}
                  </span>
                )}
              </div>
              {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Admin */}
        <CommandGroup heading="Administracao">
          {adminItems.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.title} ${item.keywords?.join(' ')}`}
              onSelect={() => runCommand(item.action)}
              className="cursor-pointer"
            >
              <item.icon className="mr-2 h-4 w-4" />
              <div className="flex-1">
                <span>{item.title}</span>
                {item.description && (
                  <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                    {item.description}
                  </span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Actions */}
        <CommandGroup heading="Acoes Rapidas">
          {actionItems.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.title} ${item.keywords?.join(' ')}`}
              onSelect={() => runCommand(item.action)}
              className="cursor-pointer"
            >
              <item.icon className="mr-2 h-4 w-4" />
              <div className="flex-1">
                <span>{item.title}</span>
                {item.description && (
                  <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                    {item.description}
                  </span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Settings */}
        <CommandGroup heading="Configuracoes">
          {settingsItems.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.title} ${item.keywords?.join(' ')}`}
              onSelect={() => runCommand(item.action)}
              className="cursor-pointer"
            >
              <item.icon className="mr-2 h-4 w-4" />
              <div className="flex-1">
                <span>{item.title}</span>
                {item.description && (
                  <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                    {item.description}
                  </span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Help */}
        <CommandGroup heading="Ajuda">
          {helpItems.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.title} ${item.keywords?.join(' ')}`}
              onSelect={() => runCommand(item.action)}
              className="cursor-pointer"
            >
              <item.icon className="mr-2 h-4 w-4" />
              <div className="flex-1">
                <span>{item.title}</span>
                {item.description && (
                  <span className="ml-2 text-xs text-muted-foreground hidden sm:inline">
                    {item.description}
                  </span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>

      {/* Footer with shortcut hint */}
      <div className="border-t px-4 py-3 text-xs text-muted-foreground flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              <span className="text-xs">↑</span>
            </kbd>
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              <span className="text-xs">↓</span>
            </kbd>
            navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              Enter
            </kbd>
            selecionar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
              Esc
            </kbd>
            fechar
          </span>
        </div>
      </div>
    </CommandDialog>
  )
}
