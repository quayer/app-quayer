"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Fingerprint,
  Loader2,
  Plus,
  Trash2,
  Shield,
  Smartphone,
  Key,
  Monitor,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { api } from "@/igniter.client"
import { useToast } from "@/hooks/use-toast"
import { startRegistration, startAuthentication } from "@simplewebauthn/browser"
import { useAuth } from "@/lib/auth/auth-provider"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

interface PasskeyCredential {
  id: string
  name: string
  credentialDeviceType: string
  credentialBackedUp: boolean
  createdAt: string
  lastUsedAt: string | null
}

interface PasskeyManagerProps {
  className?: string
}

export function PasskeyManager({ className }: PasskeyManagerProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isRegistering, setIsRegistering] = useState(false)
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [passkeyToDelete, setPasskeyToDelete] = useState<PasskeyCredential | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Carregar passkeys do usuário
  const loadPasskeys = async () => {
    if (!user?.email) return

    setIsLoading(true)
    try {
      const { data, error } = await api.auth.passkeyList.query()

      if (error) {
        console.error('[Passkey] Error loading:', error)
        setPasskeys([])
      } else if (Array.isArray(data)) {
        // Converter Date para string se necessário
        const formattedData = data.map((p: any) => ({
          ...p,
          createdAt: typeof p.createdAt === 'string' ? p.createdAt : p.createdAt?.toISOString?.() || new Date().toISOString(),
          lastUsedAt: p.lastUsedAt ? (typeof p.lastUsedAt === 'string' ? p.lastUsedAt : p.lastUsedAt?.toISOString?.()) : null
        }))
        setPasskeys(formattedData)
      } else {
        setPasskeys([])
      }
    } catch (error) {
      console.error('[Passkey] Exception:', error)
      setPasskeys([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPasskeys()
  }, [user?.email])

  const checkBrowserSupport = (): boolean => {
    if (!window.PublicKeyCredential) {
      toast({
        title: "Navegador não suportado",
        description: "Seu navegador não suporta autenticação com Passkey. Use Chrome, Edge, Safari ou Firefox atualizado.",
        variant: "destructive",
      })
      return false
    }
    return true
  }

  // Registrar nova Passkey
  const handleRegisterPasskey = async () => {
    if (!checkBrowserSupport()) return
    if (!user?.email) {
      toast({
        title: "Erro",
        description: "Usuário não autenticado",
        variant: "destructive",
      })
      return
    }

    setIsRegistering(true)

    try {
      // 1. Obter opções de registro do servidor
      const { data: optionsData, error: optionsError } = await api.auth.passkeyRegisterOptions.mutate({
        body: { email: user.email }
      })

      if (optionsError || !optionsData) {
        const errorMsg = (optionsError as any)?.error?.message ||
                        (optionsError as any)?.message ||
                        'Erro ao obter opções de registro'
        toast({
          title: "Erro",
          description: errorMsg,
          variant: "destructive",
        })
        return
      }

      // 2. Iniciar registro WebAuthn no navegador
      // Isso abre o prompt do Windows Hello, QR Code para celular, ou USB key
      const credential = await startRegistration({ optionsJSON: optionsData as any })

      // 3. Verificar e salvar credencial no servidor
      const { data: verifyData, error: verifyError } = await api.auth.passkeyRegisterVerify.mutate({
        body: {
          email: user.email,
          credential: credential
        }
      })

      if (verifyError || !verifyData) {
        throw new Error((verifyError as any)?.error?.message || 'Registro falhou')
      }

      toast({
        title: "Passkey registrada!",
        description: "Você agora pode fazer login usando sua Passkey",
      })

      // Recarregar lista
      await loadPasskeys()

    } catch (error: any) {
      console.error('[Passkey Register] Error:', error)

      if (error.name === 'NotAllowedError') {
        toast({
          title: "Registro cancelado",
          description: "Você cancelou o registro da Passkey",
          variant: "destructive",
        })
      } else if (error.name === 'InvalidStateError') {
        toast({
          title: "Passkey já registrada",
          description: "Este dispositivo já possui uma Passkey registrada para esta conta",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Erro no registro",
          description: error.message || "Não foi possível registrar a Passkey",
          variant: "destructive",
        })
      }
    } finally {
      setIsRegistering(false)
    }
  }

  // Deletar Passkey
  const handleDeletePasskey = async () => {
    if (!passkeyToDelete || !user?.email) return

    setIsDeleting(true)
    try {
      const { error } = await (api.auth.passkeyDelete as any).mutate({
        params: { id: passkeyToDelete.id }
      })

      if (error) {
        throw new Error((error as any)?.error?.message || 'Erro ao remover passkey')
      }

      toast({
        title: "Passkey removida",
        description: "A Passkey foi removida com sucesso",
      })

      await loadPasskeys()
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível remover a Passkey",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setPasskeyToDelete(null)
    }
  }

  // Determinar ícone baseado no tipo de dispositivo
  const getDeviceIcon = (deviceType: string) => {
    if (deviceType === 'singleDevice') {
      return <Key className="h-5 w-5 text-amber-500" />
    }
    if (deviceType === 'multiDevice') {
      return <Smartphone className="h-5 w-5 text-green-500" />
    }
    return <Fingerprint className="h-5 w-5 text-primary" />
  }

  // Determinar nome amigável do dispositivo
  const getDeviceName = (passkey: PasskeyCredential) => {
    if (passkey.name) {
      return passkey.name
    }
    if (passkey.credentialDeviceType === 'singleDevice') {
      return 'Chave de Segurança'
    }
    if (passkey.credentialDeviceType === 'multiDevice') {
      return 'Passkey Sincronizada'
    }
    return 'Passkey'
  }

  // Loading state
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Segurança</CardTitle>
          </div>
          <CardDescription>
            Carregando informações de segurança...
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <CardTitle>Segurança</CardTitle>
            </div>
            {passkeys.length > 0 && (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {passkeys.length} passkey{passkeys.length > 1 ? 's' : ''} ativa{passkeys.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <CardDescription>
            Gerencie suas Passkeys para login sem senha. Use Windows Hello, celular via QR code, ou chaves USB como YubiKey.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Lista de Passkeys */}
          {passkeys.length > 0 ? (
            <div className="space-y-3">
              {passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getDeviceIcon(passkey.credentialDeviceType)}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {getDeviceName(passkey)}
                        </p>
                        {passkey.credentialBackedUp && (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50">
                            Sincronizada
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Criada {formatDistanceToNow(new Date(passkey.createdAt), {
                          addSuffix: true,
                          locale: ptBR
                        })}
                        {passkey.lastUsedAt && (
                          <> • Último uso {formatDistanceToNow(new Date(passkey.lastUsedAt), {
                            addSuffix: true,
                            locale: ptBR
                          })}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setPasskeyToDelete(passkey)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed rounded-lg bg-muted/20">
              <div className="p-3 bg-muted rounded-full mb-3">
                <Fingerprint className="h-8 w-8 text-muted-foreground" />
              </div>
              <h4 className="font-medium mb-1">Nenhuma Passkey registrada</h4>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Registre uma Passkey para fazer login de forma rápida e segura, sem precisar digitar senha.
              </p>
            </div>
          )}

          {/* Botão de registro */}
          <Button
            onClick={handleRegisterPasskey}
            disabled={isRegistering}
            className="w-full sm:w-auto"
          >
            {isRegistering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Passkey
              </>
            )}
          </Button>

          {/* Info sobre tipos suportados */}
          <div className="flex flex-wrap gap-4 pt-4 border-t text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Monitor className="h-4 w-4 text-blue-500" />
              <span>Windows Hello / Touch ID</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-green-500" />
              <span>Celular via QR Code</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Key className="h-4 w-4 text-amber-500" />
              <span>Chave USB (YubiKey)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Você precisará registrar uma nova Passkey
              se quiser usar este método de autenticação novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePasskey}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
