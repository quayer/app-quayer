'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail } from 'lucide-react'

export function SMTPSettings() {
    return (
        <Card className="border-muted/60 shadow-sm">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>Configurações de Email (SMTP)</CardTitle>
                </div>
                <CardDescription>
                    Configure servidor SMTP personalizado para envio de emails.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Configurações SMTP em desenvolvimento...</p>
            </CardContent>
        </Card>
    )
}
