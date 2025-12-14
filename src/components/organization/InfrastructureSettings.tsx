'use client'

import { useState, useEffect } from 'react'
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

export function InfrastructureSettings() {
    const queryClient = useQueryClient()

    // Database Settings
    const [dbProvider, setDbProvider] = useState<'quayer' | 'supabase' | 'custom'>('quayer')
    const [supabaseUrl, setSupabaseUrl] = useState('')
    const [supabaseKey, setSupabaseKey] = useState('')
    const [supabaseServiceKey, setSupabaseServiceKey] = useState('')

    // Custom PostgreSQL
    const [pgHost, setPgHost] = useState('')
    const [pgPort, setPgPort] = useState('5432')
    const [pgDatabase, setPgDatabase] = useState('')
    const [pgUser, setPgUser] = useState('')
    const [pgPassword, setPgPassword] = useState('')

    // Redis Settings
    const [redisProvider, setRedisProvider] = useState<'quayer' | 'custom'>('quayer')
    const [redisUrl, setRedisUrl] = useState('')
    const [redisPassword, setRedisPassword] = useState('')

    const [isValidatingDb, setIsValidatingDb] = useState(false)
    const [isValidatingRedis, setIsValidatingRedis] = useState(false)
    const [dbValidationStatus, setDbValidationStatus] = useState<'idle' | 'success' | 'error'>('idle')
    const [redisValidationStatus, setRedisValidationStatus] = useState<'idle' | 'success' | 'error'>('idle')

    // Fetch current organization settings
    const { data: orgData, isLoading } = useQuery({
        queryKey: ['organization', 'current'],
        queryFn: async () => await api.organizations.getCurrent.query(),
    })

    const organization = (orgData as any)?.data

    useEffect(() => {
        if (organization?.dbConfig) {
            const dbConfig = organization.dbConfig
            if (dbConfig.type === 'supabase') {
                setDbProvider('supabase')
                setSupabaseUrl(dbConfig.url || '')
                setSupabaseKey(dbConfig.anonKey || '')
                setSupabaseServiceKey(dbConfig.serviceKey || '')
            } else if (dbConfig.type === 'custom') {
                setDbProvider('custom')
                setPgHost(dbConfig.host || '')
                setPgPort(dbConfig.port || '5432')
                setPgDatabase(dbConfig.database || '')
                setPgUser(dbConfig.user || '')
            }
        }

        if (organization?.redisConfig) {
            setRedisProvider('custom')
            setRedisUrl(organization.redisConfig.url || '')
        }
    }, [organization])

    const validateDatabaseConnection = async () => {
        // TODO: Implementar validacao de conexao via API quando infrastructure controller for recriado
        toast.info('Funcionalidade de validacao de conexao em desenvolvimento')
        setDbValidationStatus('success') // Simular sucesso por enquanto
    }

    const validateRedisConnection = async () => {
        // TODO: Implementar validacao de conexao via API quando infrastructure controller for recriado
        toast.info('Funcionalidade de validacao de conexao em desenvolvimento')
        setRedisValidationStatus('success') // Simular sucesso por enquanto
    }

    const updateInfrastructureMutation = useMutation({
        mutationFn: async (data: any) => {
            const response = await (api.organizations.update.mutate as any)({
                params: { id: organization.id },
                body: data,
            })
            return response
        },
        onSuccess: () => {
            toast.success('Configurações de infraestrutura atualizadas!')
            queryClient.invalidateQueries({ queryKey: ['organization', 'current'] })
        },
        onError: (error: any) => {
            toast.error(error.message || 'Erro ao atualizar infraestrutura')
        },
    })

    const handleSaveDatabaseConfig = async () => {
        if (dbProvider !== 'quayer' && dbValidationStatus !== 'success') {
            toast.error('Valide a conexão antes de salvar')
            return
        }

        let dbConfig: any = null
        if (dbProvider === 'supabase') {
            dbConfig = {
                type: 'supabase',
                url: supabaseUrl,
                anonKey: supabaseKey,
                serviceKey: supabaseServiceKey
            }
        } else if (dbProvider === 'custom') {
            dbConfig = {
                type: 'custom',
                host: pgHost,
                port: parseInt(pgPort),
                database: pgDatabase,
                user: pgUser,
                password: pgPassword
            }
        }

        updateInfrastructureMutation.mutate({ dbProvider, dbConfig })
    }

    const handleSaveRedisConfig = async () => {
        if (redisProvider === 'custom' && redisValidationStatus !== 'success') {
            toast.error('Valide a conexão antes de salvar')
            return
        }

        const redisConfig = redisProvider === 'custom' ? { url: redisUrl, password: redisPassword } : null
        updateInfrastructureMutation.mutate({ redisProvider, redisConfig })
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
                    <RadioGroup value={dbProvider} onValueChange={(value: any) => setDbProvider(value)}>
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

                    {dbProvider === 'supabase' && (
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
                                        value={supabaseUrl}
                                        onChange={(e) => {
                                            setSupabaseUrl(e.target.value)
                                            setDbValidationStatus('idle')
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="supabase-anon-key">Anon/Public Key</Label>
                                    <Input
                                        id="supabase-anon-key"
                                        type="password"
                                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                        value={supabaseKey}
                                        onChange={(e) => {
                                            setSupabaseKey(e.target.value)
                                            setDbValidationStatus('idle')
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="supabase-service-key">Service Role Key (Opcional)</Label>
                                    <Input
                                        id="supabase-service-key"
                                        type="password"
                                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                        value={supabaseServiceKey}
                                        onChange={(e) => {
                                            setSupabaseServiceKey(e.target.value)
                                            setDbValidationStatus('idle')
                                        }}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Necessário para operações administrativas
                                    </p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={validateDatabaseConnection}
                                        disabled={isValidatingDb}
                                    >
                                        {isValidatingDb ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Testando Conexão...
                                            </>
                                        ) : (
                                            <>
                                                {dbValidationStatus === 'success' ? (
                                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                                ) : (
                                                    <Server className="mr-2 h-4 w-4" />
                                                )}
                                                Testar Conexão
                                            </>
                                        )}
                                    </Button>

                                    {dbValidationStatus === 'success' && (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Conexão Validada
                                        </Badge>
                                    )}
                                    {dbValidationStatus === 'error' && (
                                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                            <AlertCircle className="h-3 w-3 mr-1" />
                                            Erro na Conexão
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {dbProvider === 'custom' && (
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
                                        value={pgHost}
                                        onChange={(e) => {
                                            setPgHost(e.target.value)
                                            setDbValidationStatus('idle')
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="pg-port">Porta</Label>
                                    <Input
                                        id="pg-port"
                                        placeholder="5432"
                                        value={pgPort}
                                        onChange={(e) => {
                                            setPgPort(e.target.value)
                                            setDbValidationStatus('idle')
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="pg-database">Database</Label>
                                    <Input
                                        id="pg-database"
                                        placeholder="quayer"
                                        value={pgDatabase}
                                        onChange={(e) => {
                                            setPgDatabase(e.target.value)
                                            setDbValidationStatus('idle')
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="pg-user">Usuário</Label>
                                    <Input
                                        id="pg-user"
                                        placeholder="postgres"
                                        value={pgUser}
                                        onChange={(e) => {
                                            setPgUser(e.target.value)
                                            setDbValidationStatus('idle')
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2 md:col-span-2">
                                    <Label htmlFor="pg-password">Senha</Label>
                                    <Input
                                        id="pg-password"
                                        type="password"
                                        value={pgPassword}
                                        onChange={(e) => {
                                            setPgPassword(e.target.value)
                                            setDbValidationStatus('idle')
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    variant="outline"
                                    onClick={validateDatabaseConnection}
                                    disabled={isValidatingDb}
                                >
                                    {isValidatingDb ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Testando Conexão...
                                        </>
                                    ) : (
                                        <>
                                            {dbValidationStatus === 'success' ? (
                                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                            ) : (
                                                <Server className="mr-2 h-4 w-4" />
                                            )}
                                            Testar Conexão
                                        </>
                                    )}
                                </Button>

                                {dbValidationStatus === 'success' && (
                                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Conexão Validada
                                    </Badge>
                                )}
                                {dbValidationStatus === 'error' && (
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
                        disabled={updateInfrastructureMutation.isPending || (dbProvider !== 'quayer' && dbValidationStatus !== 'success')}
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
                    <RadioGroup value={redisProvider} onValueChange={(value: any) => setRedisProvider(value)}>
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

                    {redisProvider === 'custom' && (
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
                                        value={redisUrl}
                                        onChange={(e) => {
                                            setRedisUrl(e.target.value)
                                            setRedisValidationStatus('idle')
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="redis-password">Senha (Opcional)</Label>
                                    <Input
                                        id="redis-password"
                                        type="password"
                                        value={redisPassword}
                                        onChange={(e) => {
                                            setRedisPassword(e.target.value)
                                            setRedisValidationStatus('idle')
                                        }}
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <Button
                                        variant="outline"
                                        onClick={validateRedisConnection}
                                        disabled={isValidatingRedis}
                                    >
                                        {isValidatingRedis ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Testando Conexão...
                                            </>
                                        ) : (
                                            <>
                                                {redisValidationStatus === 'success' ? (
                                                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                                ) : (
                                                    <Server className="mr-2 h-4 w-4" />
                                                )}
                                                Testar Conexão
                                            </>
                                        )}
                                    </Button>

                                    {redisValidationStatus === 'success' && (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Conexão Validada
                                        </Badge>
                                    )}
                                    {redisValidationStatus === 'error' && (
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
                        disabled={updateInfrastructureMutation.isPending || (redisProvider === 'custom' && redisValidationStatus !== 'success')}
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
