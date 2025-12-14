'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'

export function TeamSettings() {
    return (
        <Card className="border-muted/60 shadow-sm">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Users className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>Equipe & Membros</CardTitle>
                </div>
                <CardDescription>
                    Gerencie usuários e permissões da organização.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Gerenciamento de equipe em desenvolvimento...</p>
            </CardContent>
        </Card>
    )
}
