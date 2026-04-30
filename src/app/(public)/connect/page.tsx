'use client'

/**
 * Accept Invitation Page
 * Public page for accepting organization invitations
 */

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Label } from '@/client/components/ui/label'
import { Alert, AlertDescription } from '@/client/components/ui/alert'
import { Loader2, CheckCircle2, XCircle, UserPlus, Building2 } from 'lucide-react'
import { useAuth } from '@/lib/auth/auth-provider'
import { toast } from 'sonner'

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { user, isAuthenticated } = useAuth()

  const [step, setStep] = useState<'validating' | 'info' | 'create-account' | 'success' | 'error'>('validating')
  interface InviteData {
    email: string
    role: string
    organizationName: string
    expiresAt: string
  }

  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [hasAccount, setHasAccount] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')

  // New account form
  const [name, setName] = useState('')

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
      const res = await fetch(`/api/v1/invitations/validate/${token}`)
      const data = await res.json()

      if (!res.ok || !data.data?.valid) {
        setStep('error')
        setErrorMessage(data.message || 'Convite inválido')
        return
      }

      setInviteData(data.data.invitation)
      setHasAccount(data.data.hasAccount)

      if (isAuthenticated && user && user.email === data.data.invitation.email) {
        await acceptInvitationExisting()
      } else if (data.data.hasAccount) {
        router.push(`/login?redirect=${encodeURIComponent(`/connect?token=${token}`)}`)
      } else {
        setStep('create-account')
      }
    } catch (error: unknown) {
      setStep('error')
      setErrorMessage('Erro ao validar convite')
    }
  }

  const acceptInvitationExisting = async () => {
    if (!token) return

    try {
      const res = await fetch('/api/v1/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      })
      const data = await res.json()

      if (res.ok && data.data) {
        setStep('success')
        toast.success('Convite aceito com sucesso!')
        setTimeout(() => { window.location.href = '/projetos' }, 2000)
      } else {
        setStep('error')
        setErrorMessage(data.message || 'Erro ao aceitar convite')
        toast.error('Erro ao aceitar convite')
      }
    } catch (error: unknown) {
      setStep('error')
      setErrorMessage('Erro ao aceitar convite')
      toast.error('Erro ao aceitar convite')
    }
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || name.trim().length < 2) {
      toast.error('Nome deve ter pelo menos 2 caracteres')
      return
    }

    if (!token) return

    try {
      const res = await fetch('/api/v1/invitations/accept/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token, name: name.trim() }),
      })
      const data = await res.json()

      if (res.ok && data.data) {
        setStep('success')
        toast.success('Conta criada! Entrando na plataforma...')
        // Hard redirect — força releitura do JWT cookie com o novo usuário
        // (client-side router.push manteria o contexto de auth da sessão anterior)
        setTimeout(() => { window.location.href = '/projetos' }, 1500)
      } else {
        const errorMsg = data.message || 'Erro ao criar conta'
        setErrorMessage(errorMsg)
        toast.error(errorMsg)
      }
    } catch (error: unknown) {
      const errorMsg = 'Erro ao criar conta'
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
              <div className="bg-muted/50 p-4 rounded-lg border border-border/50 space-y-2">
                <p className="text-sm font-medium">
                  Você foi convidado para <strong>{inviteData.organizationName}</strong>
                </p>
                <p className="text-xs text-muted-foreground">
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
                  <Label htmlFor="name">Como você quer ser chamado? *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    autoFocus
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Ao aceitar, você entrará automaticamente na plataforma.
              </p>

              <Button
                type="submit"
                className="w-full bg-theme-primary hover:bg-theme-primary-hover"
                size="lg"
                disabled={!name.trim()}
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Criar Conta e Entrar
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
                  {hasAccount ? 'Convite aceito!' : 'Conta criada! Entrando na plataforma...'}
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

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <AcceptInvitationContent />
    </Suspense>
  )
}
