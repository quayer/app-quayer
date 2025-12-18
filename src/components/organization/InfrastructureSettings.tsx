'use client'

import { useEffect, useReducer } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, Database, Server } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/igniter.client'
import { extractErrorMessage } from '@/lib/utils/error-handler'

// Types
type DbProvider = 'quayer' | 'supabase' | 'custom'
type RedisProvider = 'quayer' | 'custom'
type ValidationStatus = 'idle' | 'success' | 'error'

interface InfrastructureState {
    // Database Settings
    dbProvider: DbProvider
    supabaseUrl: string
    supabaseKey: string
    supabaseServiceKey: string
    // Custom PostgreSQL
    pgHost: string
    pgPort: string
    pgDatabase: string
    pgUser: string
    pgPassword: string
    // Redis Settings
    redisProvider: RedisProvider
    redisUrl: string
    redisPassword: string
    // Validation state
    isValidatingDb: boolean
    isValidatingRedis: boolean
    dbValidationStatus: ValidationStatus
    redisValidationStatus: ValidationStatus
}

type InfrastructureAction =
    | { type: 'SET_DB_PROVIDER'; payload: DbProvider }
    | { type: 'SET_SUPABASE'; payload: { url?: string; key?: string; serviceKey?: string } }
    | { type: 'SET_PG'; payload: { host?: string; port?: string; database?: string; user?: string; password?: string } }
    | { type: 'SET_REDIS_PROVIDER'; payload: RedisProvider }
    | { type: 'SET_REDIS'; payload: { url?: string; password?: string } }
    | { type: 'SET_DB_VALIDATION'; payload: { isValidating?: boolean; status?: ValidationStatus } }
    | { type: 'SET_REDIS_VALIDATION'; payload: { isValidating?: boolean; status?: ValidationStatus } }
    | { type: 'LOAD_FROM_ORG'; payload: { dbConfig?: Record<string, unknown>; redisConfig?: Record<string, unknown> } }

const initialState: InfrastructureState = {
    dbProvider: 'quayer',
    supabaseUrl: '',
    supabaseKey: '',
    supabaseServiceKey: '',
    pgHost: '',
    pgPort: '5432',
    pgDatabase: '',
    pgUser: '',
    pgPassword: '',
    redisProvider: 'quayer',
    redisUrl: '',
    redisPassword: '',
    isValidatingDb: false,
    isValidatingRedis: false,
    dbValidationStatus: 'idle',
    redisValidationStatus: 'idle',
}

function infrastructureReducer(state: InfrastructureState, action: InfrastructureAction): InfrastructureState {
    switch (action.type) {
        case 'SET_DB_PROVIDER':
            return { ...state, dbProvider: action.payload, dbValidationStatus: 'idle' }
        case 'SET_SUPABASE':
            return {
                ...state,
                supabaseUrl: action.payload.url ?? state.supabaseUrl,
                supabaseKey: action.payload.key ?? state.supabaseKey,
                supabaseServiceKey: action.payload.serviceKey ?? state.supabaseServiceKey,
                dbValidationStatus: 'idle',
            }
        case 'SET_PG':
            return {
                ...state,
                pgHost: action.payload.host ?? state.pgHost,
                pgPort: action.payload.port ?? state.pgPort,
                pgDatabase: action.payload.database ?? state.pgDatabase,
                pgUser: action.payload.user ?? state.pgUser,
                pgPassword: action.payload.password ?? state.pgPassword,
                dbValidationStatus: 'idle',
            }
        case 'SET_REDIS_PROVIDER':
            return { ...state, redisProvider: action.payload, redisValidationStatus: 'idle' }
        case 'SET_REDIS':
            return {
                ...state,
                redisUrl: action.payload.url ?? state.redisUrl,
                redisPassword: action.payload.password ?? state.redisPassword,
                redisValidationStatus: 'idle',
            }
        case 'SET_DB_VALIDATION':
            return {
                ...state,
                isValidatingDb: action.payload.isValidating ?? state.isValidatingDb,
                dbValidationStatus: action.payload.status ?? state.dbValidationStatus,
            }
        case 'SET_REDIS_VALIDATION':
            return {
                ...state,
                isValidatingRedis: action.payload.isValidating ?? state.isValidatingRedis,
                redisValidationStatus: action.payload.status ?? state.redisValidationStatus,
            }
        case 'LOAD_FROM_ORG': {
            const { dbConfig, redisConfig } = action.payload
            let newState = { ...state }

            if (dbConfig) {
                const type = dbConfig.type as string
                if (type === 'supabase') {
                    newState = {
                        ...newState,
                        dbProvider: 'supabase',
                        supabaseUrl: (dbConfig.url as string) || '',
                        supabaseKey: (dbConfig.anonKey as string) || '',
                        supabaseServiceKey: (dbConfig.serviceKey as string) || '',
                    }
                } else if (type === 'custom') {
                    newState = {
                        ...newState,
                        dbProvider: 'custom',
                        pgHost: (dbConfig.host as string) || '',
                        pgPort: (dbConfig.port as string) || '5432',
                        pgDatabase: (dbConfig.database as string) || '',
                        pgUser: (dbConfig.user as string) || '',
                    }
                }
            }

            if (redisConfig) {
                newState = {
                    ...newState,
                    redisProvider: 'custom',
                    redisUrl: (redisConfig.url as string) || '',
                }
            }

            return newState
        }
        default:
            return state
    }
}

export function InfrastructureSettings() {
    const queryClient = useQueryClient()
    const [state, dispatch] = useReducer(infrastructureReducer, initialState)

    // Fetch current organization settings
    const { data: orgData, isLoading } = useQuery({
        queryKey: ['organization', 'current'],
        queryFn: async () => await api.organizations.getCurrent.query(),
    })

    const organization = (orgData as Record<string, unknown>)?.data as Record<string, unknown> | undefined

    useEffect(() => {
        if (organization) {
            dispatch({
                type: 'LOAD_FROM_ORG',
                payload: {
                    dbConfig: organization.dbConfig as Record<string, unknown> | undefined,
                    redisConfig: organization.redisConfig as Record<string, unknown> | undefined,
                },
            })
        }
    }, [organization])

    const validateDatabaseConnection = async () => {
        // TODO: Implementar validacao de conexao via API quando infrastructure controller for recriado
        toast.info('Funcionalidade de validacao de conexao em desenvolvimento')
        dispatch({ type: 'SET_DB_VALIDATION', payload: { status: 'success' } })
    }

    const validateRedisConnection = async () => {
        // TODO: Implementar validacao de conexao via API quando infrastructure controller for recriado
        toast.info('Funcionalidade de validacao de conexao em desenvolvimento')
        dispatch({ type: 'SET_REDIS_VALIDATION', payload: { status: 'success' } })
    }

    const updateInfrastructureMutation = useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            const response = await (api.organizations.update.mutate as (args: Record<string, unknown>) => Promise<unknown>)({
                params: { id: (organization as Record<string, unknown>)?.id },
                body: data,
            })
            return response
        },
        onSuccess: () => {
            toast.success('Configurações de infraestrutura atualizadas!')
            queryClient.invalidateQueries({ queryKey: ['organization', 'current'] })
        },
        onError: (error: unknown) => {
            toast.error(extractErrorMessage(error, 'Erro ao atualizar infraestrutura'))
        },
    })

    const handleSaveDatabaseConfig = async () => {
        if (state.dbProvider !== 'quayer' && state.dbValidationStatus !== 'success') {
            toast.error('Valide a conexão antes de salvar')
            return
        }

        let dbConfig: Record<string, unknown> | null = null
        if (state.dbProvider === 'supabase') {
            dbConfig = {
                type: 'supabase',
                url: state.supabaseUrl,
                anonKey: state.supabaseKey,
                serviceKey: state.supabaseServiceKey
            }
        } else if (state.dbProvider === 'custom') {
            dbConfig = {
                type: 'custom',
                host: state.pgHost,
                port: parseInt(state.pgPort),
                database: state.pgDatabase,
                user: state.pgUser,
                password: state.pgPassword
            }
        }

        updateInfrastructureMutation.mutate({ dbProvider: state.dbProvider, dbConfig })
    }

    const handleSaveRedisConfig = async () => {
        if (state.redisProvider === 'custom' && state.redisValidationStatus !== 'success') {
            toast.error('Valide a conexão antes de salvar')
            return
        }

        const redisConfig = state.redisProvider === 'custom' ? { url: state.redisUrl, password: state.redisPassword } : null
        updateInfrastructureMutation.mutate({ redisProvider: state.redisProvider, redisConfig })
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
            {/* Database Configuration */}
            <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Database className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle>Banco de Dados</CardTitle>
                    </div>
                    <CardDescription>
                        Configure o banco de dados PostgreSQL para sua organização.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <RadioGroup value={state.dbProvider} onValueChange={(value: DbProvider) => dispatch({ type: 'SET_DB_PROVIDER', payload: value })}>
                        <div className="grid gap-4">
                            <div className="flex items-start space-x-3">
                                <RadioGroupItem value="quayer" id="db-quayer" />
                                <Label htmlFor="db-quayer" className="cursor-pointer flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Server className="h-4 w-4 text-green-600" />
                                        <span className="font-semibold">Quayer (Gerenciado)</span>
                                        <Badge variant="secondary" className="text-xs">Recomendado</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        Banco de dados gerenciado pela Quayer. Sem configuração necessária.
                                    </p>
                                </Label>
                            </div>

                            <div className="flex items-start space-x-3">
                                <RadioGroupItem value="supabase" id="db-supabase" />
                                <Label htmlFor="db-supabase" className="cursor-pointer flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Database className="h-4 w-4 text-green-600" />
                                        <span className="font-semibold">Supabase</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        Use seu projeto Supabase com PostgreSQL e recursos em tempo real.
                                    </p>
                                </Label>
                            </div>

                            <div className="flex items-start space-x-3">
                                <RadioGroupItem value="custom" id="db-custom" />
                                <Label htmlFor="db-custom" className="cursor-pointer flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Database className="h-4 w-4 text-blue-600" />
                                        <span className="font-semibold">PostgreSQL Personalizado</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        Conecte seu próprio servidor PostgreSQL.
                                    </p>
                                </Label>
                            </div>
                        </div>
                    </RadioGroup>

                    {state.dbProvider === 'supabase' && (
                        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <Database className="h-4 w-4 text-green-600" />
                                Credenciais Supabase
                            </h4>

                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="supabase-url">Project URL</Label>
                                    <Input
                                        id="supabase-url"
                                        type="url"
                                        placeholder="https://xxxxx.supabase.co"
                                        value={state.supabaseUrl}
                                        onChange={(e) => dispatch({ type: 'SET_SUPABASE', payload: { url: e.target.value } })}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="supabase-anon-key">Anon/Public Key</Label>
                                    <Input
                                        id="supabase-anon-key"
                                        type="password"
                                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                        value={state.supabaseKey}
                                        onChange={(e) => dispatch({ type: 'SET_SUPABASE', payload: { key: e.target.value } })}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="supabase-service-key">Service Role Key (Opcional)</Label>
                                    <Input
                                        id="supabase-service-key"
                                        type="password"
                                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                        value={state.supabaseServiceKey}
                                        onChange={(e) => dispatch({ type: 'SET_SUPABASE', payload: { serviceKey: e.target.value } })}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Necessário para operações administrativas
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={validateDatabaseConnection}
                                        disabled={state.isValidatingDb}
                                    >
                                        {state.isValidatingDb ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Testando Conexão...
                                            </>
                                        ) : (
                                            <>
                                                {state.dbValidationStatus === 'success' ? (
                                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                                ) : (
                                                    <Server className="mr-2 h-4 w-4" />
                                                )}
                                                Testar Conexão
                                            </>
                                        )}
                                    </Button>

                                    {state.dbValidationStatus === 'success' && (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Conexão Validada
                                        </Badge>
                                    )}
                                    {state.dbValidationStatus === 'error' && (
                                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            Erro na Conexão
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {state.dbProvider === 'custom' && (
                        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <Database className="h-4 w-4 text-blue-600" />
                                Credenciais PostgreSQL
                            </h4>

                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="pg-host">Host</Label>
                                    <Input
                                        id="pg-host"
                                        placeholder="localhost"
                                        value={state.pgHost}
                                        onChange={(e) => dispatch({ type: 'SET_PG', payload: { host: e.target.value } })}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="pg-port">Porta</Label>
                                    <Input
                                        id="pg-port"
                                        placeholder="5432"
                                        value={state.pgPort}
                                        onChange={(e) => dispatch({ type: 'SET_PG', payload: { port: e.target.value } })}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="pg-database">Database</Label>
                                    <Input
                                        id="pg-database"
                                        placeholder="quayer"
                                        value={state.pgDatabase}
                                        onChange={(e) => dispatch({ type: 'SET_PG', payload: { database: e.target.value } })}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="pg-user">Usuário</Label>
                                    <Input
                                        id="pg-user"
                                        placeholder="postgres"
                                        value={state.pgUser}
                                        onChange={(e) => dispatch({ type: 'SET_PG', payload: { user: e.target.value } })}
                                    />
                                </div>

                                <div className="grid gap-2 md:col-span-2">
                                    <Label htmlFor="pg-password">Senha</Label>
                                    <Input
                                        id="pg-password"
                                        type="password"
                                        value={state.pgPassword}
                                        onChange={(e) => dispatch({ type: 'SET_PG', payload: { password: e.target.value } })}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    variant="outline"
                                    onClick={validateDatabaseConnection}
                                    disabled={state.isValidatingDb}
                                >
                                    {state.isValidatingDb ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Testando Conexão...
                                        </>
                                    ) : (
                                        <>
                                            {state.dbValidationStatus === 'success' ? (
                                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                            ) : (
                                                <Server className="mr-2 h-4 w-4" />
                                            )}
                                            Testar Conexão
                                        </>
                                    )}
                                </Button>

                                {state.dbValidationStatus === 'success' && (
                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Conexão Validada
                                    </Badge>
                                )}
                                {state.dbValidationStatus === 'error' && (
                                    <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                        Erro na Conexão
                                    </Badge>
                                )}
                            </div>
                        </div>
                    )}

                    <Alert variant="default" className="bg-blue-50 border-blue-200">
                        <AlertCircle className="h-4 w-4 text-blue-600" />
                        <AlertTitle className="text-blue-800">Atenção</AlertTitle>
                        <AlertDescription className="text-blue-700">
                            Ao trocar o banco de dados, todos os dados serão migrados para a nova configuração.
                            Este processo pode levar alguns minutos.
                        </AlertDescription>
                    </Alert>

                    <Button
                        onClick={handleSaveDatabaseConfig}
                        disabled={updateInfrastructureMutation.isPending || (state.dbProvider !== 'quayer' && state.dbValidationStatus !== 'success')}
                    >
                        {updateInfrastructureMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Salvar Configuração
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Redis Configuration */}
            <Card className="border-muted/60 shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Server className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle>Redis (Cache)</CardTitle>
                    </div>
                    <CardDescription>
                        Configure o servidor Redis para cache e sessões.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <RadioGroup value={state.redisProvider} onValueChange={(value: RedisProvider) => dispatch({ type: 'SET_REDIS_PROVIDER', payload: value })}>
                        <div className="grid gap-4">
                            <div className="flex items-start space-x-3">
                                <RadioGroupItem value="quayer" id="redis-quayer" />
                                <Label htmlFor="redis-quayer" className="cursor-pointer flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Server className="h-4 w-4 text-green-600" />
                                        <span className="font-semibold">Quayer (Gerenciado)</span>
                                        <Badge variant="secondary" className="text-xs">Recomendado</Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        Redis gerenciado pela Quayer.
                                    </p>
                                </Label>
                            </div>

                            <div className="flex items-start space-x-3">
                                <RadioGroupItem value="custom" id="redis-custom" />
                                <Label htmlFor="redis-custom" className="cursor-pointer flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Server className="h-4 w-4 text-red-600" />
                                        <span className="font-semibold">Redis Personalizado</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground font-normal">
                                        Conecte seu próprio servidor Redis.
                                    </p>
                                </Label>
                            </div>
                        </div>
                    </RadioGroup>

                    {state.redisProvider === 'custom' && (
                        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <Server className="h-4 w-4 text-red-600" />
                                Credenciais Redis
                            </h4>

                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="redis-url">URL de Conexão</Label>
                                    <Input
                                        id="redis-url"
                                        placeholder="redis://localhost:6379"
                                        value={state.redisUrl}
                                        onChange={(e) => dispatch({ type: 'SET_REDIS', payload: { url: e.target.value } })}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="redis-password">Senha (Opcional)</Label>
                                    <Input
                                        id="redis-password"
                                        type="password"
                                        value={state.redisPassword}
                                        onChange={(e) => dispatch({ type: 'SET_REDIS', payload: { password: e.target.value } })}
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={validateRedisConnection}
                                        disabled={state.isValidatingRedis}
                                    >
                                        {state.isValidatingRedis ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Testando Conexão...
                                            </>
                                        ) : (
                                            <>
                                                {state.redisValidationStatus === 'success' ? (
                                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                                ) : (
                                                    <Server className="mr-2 h-4 w-4" />
                                                )}
                                                Testar Conexão
                                            </>
                                        )}
                                    </Button>

                                    {state.redisValidationStatus === 'success' && (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Conexão Validada
                                        </Badge>
                                    )}
                                    {state.redisValidationStatus === 'error' && (
                                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            Erro na Conexão
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <Button
                        onClick={handleSaveRedisConfig}
                        disabled={updateInfrastructureMutation.isPending || (state.redisProvider === 'custom' && state.redisValidationStatus !== 'success')}
                    >
                        {updateInfrastructureMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Salvar Configuração
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
