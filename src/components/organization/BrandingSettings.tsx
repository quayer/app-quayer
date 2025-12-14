'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Save, Palette, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'

export function BrandingSettings() {
    const queryClient = useQueryClient()
    const [logoUrl, setLogoUrl] = useState('')
    const [primaryColor, setPrimaryColor] = useState('#000000')
    const [secondaryColor, setSecondaryColor] = useState('')

    const { data: orgData, isLoading } = useQuery({
        queryKey: ['organization', 'current'],
        queryFn: async () => await api.organizations.getCurrent.query(),
    })

    const organization = (orgData as any)?.data

    useEffect(() => {
        if (organization) {
            setLogoUrl(organization.logoUrl || '')
            setPrimaryColor(organization.primaryColor || '#000000')
            setSecondaryColor(organization.secondaryColor || '')
        }
    }, [organization])

    const updateOrgMutation = useMutation({
        mutationFn: async (data: any) => {
            const response = await (api.organizations.update.mutate as any)({
                params: { id: organization.id },
                body: data,
            })
            return response
        },
        onSuccess: () => {
            toast.success('Branding atualizado com sucesso!')
            queryClient.invalidateQueries({ queryKey: ['organization', 'current'] })
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar branding')
        },
    })

    const handleSave = () => {
        updateOrgMutation.mutate({
            logoUrl,
            primaryColor,
            secondaryColor,
        })
    }

    if (isLoading) {
        return (
            <Card>
                <CardContent className="p-12 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="border-muted/60 shadow-sm">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Palette className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>Aparência & Branding</CardTitle>
                </div>
                <CardDescription>
                    Personalize a identidade visual da sua organização.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Logo Upload */}
                <div className="space-y-3">
                    <Label>Logo da Organização</Label>
                    <div className="grid gap-3">
                        <Input
                            type="url"
                            placeholder="https://exemplo.com/logo.png"
                            value={logoUrl}
                            onChange={(e) => setLogoUrl(e.target.value)}
                            className="max-w-md"
                        />
                        {logoUrl && (
                            <div className="flex items-center gap-3">
                                <div className="p-4 border rounded-lg bg-muted/30">
                                    <img src={logoUrl} alt="Logo Preview" className="h-12 max-w-xs" />
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setLogoUrl('')}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        URL pública do seu logo. Será exibido no login e na aplicação.
                    </p>
                </div>

                {/* Colors */}
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="primary-color">Cor Primária</Label>
                        <div className="flex gap-2">
                            <Input
                                id="primary-color"
                                type="color"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                className="w-20 h-10 cursor-pointer"
                            />
                            <Input
                                type="text"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                className="flex-1"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="secondary-color">Cor Secundária (Opcional)</Label>
                        <div className="flex gap-2">
                            <Input
                                id="secondary-color"
                                type="color"
                                value={secondaryColor || '#666666'}
                                onChange={(e) => setSecondaryColor(e.target.value)}
                                className="w-20 h-10 cursor-pointer"
                            />
                            <Input
                                type="text"
                                value={secondaryColor}
                                onChange={(e) => setSecondaryColor(e.target.value)}
                                placeholder="#666666"
                                className="flex-1"
                            />
                        </div>
                    </div>
                </div>

                <Alert>
                    <Palette className="h-4 w-4" />
                    <AlertDescription>
                        <strong>Powered by Quayer</strong> - A marca Quayer permanecerá visível discretamente para
                        identificar a plataforma.
                    </AlertDescription>
                </Alert>

                <div className="pt-2">
                    <Button onClick={handleSave} disabled={updateOrgMutation.isPending} className="w-full sm:w-auto">
                        {updateOrgMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Salvar Branding
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
