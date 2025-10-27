'use client'

/**
 * Accept Invitation Page
 * Public page for accepting organization invitations
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, XCircle, UserPlus, Building2 } from 'lucide-react'
import { api } from '@/igniter.client'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'

export default function AcceptInvitationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { user, isAuthenticated } = useAuth()

  const [step, setStep] = useState<'validating' | 'info' | 'create-account' | 'success' | 'error'>('validating')
  const [inviteData, setInviteData] = useState<any>(null)
  const [hasAccount, setHasAccount] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // New account form
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setStep('error')
      setErrorMessage('Token de convite não encontrado')
      return
    }

    validateToken()
  }, [token])

  const validateToken = async () => {
    if (!token) return

    try {
      const response = await api.invitations.validate.query({
        params: { token },
      })

      if (!response.data?.valid) {
        setStep('error')
        setErrorMessage('Convite inválido')
        return
      }

      setInviteData(response.data.invitation)
      setHasAccount(response.data.hasAccount)

      // Se usuário está logado E o email do convite bate, aceita automaticamente
      if (isAuthenticated && user && user.email === response.data.invitation.email) {
        await acceptInvitationExisting()
      } else if (response.data.hasAccount) {
        // Tem conta mas não está logado - redirecionar para login
        router.push(`/login?redirect=/connect?token=${token}`)
      } else {
        // Não tem conta - mostrar formulário de criação
        setStep('create-account')
      }
    } catch (error: any) {
      setStep('error')
      setErrorMessage(error?.response?.data?.message || 'Erro ao validar convite')
    }
  }

  const acceptInvitationExisting = async () => {
    if (!token) return

    try {
      const response = await api.invitations.acceptExisting.mutate({
        body: { token },
      })

      if (response.data) {
        setStep('success')
        toast.success('Convite aceito com sucesso!')

        // Redirecionar para dashboard após 2 segundos
        setTimeout(() => {
          router.push('/integracoes')
        }, 2000)
      }
    } catch (error: any) {
      setStep('error')
      setErrorMessage(error?.response?.data?.message || 'Erro ao aceitar convite')
      toast.error('Erro ao aceitar convite')
    }
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem')
      return
    }

    if (password.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres')
      return
    }

    if (!token) return

    try {
      const response = await api.invitations.acceptNew.mutate({
        body: {
          token,
          name,
          password,
        },
      })

      if (response.data) {
        setStep('success')
        toast.success('Conta criada e convite aceito com sucesso!')

        // Redirecionar para login após 2 segundos
        setTimeout(() => {
          router.push(`/login?email=${inviteData.email}`)
        }, 2000)
      }
    } catch (error: any) {
      const errorMsg = error?.response?.data?.message || 'Erro ao criar conta'
      setErrorMessage(errorMsg)
      toast.error(errorMsg)
    }
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      master: 'Proprietário',
      manager: 'Gerente',
      user: 'Usuário',
    }
    return labels[role] || role
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-border/50 shadow-lg">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl font-bold text-theme-primary">
            🎊 Convite para Organização
          </CardTitle>
          <CardDescription className="text-lg">
            App Quayer - Plataforma de Gestão
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Validating State */}
          {step === 'validating' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-theme-primary" />
              <p className="text-muted-foreground">Validando convite...</p>
            </div>
          )}

          {/* Info State */}
          {step === 'info' && inviteData && (
            <div className="space-y-6">
              <div className="bg-muted/50 p-6 rounded-lg border border-border/50 space-y-4">
                <div className="flex items-start gap-3">
                  <Building2 className="h-6 w-6 text-theme-primary mt-1" />
                  <div className="space-y-1">
                    <p className="font-semibold text-lg">{inviteData.organizationName}</p>
                    <p className="text-sm text-muted-foreground">Organização</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <UserPlus className="h-6 w-6 text-theme-primary mt-1" />
                  <div className="space-y-1">
                    <p className="font-semibold">{getRoleLabel(inviteData.role)}</p>
                    <p className="text-sm text-muted-foreground">Sua função</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">
                    Email: <span className="font-medium text-foreground">{inviteData.email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Expira em: {new Date(inviteData.expiresAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              <Button
                onClick={acceptInvitationExisting}
                className="w-full bg-theme-primary hover:bg-theme-primary-hover"
                size="lg"
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Aceitar Convite
              </Button>
            </div>
          )}

          {/* Create Account State */}
          {step === 'create-account' && inviteData && (
            <form onSubmit={handleCreateAccount} className="space-y-6">
              <div className="bg-muted/50 p-4 rounded-lg border border-border/50">
                <p className="text-sm">
                  Você foi convidado para <strong>{inviteData.organizationName}</strong>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Como <strong>{getRoleLabel(inviteData.role)}</strong>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={inviteData.email}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div>
                  <Label htmlFor="name">Nome completo *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                  />
                </div>

                <div>
                  <Label htmlFor="password">Senha *</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Deve conter maiúsculas, minúsculas e números
                  </p>
                </div>

                <div>
                  <Label htmlFor="confirmPassword">Confirmar senha *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Digite a senha novamente"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-theme-primary hover:bg-theme-primary-hover"
                size="lg"
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Criar Conta e Aceitar Convite
              </Button>
            </form>
          )}

          {/* Success State */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="rounded-full bg-success/10 p-6">
                <CheckCircle2 className="h-16 w-16 text-success" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-bold text-success">Sucesso!</h3>
                <p className="text-muted-foreground">
                  {hasAccount ? 'Convite aceito!' : 'Conta criada e convite aceito!'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Redirecionando...
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {step === 'error' && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="rounded-full bg-destructive/10 p-6">
                  <XCircle className="h-16 w-16 text-destructive" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-bold text-destructive">Erro</h3>
                  <p className="text-muted-foreground">{errorMessage}</p>
                </div>
              </div>

              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  {errorMessage.includes('expirou') || errorMessage.includes('inválido')
                    ? 'Este convite pode ter expirado ou não ser mais válido. Entre em contato com quem enviou o convite.'
                    : errorMessage}
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => router.push('/')}
                variant="outline"
                className="w-full"
              >
                Voltar para Início
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
