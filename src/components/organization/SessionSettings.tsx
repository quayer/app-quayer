'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Save, MessageSquare, Users, Clock, Pause, XCircle, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import { Separator } from '@/components/ui/separator'

type AutoPauseBehavior = 'CLOSE_SESSION' | 'WAIT_CUSTOMER'
type GroupMode = 'DISABLED' | 'MONITOR_ONLY' | 'ACTIVE'
type GroupAIResponseMode = 'IN_GROUP' | 'PRIVATE' | 'HYBRID'

export function SessionSettings() {
    const queryClient = useQueryClient()

    // Auto-pause settings
    const [autoPauseBehavior, setAutoPauseBehavior] = useState<AutoPauseBehavior>('WAIT_CUSTOMER')
    const [autoPauseWaitMinutes, setAutoPauseWaitMinutes] = useState(30)
    const [autoPauseDurationMinutes, setAutoPauseDurationMinutes] = useState(15)

    // Group settings
    const [groupDefaultMode, setGroupDefaultMode] = useState<GroupMode>('DISABLED')
    const [groupAiResponseMode, setGroupAiResponseMode] = useState<GroupAIResponseMode>('PRIVATE')

    const { data: orgData, isLoading } = useQuery({
        queryKey: ['organization', 'current'],
        queryFn: async () => await api.organizations.getCurrent.query(),
    })

    const organization = (orgData as any)?.data

    useEffect(() => {
        if (organization) {
            setAutoPauseBehavior(organization.autoPauseBehavior || 'WAIT_CUSTOMER')
            setAutoPauseWaitMinutes(organization.autoPauseWaitMinutes || 30)
            setAutoPauseDurationMinutes(organization.autoPauseDurationMinutes || 15)
            setGroupDefaultMode(organization.groupDefaultMode || 'DISABLED')
            setGroupAiResponseMode(organization.groupAiResponseMode || 'PRIVATE')
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
            toast.success('Configurações de sessão atualizadas!')
            queryClient.invalidateQueries({ queryKey: ['organization', 'current'] })
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar configurações')
        },
    })

    const handleSave = () => {
        updateOrgMutation.mutate({
            autoPauseBehavior,
            autoPauseWaitMinutes,
            autoPauseDurationMinutes,
            groupDefaultMode,
            groupAiResponseMode,
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
        <div className="space-y-6">
            {/* Auto-Pause Settings */}
            <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                            <Pause className="h-5 w-5 text-amber-600" />
                        </div>
                        <CardTitle>Comportamento de Auto-Pause</CardTitle>
                    </div>
                    <CardDescription>
                        Configure o que acontece quando um atendente assume uma conversa e depois fica inativo.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4">
                        <div className="grid gap-3">
                            <Label htmlFor="auto-pause-behavior">Quando o atendente ficar inativo</Label>
                            <Select
                                value={autoPauseBehavior}
                                onValueChange={(value: AutoPauseBehavior) => setAutoPauseBehavior(value)}
                            >
                                <SelectTrigger id="auto-pause-behavior" className="max-w-md">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="CLOSE_SESSION">
                                        <div className="flex items-center gap-2">
                                            <XCircle className="h-4 w-4 text-red-500" />
                                            <span>Encerrar sessão imediatamente</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="WAIT_CUSTOMER">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-blue-500" />
                                            <span>Aguardar cliente e depois encerrar</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {autoPauseBehavior === 'CLOSE_SESSION'
                                    ? 'A sessão será encerrada automaticamente quando o tempo de pausa expirar.'
                                    : 'O sistema aguardará uma resposta do cliente antes de encerrar a sessão.'
                                }
                            </p>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="grid gap-3">
                                <Label htmlFor="auto-pause-duration" className="flex items-center gap-2">
                                    <Timer className="h-4 w-4 text-muted-foreground" />
                                    Duração do Auto-Pause
                                </Label>
                                <div className="flex items-center gap-2 max-w-[200px]">
                                    <Input
                                        id="auto-pause-duration"
                                        type="number"
                                        min={5}
                                        max={120}
                                        value={autoPauseDurationMinutes}
                                        onChange={(e) => setAutoPauseDurationMinutes(parseInt(e.target.value) || 15)}
                                    />
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">minutos</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Tempo de inatividade do atendente antes de acionar o comportamento de pause.
                                </p>
                            </div>

                            {autoPauseBehavior === 'WAIT_CUSTOMER' && (
                                <div className="grid gap-3">
                                    <Label htmlFor="auto-pause-wait" className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        Tempo de Espera do Cliente
                                    </Label>
                                    <div className="flex items-center gap-2 max-w-[200px]">
                                        <Input
                                            id="auto-pause-wait"
                                            type="number"
                                            min={5}
                                            max={1440}
                                            value={autoPauseWaitMinutes}
                                            onChange={(e) => setAutoPauseWaitMinutes(parseInt(e.target.value) || 30)}
                                        />
                                        <span className="text-sm text-muted-foreground whitespace-nowrap">minutos</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Tempo que o sistema aguarda resposta do cliente antes de encerrar.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Visual explanation */}
                    <div className="bg-muted/50 rounded-lg p-4 border border-muted">
                        <h4 className="font-medium text-sm mb-2">Como funciona:</h4>
                        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                            <li>Atendente assume a conversa (IA pausada)</li>
                            <li>Após {autoPauseDurationMinutes} min de inatividade do atendente...</li>
                            {autoPauseBehavior === 'CLOSE_SESSION' ? (
                                <li className="text-red-600">Sessão é encerrada automaticamente</li>
                            ) : (
                                <>
                                    <li>Sistema aguarda resposta do cliente por até {autoPauseWaitMinutes} min</li>
                                    <li>Se cliente não responder, sessão é encerrada</li>
                                    <li>Se cliente responder, atendente é notificado</li>
                                </>
                            )}
                        </ol>
                    </div>
                </CardContent>
            </Card>

            {/* Group Settings */}
            <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                            <Users className="h-5 w-5 text-green-600" />
                        </div>
                        <CardTitle>Configurações de Grupos WhatsApp</CardTitle>
                    </div>
                    <CardDescription>
                        Configure como o sistema deve tratar mensagens de grupos do WhatsApp.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-4">
                        <div className="grid gap-3">
                            <Label htmlFor="group-mode">Modo Padrão para Grupos</Label>
                            <Select
                                value={groupDefaultMode}
                                onValueChange={(value: GroupMode) => setGroupDefaultMode(value)}
                            >
                                <SelectTrigger id="group-mode" className="max-w-md">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="DISABLED">
                                        <div className="flex items-center gap-2">
                                            <XCircle className="h-4 w-4 text-gray-500" />
                                            <span>Desativado - Ignorar grupos</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="MONITOR_ONLY">
                                        <div className="flex items-center gap-2">
                                            <MessageSquare className="h-4 w-4 text-blue-500" />
                                            <span>Monitorar - Registrar sem responder</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="ACTIVE">
                                        <div className="flex items-center gap-2">
                                            <Users className="h-4 w-4 text-green-500" />
                                            <span>Ativo - Monitorar e responder</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {groupDefaultMode === 'DISABLED' && 'Mensagens de grupos serão ignoradas pelo sistema.'}
                                {groupDefaultMode === 'MONITOR_ONLY' && 'Mensagens serão registradas mas o bot não responderá automaticamente.'}
                                {groupDefaultMode === 'ACTIVE' && 'O bot irá monitorar e pode responder mensagens de grupos.'}
                            </p>
                        </div>

                        {groupDefaultMode === 'ACTIVE' && (
                            <>
                                <Separator />
                                <div className="grid gap-3">
                                    <Label htmlFor="ai-response-mode">Modo de Resposta da IA</Label>
                                    <Select
                                        value={groupAiResponseMode}
                                        onValueChange={(value: GroupAIResponseMode) => setGroupAiResponseMode(value)}
                                    >
                                        <SelectTrigger id="ai-response-mode" className="max-w-md">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="IN_GROUP">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-green-500" />
                                                    <span>No Grupo - Responder diretamente</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="PRIVATE">
                                                <div className="flex items-center gap-2">
                                                    <MessageSquare className="h-4 w-4 text-blue-500" />
                                                    <span>Privado - Responder no chat privado</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="HYBRID">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-purple-500" />
                                                    <span>Híbrido - IA decide baseado no contexto</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        {groupAiResponseMode === 'IN_GROUP' && 'A IA responderá diretamente no grupo para todos verem.'}
                                        {groupAiResponseMode === 'PRIVATE' && 'A IA enviará a resposta no chat privado do participante.'}
                                        {groupAiResponseMode === 'HYBRID' && 'A IA decide se responde no grupo ou privado baseado no conteúdo.'}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Visual explanation */}
                    <div className="bg-muted/50 rounded-lg p-4 border border-muted">
                        <h4 className="font-medium text-sm mb-2">Modelo de Sessão por Participante:</h4>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                            <li>Cada participante do grupo tem sua própria sessão individual</li>
                            <li>Histórico de conversa privada é mantido separadamente</li>
                            <li>Atendentes podem assumir conversas específicas de participantes</li>
                            <li>Contexto do grupo é preservado para análise</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={updateOrgMutation.isPending} size="lg">
                    {updateOrgMutation.isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Salvando...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" />
                            Salvar Configurações
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
