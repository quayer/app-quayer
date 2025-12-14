"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Image from "next/image";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/igniter.client";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'password'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Digite seu e-mail');
      return;
    }

    // Avançar para step de senha
    setStep('password');
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { data } = await api.auth.login.mutate({
        body: { email, password }
      });

      const loginData = data as any
      if (loginData?.accessToken) {
        localStorage.setItem('accessToken', loginData.accessToken);
        if (loginData.refreshToken) {
          localStorage.setItem('refreshToken', loginData.refreshToken);
        }

        // Redirecionar baseado no role
        const userRole = loginData.user?.role;
        if (userRole === 'admin') {
          router.push('/admin');
        } else {
          router.push('/integracoes');
        }
        router.refresh();
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || 'Credenciais inválidas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setPassword('');
    setError('');
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError('');
    try {
      const { data, error: apiError } = await api.auth.googleAuth.query();

      if (apiError) {
        setError('Erro ao iniciar autenticação com Google');
        setIsGoogleLoading(false);
        return;
      }

      if (data?.authUrl) {
        // Redirecionar para Google OAuth
        window.location.href = data.authUrl;
        // Mantém loading=true pois está redirecionando
      } else {
        setError('Erro ao obter URL de autenticação do Google');
        setIsGoogleLoading(false);
      }
    } catch (error) {
      console.error("Error logging in with Google:", error);
      setError('Erro ao conectar com Google. Tente novamente.');
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={step === 'email' ? handleEmailSubmit : handlePasswordSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a
              href="#"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex items-center justify-center">
                <Image
                  src="/logo.svg"
                  alt="Quayer Logo"
                  width={160}
                  height={38}
                  style={{ filter: 'brightness(0) invert(1)' }}
                />
              </div>
              <span className="sr-only">Quayer</span>
            </a>
            <FieldDescription className="mt-4">
              Não tem uma conta? <a href="/signup" className="underline underline-offset-4 hover:text-primary">Cadastre-se</a>
            </FieldDescription>
          </div>

          {error && (
            <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
              <AlertDescription className="text-red-200">{error}</AlertDescription>
            </Alert>
          )}

          {step === 'email' ? (
            <>
              <Field>
                <FieldLabel htmlFor="email">E-mail</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </Field>
              <Field>
                <Button type="submit" className="w-full">Continuar</Button>
              </Field>
              <FieldSeparator>Ou</FieldSeparator>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full"
                  disabled={isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Conectando ao Google...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="mr-2 size-4">
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      Continuar com Google
                    </>
                  )}
                </Button>
              </Field>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToEmail}
                  className="gap-2 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {email}
                </Button>
              </div>
              <Field>
                <div className="flex items-center justify-between mb-2">
                  <FieldLabel htmlFor="password">Senha</FieldLabel>
                  <a href="/forgot-password" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary">
                    Esqueci minha senha
                  </a>
                </div>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </Field>
              <Field>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    'Entrar'
                  )}
                </Button>
              </Field>
            </>
          )}
        </FieldGroup>
      </form>
      <FieldDescription className="px-6 text-center text-xs">
        Ao continuar, você concorda com nossos <a href="/termos" className="underline underline-offset-4 hover:text-primary">Termos de Serviço</a>{" "}
        e <a href="/privacidade" className="underline underline-offset-4 hover:text-primary">Política de Privacidade</a>.
      </FieldDescription>
    </div>
  )
}
