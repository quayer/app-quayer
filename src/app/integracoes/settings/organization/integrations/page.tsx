'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Plug, CheckCircle2 } from 'lucide-react'
import { IntegrationProviderCard } from '@/components/organization/IntegrationProviderCard'

// Model Providers
const MODEL_PROVIDERS = [
    { id: 'openai', name: 'OpenAI', description: 'State-of-the-art GPT and o-series models', logo: 'O', connected: true, managedByQuayer: true },
    { id: 'anthropic', name: 'Anthropic', description: 'Claude series models focused on safe, helpful AI.', logo: 'A', connected: false, managedByQuayer: false },
    { id: 'google', name: 'Google', description: 'Gemini series models for rich AI understanding.', logo: 'G', connected: false, managedByQuayer: false },
    { id: 'openrouter', name: 'OpenRouter', description: 'Unified API to many community LLMs via OpenRouter.', logo: 'O', connected: false, managedByQuayer: false },
]

// Voice Providers
const VOICE_PROVIDERS = [
    { id: 'elevenlabs', name: 'ElevenLabs', description: 'AI voice cloning and generation with natural speech synthesis.', logo: 'E', connected: true, managedByQuayer: true },
    { id: 'deepgram', name: 'Deepgram', description: 'Real-time text-to-speech with low latency.', logo: 'D', connected: false, managedByQuayer: false },
]

// Transcriber Providers
const TRANSCRIBER_PROVIDERS = [
    { id: 'deepgram', name: 'Deepgram', description: 'Real-time speech recognition with low latency for production use.', logo: 'D', connected: false, managedByQuayer: false },
    { id: 'whisper', name: 'Whisper (OpenAI)', description: 'High-accuracy speech-to-text transcription by OpenAI.', logo: 'W', connected: false, managedByQuayer: false },
]

// Tool Providers
const TOOL_PROVIDERS = [
    { id: 'google-calendar', name: 'Google Calendar', description: 'Manage calendar events and schedule appointments.', logo: 'G', connected: false, managedByQuayer: false },
    { id: 'google-sheets', name: 'Google Sheets', description: 'Read and write data to Google Sheets spreadsheets.', logo: 'G', connected: false, managedByQuayer: false },
    { id: 'google-docs', name: 'Google Docs', description: 'Create and edit Google Docs documents.', logo: 'G', connected: false, managedByQuayer: false },
]

// Cloud/Infrastructure Providers
const CLOUD_PROVIDERS = [
    { id: 'postgresql', name: 'PostgreSQL', description: 'Own PostgreSQL database for organization data.', logo: 'P', connected: false, managedByQuayer: false },
    { id: 'redis', name: 'Redis', description: 'Own Redis instance for caching and sessions.', logo: 'R', connected: false, managedByQuayer: false },
    { id: 'supabase', name: 'Supabase', description: 'All-in-one backend with PostgreSQL and real-time features.', logo: 'S', connected: false, managedByQuayer: false },
]

export default function IntegrationsPage() {
    const [searchTerm, setSearchTerm] = useState('')

    const filterProviders = (providers: any[]) => {
        if (!searchTerm) return providers
        return providers.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase())
        )
    }

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-6xl">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                    <Plug className="h-8 w-8 text-primary" />
                    Integrações
                </h1>
                <p className="text-muted-foreground mt-2 text-lg">
                    Configure provedores de IA, voz, transcrição e infraestrutura para sua organização.
                </p>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search integrations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                />
            </div>

            {/* Connected Summary */}
            <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium">Connected</span>
                <Badge variant="secondary" className="ml-auto">2 active</Badge>
            </div>

            {/* Model Providers */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Model Providers</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filterProviders(MODEL_PROVIDERS).map(provider => (
                        <IntegrationProviderCard key={provider.id} {...provider} />
                    ))}
                </div>
            </div>

            {/* Voice Providers */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Voice Providers</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filterProviders(VOICE_PROVIDERS).map(provider => (
                        <IntegrationProviderCard key={provider.id} {...provider} />
                    ))}
                </div>
            </div>

            {/* Transcriber Providers */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Transcriber Providers</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filterProviders(TRANSCRIBER_PROVIDERS).map(provider => (
                        <IntegrationProviderCard key={provider.id} {...provider} />
                    ))}
                </div>
            </div>

            {/* Tool Providers */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Tool Providers</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filterProviders(TOOL_PROVIDERS).map(provider => (
                        <IntegrationProviderCard key={provider.id} {...provider} />
                    ))}
                </div>
            </div>

            {/* Cloud/Infrastructure Providers */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Cloud & Infrastructure Providers</h2>
                <p className="text-sm text-muted-foreground">Configure your own database and infrastructure services.</p>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filterProviders(CLOUD_PROVIDERS).map(provider => (
                        <IntegrationProviderCard key={provider.id} {...provider} />
                    ))}
                </div>
            </div>
        </div>
    )
}
