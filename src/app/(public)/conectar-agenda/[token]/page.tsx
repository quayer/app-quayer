'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/client/components/ui/button';
import { Card, CardContent } from '@/client/components/ui/card';
import { Badge } from '@/client/components/ui/badge';
import { Skeleton } from '@/client/components/ui/skeleton';
import { Alert, AlertDescription } from '@/client/components/ui/alert';
import {
  CalendarCheck,
  CalendarClock,
  Clock,
  RefreshCw,
  CheckCircle,
  Loader2,
  PartyPopper,
  Building2,
  Shield,
  ShieldCheck,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Ícone Google "G" SVG — acessível (decorativo).
const GoogleIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    role="img"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

interface CalendarConnectPageProps {
  token: string;
}

type ConnectState = 'pending' | 'connected' | 'expired';

interface CalendarConnectData {
  /** Estado do convite/link de conexão. */
  state: ConnectState;
  /** Nome da organização que solicitou a conexão. */
  organizationName: string;
  /** Email da conta Google já conectada (quando state === 'connected'). */
  calendarEmail?: string;
  /** Epoch ms de expiração do link (opcional). */
  expiresAt?: number;
}

/**
 * Skeleton de carregamento — espelha o padrão de design system usado em
 * compartilhar/[token]/page.tsx (estado de loading acessível).
 */
function CalendarConnectSkeleton() {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      role="status"
      aria-label="Carregando página de conexão da agenda"
      aria-busy="true"
    >
      <div className="w-full max-w-md space-y-8">
        {/* Logo skeleton */}
        <div className="flex justify-center">
          <Skeleton className="h-10 w-40" />
        </div>

        {/* Badge org skeleton */}
        <div className="flex justify-center">
          <Skeleton className="h-8 w-48 rounded-full" />
        </div>

        {/* Card skeleton */}
        <Card className="border-border">
          <div className="p-8 space-y-6">
            <div className="flex justify-center">
              <Skeleton className="h-20 w-20 rounded-full" />
            </div>
            <Skeleton className="h-6 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6 mx-auto" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>
      </div>
      <span className="sr-only">Carregando informações da conexão, aguarde...</span>
    </div>
  );
}

/**
 * Conteúdo principal da página pública de conexão da agenda Google Calendar.
 *
 * Fluxo:
 *  1. mount → GET /api/v1/calendar/connect/[token] → exibe org + estado
 *  2. botão "Conectar Google Calendar" → navega p/ /api/v1/calendar/connect/[token]/oauth/start
 *  3. retorno com ?connected=1 → tela de sucesso
 *  4. polling leve do status enquanto pendente
 *
 * Implementa WCAG 2.2 AA: região de anúncios aria-live, roles semânticos,
 * focus-visible em todos os controles, textos alternativos e hierarquia de headings.
 */
function CalendarConnectContent({ token }: CalendarConnectPageProps) {
  const searchParams = useSearchParams();
  const cameBackConnected = searchParams.get('connected') === '1';
  const oauthError = searchParams.get('error');

  const [data, setData] = useState<CalendarConnectData | null>(null);
  const [loading, setLoading] = useState(true);
  // Otimista: se voltou do OAuth com ?connected=1, já entra como conectado
  // e o fetch confirma logo em seguida.
  const [status, setStatus] = useState<ConnectState>(
    cameBackConnected ? 'connected' : 'pending'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const announcerRef = useRef<HTMLDivElement>(null);

  // Anuncia mudanças de status para leitores de tela.
  const announce = useCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = message;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchConnectData = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) setLoading(true);

        const response = await fetch(`/api/v1/calendar/connect/${token}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          if (response.status === 404 || response.status === 410) {
            setStatus('expired');
            stopPolling();
            announce('Link de conexão expirado ou não encontrado');
            return;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        const payload = result.data ?? result;

        const normalizedState: ConnectState =
          payload.state === 'connected'
            ? 'connected'
            : payload.state === 'expired'
              ? 'expired'
              : 'pending';

        const next: CalendarConnectData = {
          state: normalizedState,
          organizationName: payload.organizationName || 'Organização',
          calendarEmail: payload.calendarEmail,
          expiresAt: payload.expiresAt
            ? new Date(payload.expiresAt).getTime()
            : undefined,
        };

        setData(next);

        if (normalizedState === 'connected') {
          setStatus('connected');
          stopPolling();
          announce(
            next.calendarEmail
              ? `Agenda conectada com sucesso usando ${next.calendarEmail}`
              : 'Agenda conectada com sucesso'
          );
        } else if (normalizedState === 'expired') {
          setStatus('expired');
          stopPolling();
          announce('Link de conexão expirado');
        } else {
          // Mantém status otimista 'connected' só se o backend confirmar;
          // caso contrário volta a pending.
          if (!cameBackConnected) setStatus('pending');
        }
      } catch (error) {
        console.error('Erro ao carregar conexão da agenda:', error);
        // Só derruba para expirado no carregamento inicial; em polls
        // silenciosos preserva a tela atual para não piscar erro.
        if (showLoading) {
          setStatus('expired');
          setErrorMessage(
            error instanceof Error ? error.message : 'Erro ao carregar dados'
          );
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [token, cameBackConnected, announce, stopPolling]
  );

  // Carga inicial.
  useEffect(() => {
    fetchConnectData();
  }, [fetchConnectData]);

  // Polling leve do status enquanto pendente (a cada 5s).
  useEffect(() => {
    if (status !== 'pending') {
      stopPolling();
      return;
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(() => fetchConnectData(false), 5000);
    }
    return () => stopPolling();
  }, [status, fetchConnectData, stopPolling]);

  // Anuncia erro retornado pelo OAuth na querystring.
  useEffect(() => {
    if (oauthError) {
      announce('A autorização do Google falhou. Tente novamente.');
    }
  }, [oauthError, announce]);

  // Navega para o endpoint server-side que inicia o OAuth do Google.
  // É uma navegação de página inteira (top-level) — não fetch — porque o
  // endpoint responde com redirect 302 para accounts.google.com.
  const handleConnect = () => {
    setRedirecting(true);
    announce('Redirecionando para o Google para autorização, aguarde');
    window.location.href = `/api/v1/calendar/connect/${token}/oauth/start`;
  };

  // === LOADING STATE ===
  if (loading) {
    return <CalendarConnectSkeleton />;
  }

  // === EXPIRED / ERROR STATE ===
  if (!data || status === 'expired') {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        role="main"
        aria-labelledby="expired-title"
      >
        <Card className="w-full max-w-md border-border shadow-lg">
          <CardContent className="p-8 text-center">
            <div
              className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6"
              aria-hidden="true"
            >
              <CalendarClock className="h-12 w-12 text-destructive" />
            </div>
            <h1
              id="expired-title"
              className="text-2xl font-bold text-foreground mb-3"
            >
              Link Expirado
            </h1>
            <p className="text-muted-foreground mb-8">
              {errorMessage
                ? errorMessage
                : 'Este link para conectar a agenda expirou ou não existe mais. Solicite um novo link ao administrador.'}
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Tentar Novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === CONNECTED STATE ===
  if (status === 'connected') {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        role="main"
        aria-labelledby="connected-title"
      >
        {/* Região de anúncios para leitores de tela */}
        <div
          ref={announcerRef}
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        />
        <Card className="w-full max-w-md border-border shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 text-center">
            <div
              className="w-24 h-24 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mx-auto mb-4"
              aria-hidden="true"
            >
              <PartyPopper className="h-12 w-12 text-white" />
            </div>
            <h1 id="connected-title" className="text-2xl font-bold text-white">
              Agenda conectada com sucesso!
            </h1>
          </div>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-6">
              Sua agenda do Google foi conectada a{' '}
              <strong className="text-foreground">
                {data.organizationName}
              </strong>
              .
            </p>
            {data.calendarEmail && (
              <div
                className="bg-green-500/10 rounded-2xl p-5 mb-6 border border-green-500/30"
                role="status"
                aria-label={`Conta conectada: ${data.calendarEmail}`}
              >
                <div className="flex items-center justify-center gap-3 text-green-600 dark:text-green-400">
                  <Mail className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="font-semibold text-lg break-all">
                    {data.calendarEmail}
                  </span>
                </div>
              </div>
            )}
            <Alert className="bg-muted/50 text-left">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <AlertDescription>
                Você pode fechar esta página com segurança.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === MAIN / PENDING VIEW ===
  return (
    <div className="min-h-screen bg-background">
      {/* Região de anúncios para leitores de tela */}
      <div
        ref={announcerRef}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />

      <main
        className="container mx-auto px-4 py-8 max-w-md flex flex-col min-h-screen"
        role="main"
        aria-labelledby="page-title"
      >
        {/* Header com Logo e Contexto */}
        <header className="text-center mb-8 space-y-4 pt-4">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={160}
              height={40}
              priority
              className="dark:brightness-0 dark:invert"
            />
          </div>

          {/* Contexto — Organização */}
          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="gap-2 py-1.5 px-4">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{data.organizationName}</span>
            </Badge>
          </div>

          <h1 id="page-title" className="text-2xl font-bold text-foreground">
            Conectar Google Calendar
          </h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Autorize o acesso à sua agenda do Google para que{' '}
            <strong className="text-foreground">
              {data.organizationName}
            </strong>{' '}
            possa agendar e gerenciar compromissos em seu nome.
          </p>
        </header>

        {/* Erro de OAuth (retorno com ?error=) */}
        {oauthError && (
          <Alert
            variant="destructive"
            className="mb-6"
            role="alert"
          >
            <AlertDescription>
              A autorização do Google não foi concluída. Por favor, tente
              novamente.
            </AlertDescription>
          </Alert>
        )}

        {/* Card de conexão */}
        <Card className="border-border shadow-lg overflow-hidden mb-6">
          <CardContent className="p-8 space-y-6">
            <div className="flex justify-center">
              <div
                className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center"
                aria-hidden="true"
              >
                <CalendarCheck className="h-10 w-10 text-primary" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="font-semibold text-lg text-foreground">
                Acesso à sua agenda
              </h2>
              <p className="text-sm text-muted-foreground">
                Você será redirecionado para o Google para revisar e autorizar
                as permissões. Pode revogar o acesso quando quiser.
              </p>
            </div>

            <Button
              onClick={handleConnect}
              disabled={redirecting}
              className="w-full h-12 gap-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Conectar Google Calendar — abrir autorização do Google"
            >
              {redirecting ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <GoogleIcon className="h-5 w-5" />
              )}
              {redirecting ? 'Redirecionando...' : 'Conectar Google Calendar'}
            </Button>

            {/* Status de aguardando (polling) */}
            <div
              className="flex items-center justify-center gap-3 p-4 bg-primary/10 rounded-xl border border-primary/20"
              role="status"
              aria-live="polite"
            >
              <div
                className="w-3 h-3 bg-primary rounded-full animate-pulse"
                aria-hidden="true"
              />
              <span className="text-sm text-primary font-medium">
                Aguardando autorização...
              </span>
            </div>
          </CardContent>
        </Card>

        {/* O que será permitido */}
        <section
          className="space-y-3 mb-8"
          aria-labelledby="permissions-title"
        >
          <h2
            id="permissions-title"
            className="text-sm font-semibold text-foreground text-center"
          >
            O que você está autorizando
          </h2>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-3 text-sm text-muted-foreground">
              <CalendarCheck
                className="h-4 w-4 mt-0.5 text-primary shrink-0"
                aria-hidden="true"
              />
              <span>Criar e gerenciar eventos na sua agenda do Google.</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-muted-foreground">
              <Clock
                className="h-4 w-4 mt-0.5 text-primary shrink-0"
                aria-hidden="true"
              />
              <span>Verificar horários livres para evitar conflitos.</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-muted-foreground">
              <ShieldCheck
                className="h-4 w-4 mt-0.5 text-primary shrink-0"
                aria-hidden="true"
              />
              <span>
                Você pode revogar o acesso a qualquer momento na sua Conta
                Google.
              </span>
            </li>
          </ul>
        </section>

        {/* Aviso de segurança + footer (empurrados p/ baixo) */}
        <div className="mt-auto">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Conexão segura e criptografada</span>
          </div>
          <footer className="mt-4 text-center">
            <p className="text-muted-foreground/60 text-sm">
              Powered by{' '}
              <strong className="text-muted-foreground">
                {data.organizationName}
              </strong>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}

/**
 * Página pública de conexão de agenda Google Calendar.
 *
 * Sem login (rota liberada em PUBLIC_PATHS no middleware).
 * Espelha compartilhar/[token]/page.tsx: estados loading/erro/expirado/sucesso,
 * DS v3 tokens e WCAG 2.2 AA.
 */
export default function CalendarConnectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    params.then(({ token }) => setToken(token));
  }, [params]);

  if (!token) {
    return <CalendarConnectSkeleton />;
  }

  // useSearchParams (dentro de CalendarConnectContent) exige Suspense boundary
  // sob o App Router do Next 16; o fallback reusa o skeleton acessível.
  return (
    <Suspense fallback={<CalendarConnectSkeleton />}>
      <CalendarConnectContent token={token} />
    </Suspense>
  );
}
