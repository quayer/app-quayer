'use client'

/**
 * ContaClient — orquestrador fino da página /conta. Cada tab vive em
 * `./tabs/*` (extração estrutural, comportamento e visual idênticos); aqui
 * fica só a navegação por Tabs sincronizada com o query param `?tab=`.
 */

import { useSearchParams, useRouter } from 'next/navigation'
import {
  User as UserIcon,
  Bell,
  MonitorSmartphone,
  ShieldCheck,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/client/components/ui/tabs'

import { PerfilTab } from './tabs/perfil-tab'
import { SessoesTab } from './tabs/sessoes-tab'
import { NotificacoesTab } from './tabs/notificacoes-tab'
import { SegurancaTab } from './tabs/seguranca-tab'

// ============================================================================
// Page wrapper
// ============================================================================

export function ContaClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const validTabs = ['perfil', 'sessoes', 'notificacoes', 'seguranca']
  const defaultTab = validTabs.includes(tabParam ?? '') ? (tabParam as string) : 'perfil'

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'perfil') {
      params.delete('tab')
    } else {
      params.set('tab', value)
    }
    router.replace(`/conta${params.toString() ? '?' + params.toString() : ''}`, { scroll: false })
  }

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Minha Conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie suas informações pessoais, acesso e notificações.
        </p>
      </div>

      <Tabs value={defaultTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="perfil" className="flex-1 gap-2">
            <UserIcon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Perfil</span>
          </TabsTrigger>
          <TabsTrigger value="sessoes" className="flex-1 gap-2">
            <MonitorSmartphone className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Sessões e acesso</span>
          </TabsTrigger>
          <TabsTrigger value="notificacoes" className="flex-1 gap-2">
            <Bell className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="flex-1 gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Segurança</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="mt-6">
          <PerfilTab />
        </TabsContent>
        <TabsContent value="sessoes" className="mt-6">
          <SessoesTab />
        </TabsContent>
        <TabsContent value="notificacoes" className="mt-6">
          <NotificacoesTab />
        </TabsContent>
        <TabsContent value="seguranca" className="mt-6">
          <SegurancaTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
