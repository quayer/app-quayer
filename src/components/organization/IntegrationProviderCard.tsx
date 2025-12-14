'use client'

import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface IntegrationProviderCardProps {
    id: string
    name: string
    description: string
    logo: string
    connected: boolean
    managedByQuayer?: boolean
    onConfigure?: (id: string) => void
}

export function IntegrationProviderCard({
    id,
    name,
    description,
    logo,
    connected,
    managedByQuayer = false,
    onConfigure,
}: IntegrationProviderCardProps) {
    const isManaged = connected && managedByQuayer

    return (
        <Card className={cn(
            'relative overflow-hidden transition-all hover:shadow-md',
            connected && 'border-green-200 bg-green-50/50 dark:bg-green-950/10'
        )}>
            {connected && (
                <div className="absolute top-0 right-0 p-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
            )}

            <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                    {/* Logo */}
                    <div className={cn(
                        'flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg',
                        connected
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-muted text-muted-foreground'
                    )}>
                        {logo}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{name}</h3>
                        </div>
                        <CardDescription className="text-xs line-clamp-2">
                            {description}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0 space-y-2">
                {isManaged && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                        <span className="font-medium">Managed by Quayer</span>
                    </div>
                )}

                <Button
                    variant={connected ? 'outline' : 'default'}
                    size="sm"
                    className="w-full"
                    onClick={() => onConfigure?.(id)}
                    disabled={isManaged}
                >
                    <Settings className="h-4 w-4 mr-2" />
                    {isManaged ? 'Managed' : connected ? 'Gerenciar' : 'Configurar'}
                </Button>
            </CardContent>
        </Card>
    )
}
