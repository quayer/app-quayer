'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  UserPlus,
  LogIn,
  ArrowRight,
  AlertTriangle,
  Mail,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/igniter.client';
import { useAuth } from '@/lib/auth/auth-provider';

interface InvitationData {
  email: string;
  role: string;
  expiresAt: string;
  organizationName: string;
}

type PageState = 'loading' | 'valid' | 'invalid' | 'expired' | 'used' | 'accepting' | 'success';

export default function ConnectPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const token = searchParams.get('token');

  const [state, setState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form state for new users
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    confirmPassword: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setState('invalid');
      setErrorMessage('Token de convite nao fornecido');
      return;
    }

    validateToken(token);
  }, [token]);

  const validateToken = async (tokenValue: string) => {
    setState('loading');
    try {
      const response = await fetch(`/api/v1/invitations/validate/${tokenValue}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setState('invalid');
          setErrorMessage('Convite nao encontrado');
        } else if (result.message?.includes('expirou') || result.error?.includes('expirou')) {
          setState('expired');
          setErrorMessage('Este convite expirou');
        } else if (result.message?.includes('utilizado') || result.error?.includes('utilizado')) {
          setState('used');
          setErrorMessage('Este convite ja foi utilizado');
        } else {
          setState('invalid');
          setErrorMessage(result.message || result.error || 'Convite invalido');
        }
        return;
      }

      const data = result.data || result;
      setInvitation(data.invitation);
      setHasAccount(data.hasAccount);
      setState('valid');
    } catch (error) {
      console.error('Error validating token:', error);
      setState('invalid');
      setErrorMessage('Erro ao validar convite');
    }
  };

  const handleAcceptExisting = async () => {
    if (!token) return;

    setState('accepting');
    try {
      const response = await fetch('/api/v1/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || result.error || 'Erro ao aceitar convite');
        setState('valid');
        return;
      }

      toast.success('Convite aceito com sucesso!');
      setState('success');

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        window.location.href = '/integracoes';
      }, 2000);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      toast.error('Erro ao aceitar convite');
      setState('valid');
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name || formData.name.trim().length < 2) {
      errors.name = 'Nome deve ter pelo menos 2 caracteres';
    }

    if (!formData.password || formData.password.length < 8) {
      errors.password = 'Senha deve ter pelo menos 8 caracteres';
    } else {
      if (!/[A-Z]/.test(formData.password)) {
        errors.password = 'Senha deve conter pelo menos uma letra maiuscula';
      } else if (!/[a-z]/.test(formData.password)) {
        errors.password = 'Senha deve conter pelo menos uma letra minuscula';
      } else if (!/[0-9]/.test(formData.password)) {
        errors.password = 'Senha deve conter pelo menos um numero';
      }
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'As senhas nao coincidem';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAcceptNew = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !token) return;

    setState('accepting');
    try {
      const response = await fetch('/api/v1/invitations/accept/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          name: formData.name.trim(),
          password: formData.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || result.error || 'Erro ao criar conta');
        setState('valid');
        return;
      }

      toast.success('Conta criada e convite aceito!');
      setState('success');

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login?email=' + encodeURIComponent(invitation?.email || ''));
      }, 2000);
    } catch (error) {
      console.error('Error creating account:', error);
      toast.error('Erro ao criar conta');
      setState('valid');
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'master':
        return <Badge className="bg-purple-500">Proprietario</Badge>;
      case 'manager':
        return <Badge className="bg-blue-500">Gerente</Badge>;
      default:
        return <Badge variant="secondary">Usuario</Badge>;
    }
  };

  // Loading state
  if (state === 'loading' || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Validando convite...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error states
  if (state === 'invalid' || state === 'expired' || state === 'used') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              {state === 'expired' ? (
                <div className="rounded-full bg-yellow-500/20 p-4">
                  <Clock className="h-12 w-12 text-yellow-500" />
                </div>
              ) : state === 'used' ? (
                <div className="rounded-full bg-blue-500/20 p-4">
                  <CheckCircle2 className="h-12 w-12 text-blue-500" />
                </div>
              ) : (
                <div className="rounded-full bg-destructive/20 p-4">
                  <XCircle className="h-12 w-12 text-destructive" />
                </div>
              )}
            </div>
            <CardTitle className="text-2xl">
              {state === 'expired'
                ? 'Convite Expirado'
                : state === 'used'
                  ? 'Convite Ja Utilizado'
                  : 'Convite Invalido'}
            </CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {state === 'expired' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Entre em contato com quem te convidou para solicitar um novo convite.
                </AlertDescription>
              </Alert>
            )}
            {state === 'used' && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Voce ja faz parte desta organizacao. Faca login para acessar.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link href="/login">
                  <LogIn className="h-4 w-4 mr-2" />
                  Ir para Login
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">Voltar ao Inicio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <div className="rounded-full bg-green-500/20 p-4">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
              </div>
            </div>
            <CardTitle className="text-2xl">Bem-vindo!</CardTitle>
            <CardDescription>
              Voce agora faz parte de {invitation?.organizationName}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">Redirecionando...</p>
            <Loader2 className="h-6 w-6 animate-spin mx-auto mt-4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valid invitation - show accept flow
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <div className="rounded-full bg-primary/20 p-4">
              <UserPlus className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Voce foi convidado!</CardTitle>
          <CardDescription>
            Para fazer parte de uma organizacao no Quayer
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Invitation Details */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Organizacao</p>
                <p className="font-semibold">{invitation?.organizationName}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-mono text-sm">{invitation?.email}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Funcao</p>
                {getRoleBadge(invitation?.role || 'user')}
              </div>
            </div>
          </div>

          {/* Accept Flow */}
          {hasAccount ? (
            // User has account - check if logged in
            user ? (
              // Already logged in - just accept
              <div className="space-y-4">
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Voce esta logado como <strong>{user.email}</strong>
                  </AlertDescription>
                </Alert>

                {user.email?.toLowerCase() === invitation?.email.toLowerCase() ? (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleAcceptExisting}
                    disabled={state === 'accepting'}
                  >
                    {state === 'accepting' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Aceitando...
                      </>
                    ) : (
                      <>
                        Aceitar Convite
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                ) : (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Este convite e para <strong>{invitation?.email}</strong>, mas voce esta
                      logado como <strong>{user.email}</strong>. Faca logout e entre com a conta
                      correta.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              // Not logged in - prompt to login
              <div className="space-y-4">
                <Alert>
                  <LogIn className="h-4 w-4" />
                  <AlertDescription>
                    Ja existe uma conta com este email. Faca login para aceitar o convite.
                  </AlertDescription>
                </Alert>
                <Button className="w-full" size="lg" asChild>
                  <Link href={`/login?email=${encodeURIComponent(invitation?.email || '')}&redirect=/connect?token=${token}`}>
                    <LogIn className="h-4 w-4 mr-2" />
                    Fazer Login
                  </Link>
                </Button>
              </div>
            )
          ) : (
            // New user - show signup form
            <form onSubmit={handleAcceptNew} className="space-y-4">
              <Alert>
                <UserPlus className="h-4 w-4" />
                <AlertDescription>
                  Crie sua conta para aceitar o convite
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="name">Seu Nome</Label>
                <Input
                  id="name"
                  placeholder="Como voce quer ser chamado"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={state === 'accepting'}
                />
                {formErrors.name && (
                  <p className="text-sm text-destructive">{formErrors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimo 8 caracteres"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={state === 'accepting'}
                />
                {formErrors.password && (
                  <p className="text-sm text-destructive">{formErrors.password}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Deve conter maiuscula, minuscula e numero
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Digite a senha novamente"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  disabled={state === 'accepting'}
                />
                {formErrors.confirmPassword && (
                  <p className="text-sm text-destructive">{formErrors.confirmPassword}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={state === 'accepting'}
              >
                {state === 'accepting' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  <>
                    Criar Conta e Aceitar
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground">
            {hasAccount ? (
              <p>
                Nao tem conta?{' '}
                <Link href="/signup" className="text-primary hover:underline">
                  Criar conta
                </Link>
              </p>
            ) : (
              <p>
                Ja tem uma conta?{' '}
                <Link href={`/login?email=${encodeURIComponent(invitation?.email || '')}`} className="text-primary hover:underline">
                  Fazer login
                </Link>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
