'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Save, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'

export function GeneralSettings() {
    const queryClient = useQueryClient()
    const [name, setName] = useState('')
    const [slug, setSlug] = useState('')
    const [document, setDocument] = useState('')

    const { data: orgData, isLoading } = useQuery({
        queryKey: ['organization', 'current'],
        queryFn: async () => await api.organizations.getCurrent.query(),
    })

    const organization = (orgData as any)?.data

    useEffect(() => {
        if (organization) {
            setName(organization.name || '')
            setSlug(organization.slug || '')
            setDocument(organization.document || '')
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
            toast.success('Informações gerais atualizadas!')
            queryClient.invalidateQueries({ queryKey: ['organization', 'current'] })
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar informações')
        },
    })

    const handleSave = () => {
        updateOrgMutation.mutate({ name, slug, document })
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
                        <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>Informações Gerais</CardTitle>
                </div>
                <CardDescription>
                    Dados básicos da sua organização.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-3">
                    <Label htmlFor="org-name">Nome da Organização</Label>
                    <Input
                        id="org-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Minha Empresa"
                        className="max-w-md"
                    />
                </div>

                <div className="grid gap-3">
                    <Label htmlFor="org-slug">Slug</Label>
                    <Input
                        id="org-slug"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="minha-empresa"
                        className="max-w-md"
                    />
                    <p className="text-xs text-muted-foreground">
                        Usado na URL e identificação única da organização
                    </p>
                </div>

                <div className="grid gap-3">
                    <Label htmlFor="org-document">Documento (CPF/CNPJ)</Label>
                    <Input
                        id="org-document"
                        value={document}
                        onChange={(e) => setDocument(e.target.value)}
                        placeholder="00.000.000/0000-00"
                        className="max-w-md"
                    />
                </div>

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
                                Salvar Alterações
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
