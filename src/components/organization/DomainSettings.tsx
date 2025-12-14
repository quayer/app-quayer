'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Globe } from 'lucide-react'

export function DomainSettings() {
    return (
        <Card className="border-muted/60 shadow-sm">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>Domínio Personalizado</CardTitle>
                </div>
                <CardDescription>
                    Configure um domínio customizado para sua organização.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Configurações de domínio em desenvolvimento...</p>
            </CardContent>
        </Card>
    )
}
