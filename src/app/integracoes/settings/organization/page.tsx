'use client'

import { Suspense, useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, Palette, Users, Mail, Globe, Plug, Database, MessageSquare } from 'lucide-react'
import { GeneralSettings } from '@/components/organization/GeneralSettings'
import { SessionSettings } from '@/components/organization/SessionSettings'
import { ProviderSettings } from '@/components/organization/ProviderSettings'
import { BrandingSettings } from '@/components/organization/BrandingSettings'
import { TeamSettings } from '@/components/organization/TeamSettings'
import { SMTPSettings } from '@/components/organization/SMTPSettings'
import { DomainSettings } from '@/components/organization/DomainSettings'
import { InfrastructureSettings } from '@/components/organization/InfrastructureSettings'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { PageContainer, PageHeader } from '@/components/layout/page-layout'

function OrganizationSettingsContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentTab = searchParams.get('tab') || 'general'
    const [activeTab, setActiveTab] = useState(currentTab)

    // Sync state with URL
    useEffect(() => {
        setActiveTab(currentTab)
    }, [currentTab])

    const handleTabChange = (value: string) => {
        if (value === 'integrations') return // Handled by Link
        setActiveTab(value)
        router.push(`/integracoes/settings/organization?tab=${value}`)
    }

    return (
        <PageContainer maxWidth="xl">
            <PageHeader
                title="Configurações da Organização"
                description="Gerencie sua organização, branding, equipe e integrações."
                icon={<Building2 className="h-6 w-6 text-primary" />}
            />

            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                <TabsList className="grid w-full grid-cols-9 lg:w-auto lg:inline-grid">
                    <TabsTrigger value="general" className="gap-2">
                        <Building2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Geral</span>
                    </TabsTrigger>
                    <TabsTrigger value="sessions" className="gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span className="hidden sm:inline">Sessões</span>
                    </TabsTrigger>
                    <TabsTrigger value="provider" className="gap-2">
                        <Plug className="h-4 w-4" />
                        <span className="hidden sm:inline">Provider</span>
                    </TabsTrigger>
                    <TabsTrigger value="branding" className="gap-2">
                        <Palette className="h-4 w-4" />
                        <span className="hidden sm:inline">Aparência</span>
                    </TabsTrigger>
                    <TabsTrigger value="team" className="gap-2">
                        <Users className="h-4 w-4" />
                        <span className="hidden sm:inline">Equipe</span>
                    </TabsTrigger>
                    <TabsTrigger value="smtp" className="gap-2">
                        <Mail className="h-4 w-4" />
                        <span className="hidden sm:inline">Email</span>
                    </TabsTrigger>
                    <TabsTrigger value="domain" className="gap-2">
                        <Globe className="h-4 w-4" />
                        <span className="hidden sm:inline">Domínio</span>
                    </TabsTrigger>
                    <TabsTrigger value="integrations" asChild>
                        <Link href="/integracoes/settings/organization/integrations" className="gap-2">
                            <Plug className="h-4 w-4" />
                            <span className="hidden sm:inline">Integrações</span>
                        </Link>
                    </TabsTrigger>
                    <TabsTrigger value="infrastructure" className="gap-2">
                        <Database className="h-4 w-4" />
                        <span className="hidden sm:inline">Infraestrutura</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-4">
                    <GeneralSettings />
                </TabsContent>

                <TabsContent value="sessions" className="space-y-4">
                    <SessionSettings />
                </TabsContent>

                <TabsContent value="provider" className="space-y-4">
                    <ProviderSettings />
                </TabsContent>

                <TabsContent value="branding" className="space-y-4">
                    <BrandingSettings />
                </TabsContent>

                <TabsContent value="team" className="space-y-4">
                    <TeamSettings />
                </TabsContent>

                <TabsContent value="smtp" className="space-y-4">
                    <SMTPSettings />
                </TabsContent>

                <TabsContent value="domain" className="space-y-4">
                    <DomainSettings />
                </TabsContent>

                <TabsContent value="infrastructure" className="space-y-4">
                    <InfrastructureSettings />
                </TabsContent>
            </Tabs>
        </PageContainer>
    )
}

export default function OrganizationSettingsPage() {
    return (
        <Suspense fallback={<div>Carregando...</div>}>
            <OrganizationSettingsContent />
        </Suspense>
    )
}
