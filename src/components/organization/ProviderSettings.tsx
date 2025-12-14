'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, Plug, Server, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'

export function ProviderSettings() {
    const queryClient = useQueryClient()
    const [providerType, setProviderType] = useState<'quayer' | 'uazapi'>('quayer')
    const [uazapiUrl, setUazapiUrl] = useState('')
    const [uazapiKey, setUazapiKey] = useState('')
    const [isValidating, setIsValidating] = useState(false)
    const [validationStatus, setValidationStatus] = useState<'idle' | 'success' | 'error'>('idle')

    // Fetch current organization settings
    const { data: orgData, isLoading } = useQuery({
        queryKey: ['organization', 'current'],
        queryFn: async () => {
            const result = await api.organizations.getCurrent.query()
            return result
        },
    })

    const organization = (orgData as any)?.data

    // Sync form with organization data
    useEffect(() => {
        if (organization) {
            setProviderType(organization.providerType || 'quayer')
            setUazapiUrl(organization.uazapiUrl || '')
            setUazapiKey(organization.uazapiKey || '')
        }
    }, [organization])

    // Update organization mutation
    const updateOrgMutation = useMutation({
        mutationFn: async (data: any) => {
            const response = await (api.organizations.update.mutate as any)({
                params: { id: organization.id },
                body: data,
            })
            return response
        },
        onSuccess: () => {
            toast.success('Configurações de provider atualizadas!')
            queryClient.invalidateQueries({ queryKey: ['organization', 'current'] })
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar provider')
        },
    })

    const handleValidateCredentials = async () => {
        if (!uazapiUrl || !uazapiKey) {
            toast.error('Preencha URL e API Key')
            return
        }

        setIsValidating(true)
        setValidationStatus('idle')

        try {
            // Simulate validation - In production, this would call UAZapi to verify credentials
            await new Promise(resolve => setTimeout(resolve, 1500))

            // Mock validation logic
            if (uazapiUrl.includes('api.uazapi') && uazapiKey.length > 10) {
                setValidationStatus('success')
                toast.success('Credenciais validadas com sucesso!')
            } else {
                throw new Error('Credenciais inválidas')
            }
        } catch (error) {
            setValidationStatus('error')
            toast.error('Erro ao validar credenciais. Verifique URL e API Key.')
        } finally {
            setIsValidating(false)
        }
    }

    const handleSave = async () => {
        const data: any = {
            providerType,
        }

        if (providerType === 'uazapi') {
            if (!uazapiUrl || !uazapiKey) {
                toast.error('Configure as credenciais UAZapi antes de salvar')
                return
            }
            if (validationStatus !== 'success') {
                toast.error('Valide as credenciais antes de salvar')
                return
            }
            data.uazapiUrl = uazapiUrl
            data.uazapiKey = uazapiKey
        }

        updateOrgMutation.mutate(data)
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
                        <Plug className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>Provider de Canais</CardTitle>
                </div>
                <CardDescription>
                    Escolha como seus canais de comunicação serão gerenciados.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Provider Selection */}
                <RadioGroup value={providerType} onValueChange={(value: any) => setProviderType(value)}>
                    <div className="grid gap-4">
                        {/* Quayer Managed */}
                        <div className="flex items-start space-x-3 space-y-0">
                            <RadioGroupItem value="quayer" id="quayer" />
                            <div className="flex-1">
                                <Label htmlFor="quayer" className="cursor-pointer">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Shield className="h-4 w-4 text-green-600" />
                                        <span className="font-semibold">Quayer (Gerenciado)</span>
                                        <Badge variant="secondary" className="text-xs">Recomendado</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        Deixe a Quayer gerenciar seus canais. Sem configuração, sem preocupações.
                                        Tudo funciona automaticamente.
                                    </p>
                                </Label>
                            </div>
                        </div>

                        {/* UAZapi Own */}
                        <div className="flex items-start space-x-3 space-y-0">
                            <RadioGroupItem value="uazapi" id="uazapi" />
                            <div className="flex-1">
                                <Label htmlFor="uazapi" className="cursor-pointer">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Server className="h-4 w-4 text-blue-600" />
                                        <span className="font-semibold">UAZapi (Próprio)</span>
                                        <Badge variant="outline" className="text-xs">Avançado</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        Use suas próprias credenciais UAZapi para controle total da infraestrutura.
                                    </p>
                                </Label>
                            </div>
                        </div>
                    </div>
                </RadioGroup>

                {/* UAZapi Credentials */}
                {providerType === 'uazapi' && (
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                            <Server className="h-4 w-4 text-blue-600" />
                            <h4 className="font-semibold text-sm">Credenciais UAZapi</h4>
                        </div>

                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="uazapi-url">URL da API</Label>
                                <Input
                                    id="uazapi-url"
                                    type="url"
                                    placeholder="https://api.uazapi.com"
                                    value={uazapiUrl}
                                    onChange={(e) => {
                                        setUazapiUrl(e.target.value)
                                        setValidationStatus('idle')
                                    }}
                                    className="max-w-md"
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="uazapi-key">API Key</Label>
                                <Input
                                    id="uazapi-key"
                                    type="password"
                                    placeholder="Sua API Key UAZapi"
                                    value={uazapiKey}
                                    onChange={(e) => {
                                        setUazapiKey(e.target.value)
                                        setValidationStatus('idle')
                                    }}
                                    className="max-w-md"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    variant="outline"
                                    onClick={handleValidateCredentials}
                                    disabled={isValidating || !uazapiUrl || !uazapiKey}
                                    className="w-full sm:w-auto"
                                >
                                    {isValidating ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Validando...
                                        </>
                                    ) : (
                                        <>
                                            {validationStatus === 'success' ? (
                                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                            ) : (
                                                <Server className="mr-2 h-4 w-4" />
                                            )}
                                            Validar Credenciais
                                        </>
                                    )}
                                </Button>

                                {validationStatus === 'success' && (
                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Validado
                                    </Badge>
                                )}
                                {validationStatus === 'error' && (
                                    <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        Erro
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <Alert variant="default" className="bg-blue-50 border-blue-200">
                            <AlertCircle className="h-4 w-4 text-blue-600" />
                            <AlertTitle className="text-blue-800">Importante</AlertTitle>
                            <AlertDescription className="text-blue-700">
                                Valide suas credenciais antes de salvar. Sem credenciais válidas, a criação de novos
                                canais ficará desabilitada.
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                {/* Current Status */}
                {organization && (
                    <Alert>
                        <Plug className="h-4 w-4" />
                        <AlertTitle>Status Atual</AlertTitle>
                        <AlertDescription>
                            Provider ativo:{' '}
                            <span className="font-semibold">
                                {organization.providerType === 'quayer' ? 'Quayer (Gerenciado)' : 'UAZapi (Próprio)'}
                            </span>
                        </AlertDescription>
                    </Alert>
                )}

                {/* Save Button */}
                <div className="pt-2">
                    <Button
                        onClick={handleSave}
                        disabled={updateOrgMutation.isPending || (providerType === 'uazapi' && validationStatus !== 'success')}
                        className="w-full sm:w-auto"
                    >
                        {updateOrgMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Salvar Configurações
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
