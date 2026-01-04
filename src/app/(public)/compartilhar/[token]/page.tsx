'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Clock,
  RefreshCw,
  CheckCircle,
  Copy,
  QrCode,
  Wifi,
  Loader2,
  PartyPopper,
  KeyRound,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SharePageProps {
  token: string;
}

interface InstanceData {
  id: string;
  name: string;
  status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'connecting' | 'connected' | 'disconnected';
  phoneNumber?: string;
  profileName?: string;
  qrCode?: string;
  pairingCode?: string;
  expiresAt: Date;
  organizationName: string;
}

/**
 * Skeleton loading para a página de compartilhamento
 * Segue padrão de design system para estados de carregamento
 */
function SharePageSkeleton() {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      role="status"
      aria-label="Carregando página de conexão"
      aria-busy="true"
    >
      <div className="w-full max-w-2xl space-y-8">
        {/* Logo skeleton */}
        <div className="flex justify-center">
          <Skeleton className="h-10 w-40" />
        </div>

        {/* Timer skeleton */}
        <div className="flex justify-center">
          <Skeleton className="h-10 w-48 rounded-full" />
        </div>

        {/* Card skeleton */}
        <Card className="border-border">
          <div className="p-6 space-y-6">
            {/* Tabs skeleton */}
            <div className="flex gap-2">
              <Skeleton className="h-12 flex-1" />
              <Skeleton className="h-12 flex-1" />
            </div>

            {/* QR Code skeleton */}
            <div className="flex justify-center">
              <Skeleton className="w-64 h-64 rounded-xl" />
            </div>

            {/* Button skeleton */}
            <Skeleton className="h-12 w-full" />

            {/* Status skeleton */}
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        </Card>

        {/* Instructions skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
      <span className="sr-only">Carregando informações da conexão, aguarde...</span>
    </div>
  );
}

/**
 * Componente principal de conteúdo da página de compartilhamento
 * Implementa todas as melhores práticas de UX, UI, usabilidade e WCAG 2.1
 */
function SharePageContent({ token }: SharePageProps) {
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'waiting' | 'connecting' | 'connected' | 'expired'>('waiting');
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const announcerRef = useRef<HTMLDivElement>(null);

  // Função para anunciar mudanças de status para leitores de tela
  const announce = useCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = message;
    }
  }, []);

  const normalizeStatus = (status: string): 'connecting' | 'connected' | 'disconnected' => {
    const normalized = status.toLowerCase();
    if (normalized === 'connected') return 'connected';
    if (normalized === 'connecting') return 'connecting';
    return 'disconnected';
  };

  // Máscara de telefone para melhor usabilidade
  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 2)} ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `${numbers.slice(0, 2)} ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `${numbers.slice(0, 2)} ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const fetchInstanceData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      const response = await fetch(`/api/v1/instances/share/${token}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setConnectionStatus('expired');
          announce('Link de conexão expirado ou não encontrado');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const data = result.data || result;

      if (data && (data.id || data.name)) {
        const instanceData: InstanceData = {
          id: data.id,
          name: data.name,
          status: normalizeStatus(data.status || 'connecting'),
          phoneNumber: data.phoneNumber,
          profileName: data.profileName || data.name,
          qrCode: data.qrCode,
          pairingCode: data.pairingCode,
          expiresAt: new Date(data.expiresAt || Date.now() + 3600000),
          organizationName: data.organizationName || 'Organização'
        };

        setInstance(instanceData);
        const remaining = Math.max(0, Math.floor((instanceData.expiresAt.getTime() - Date.now()) / 1000));
        setTimeLeft(remaining);

        // Só considera conectado se tiver status connected E phoneNumber
        // Isso evita mostrar "conectado" quando a instância existe mas o usuário não escaneou
        const isReallyConnected = normalizeStatus(data.status) === 'connected' && data.phoneNumber;

        if (isReallyConnected) {
          setConnectionStatus('connected');
          announce('WhatsApp conectado com sucesso!');
          if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
          }
        } else if (remaining <= 0) {
          setConnectionStatus('expired');
          announce('Link de conexão expirado');
        } else {
          setConnectionStatus('waiting');
        }
      } else if (result.error) {
        throw new Error(result.error.message || result.error || 'Erro ao carregar dados');
      } else {
        throw new Error('Token inválido ou instância não encontrada');
      }
    } catch (error) {
      console.error('Erro ao carregar instância:', error);
      if (showLoading) setConnectionStatus('expired');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token, pollInterval, announce]);

  useEffect(() => {
    fetchInstanceData();
  }, [fetchInstanceData]);

  useEffect(() => {
    if (connectionStatus === 'waiting' && !pollInterval) {
      const interval = setInterval(() => fetchInstanceData(false), 5000);
      setPollInterval(interval);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connectionStatus, pollInterval, fetchInstanceData]);

  useEffect(() => {
    if (timeLeft <= 0 && connectionStatus !== 'connected') {
      setConnectionStatus('expired');
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1 && connectionStatus !== 'connected') {
          setConnectionStatus('expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, connectionStatus]);

  // Alerta quando timer está acabando
  useEffect(() => {
    if (timeLeft === 300) {
      announce('Atenção: 5 minutos restantes para a expiração do link');
    } else if (timeLeft === 60) {
      announce('Atenção: 1 minuto restante para a expiração do link');
    }
  }, [timeLeft, announce]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${secs}s`;
  };

  // Determina o estado visual do timer
  const getTimerState = () => {
    if (timeLeft <= 60) return 'critical'; // Vermelho - menos de 1 minuto
    if (timeLeft <= 300) return 'warning'; // Amarelo - menos de 5 minutos
    return 'normal'; // Verde - normal
  };

  const timerState = getTimerState();

  const handleRefreshQR = async () => {
    try {
      toast.info('Gerando novo QR Code...');
      setRefreshing(true);
      announce('Gerando novo QR Code, aguarde');

      const response = await fetch(`/api/v1/instances/share/${token}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = 'Erro ao gerar QR Code';
        if (typeof errorData.message === 'string') {
          errorMessage = errorData.message;
        } else if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const data = result.data || result;

      const newExpiresAt = new Date(data.expiresAt || Date.now() + 3600000);
      setInstance(prev => prev ? {
        ...prev,
        qrCode: data.qrCode || prev.qrCode,
        expiresAt: newExpiresAt
      } : null);
      setTimeLeft(Math.floor((newExpiresAt.getTime() - Date.now()) / 1000));
      setConnectionStatus('waiting');

      if (data.qrCode) {
        toast.success('Novo QR Code gerado!');
        announce('Novo QR Code gerado com sucesso');
      } else {
        toast.warning('QR Code ainda não disponível. A instância pode estar inicializando.');
        announce('QR Code não disponível, tente novamente em alguns segundos');
      }
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
      const message = error instanceof Error ? error.message : 'Erro ao gerar QR Code';
      toast.error(message);
      announce(`Erro: ${message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const handleGeneratePairingCode = async () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      toast.error('Digite um número de telefone válido com DDD');
      return;
    }

    try {
      setGeneratingCode(true);
      toast.info('Gerando código de pareamento...');
      announce('Gerando código de pareamento, aguarde');

      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      const response = await fetch(`/api/v1/instances/share/${token}/pairing-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 409) {
          toast.error(
            'Já existe uma conexão em andamento. Aguarde 30 segundos ou use o QR Code.',
            { duration: 6000 }
          );
          setConnectionMode('qr');
          announce('Conexão em andamento, use o QR Code');
          return;
        }

        let errorMessage = 'Erro ao gerar código';
        if (typeof errorData.message === 'string') {
          errorMessage = errorData.message;
        } else if (typeof errorData.error === 'string') {
          errorMessage = errorData.error;
        } else if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.data?.message) {
          errorMessage = errorData.data.message;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      const data = result.data || result;

      // Verificar se a instância já está conectada
      if (data.alreadyConnected || data.status === 'connected') {
        toast.success('Esta instância já está conectada!');
        setConnectionStatus('connected');
        announce('Instância já conectada');
        return;
      }

      if (data && data.pairingCode) {
        setPairingCode(data.pairingCode);
        toast.success('Código de pareamento gerado!');
        announce(`Código de pareamento gerado: ${data.pairingCode.split('').join(' ')}`);
      } else {
        throw new Error('Código não foi gerado. Tente usar o QR Code.');
      }
    } catch (error) {
      console.error('Erro ao gerar código de pareamento:', error);
      const message = error instanceof Error ? error.message : 'Erro ao gerar código';

      // Detectar se a instância já está conectada pela mensagem de erro
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('conectada') || lowerMsg.includes('connected')) {
        toast.success('Esta instância já está conectada!');
        setConnectionStatus('connected');
        announce('Instância já conectada');
        return;
      }

      if (message.toLowerCase().includes('conflict') || message.toLowerCase().includes('em andamento')) {
        toast.error('Aguarde alguns segundos e tente novamente, ou use o QR Code.', { duration: 5000 });
        setConnectionMode('qr');
      } else if (message.toLowerCase().includes('não disponível') || message.toLowerCase().includes('unavailable')) {
        toast.error('Código de pareamento não disponível no momento. Use o QR Code.', { duration: 5000 });
        setConnectionMode('qr');
      } else {
        toast.error(message);
      }
      announce(`Erro: ${message}`);
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleCopyCode = async () => {
    if (pairingCode) {
      try {
        await navigator.clipboard.writeText(pairingCode);
        setCopied(true);
        toast.success('Código copiado para a área de transferência!');
        announce('Código copiado');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error('Erro ao copiar código');
        announce('Erro ao copiar código');
      }
    }
  };

  // === LOADING STATE ===
  if (loading) {
    return <SharePageSkeleton />;
  }

  // === EXPIRED STATE ===
  if (!instance || connectionStatus === 'expired') {
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
              <Clock className="h-12 w-12 text-destructive" />
            </div>
            <h1
              id="expired-title"
              className="text-2xl font-bold text-foreground mb-3"
            >
              Link Expirado
            </h1>
            <p className="text-muted-foreground mb-8">
              Este link de conexão expirou ou não existe mais.
              Solicite um novo link ao administrador.
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="gap-2"
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
  if (connectionStatus === 'connected') {
    return (
      <div
        className="min-h-screen bg-background flex items-center justify-center p-4"
        role="main"
        aria-labelledby="connected-title"
      >
        <Card className="w-full max-w-md border-border shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 text-center">
            <div
              className="w-24 h-24 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mx-auto mb-4"
              aria-hidden="true"
            >
              <PartyPopper className="h-12 w-12 text-white" />
            </div>
            <h1
              id="connected-title"
              className="text-2xl font-bold text-white"
            >
              Conectado com Sucesso!
            </h1>
          </div>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-6">
              Seu WhatsApp foi conectado a{' '}
              <strong className="text-foreground">{instance.organizationName}</strong>
            </p>
            {instance.phoneNumber && (
              <div
                className="bg-green-500/10 rounded-2xl p-5 mb-6 border border-green-500/30"
                role="status"
                aria-label={`Número conectado: ${instance.phoneNumber}`}
              >
                <div className="flex items-center justify-center gap-3 text-green-600 dark:text-green-400 mb-2">
                  <Wifi className="h-6 w-6" aria-hidden="true" />
                  <span className="font-semibold text-xl">{instance.phoneNumber}</span>
                </div>
                {instance.profileName && (
                  <p className="text-green-600/70 dark:text-green-400/70">{instance.profileName}</p>
                )}
              </div>
            )}
            <Alert className="bg-muted/50">
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

  // === MAIN CONNECTION VIEW ===
  const progressValue = (timeLeft / 3600) * 100; // Assumindo 1h de expiração

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
        className="container mx-auto px-4 py-8 max-w-2xl"
        role="main"
        aria-labelledby="page-title"
      >
        {/* Header com Logo e Contexto */}
        <header className="text-center mb-8 space-y-4">
          {/* Logo */}
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

          {/* Contexto - Organização */}
          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="gap-2 py-1.5 px-4">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{instance.organizationName}</span>
            </Badge>
          </div>

          {/* Título acessível */}
          <h1
            id="page-title"
            className="text-2xl font-bold text-foreground"
          >
            Conectar WhatsApp
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Escaneie o QR Code ou use o código de pareamento para conectar
            seu WhatsApp à plataforma.
          </p>
        </header>

        {/* Timer Badge com estados visuais */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <Badge
            variant="outline"
            className={cn(
              "px-4 py-2 gap-2 text-sm font-medium transition-colors",
              timerState === 'normal' && "bg-primary/10 border-primary/30 text-primary",
              timerState === 'warning' && "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
              timerState === 'critical' && "bg-destructive/10 border-destructive/30 text-destructive animate-pulse"
            )}
            role="timer"
            aria-label={`Tempo restante: ${formatTime(timeLeft)}`}
          >
            {timerState === 'critical' ? (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Clock className="h-4 w-4" aria-hidden="true" />
            )}
            Expira em: <strong>{formatTime(timeLeft)}</strong>
          </Badge>

          {/* Barra de progresso visual */}
          <Progress
            value={progressValue}
            className={cn(
              "w-48 h-1.5",
              timerState === 'critical' && "[&>div]:bg-destructive",
              timerState === 'warning' && "[&>div]:bg-amber-500"
            )}
            aria-hidden="true"
          />
        </div>

        {/* Connection Options - Side by Side Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* QR Code Card */}
          <Card className="border-border shadow-lg overflow-hidden">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-lg">Escanear QR Code</CardTitle>
                  <CardDescription>Aponte a câmera do celular</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* QR Code */}
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-2xl shadow-lg border">
                  {instance.qrCode ? (
                    <img
                      src={instance.qrCode.startsWith('data:') ? instance.qrCode : `data:image/png;base64,${instance.qrCode}`}
                      alt={`QR Code para conectar ${instance.name} ao WhatsApp. Escaneie este código com seu celular.`}
                      className="w-48 h-48 object-contain"
                    />
                  ) : (
                    <div
                      className="w-48 h-48 bg-muted rounded-xl flex flex-col items-center justify-center text-muted-foreground"
                      role="status"
                      aria-label="QR Code ainda não disponível"
                    >
                      <QrCode className="h-12 w-12 mb-3 opacity-50" aria-hidden="true" />
                      <span className="text-sm mb-2">QR Code indisponível</span>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleRefreshQR}
                        className="text-primary"
                        aria-label="Gerar QR Code"
                      >
                        Clique para gerar
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleRefreshQR}
                disabled={refreshing}
                variant="outline"
                className="w-full"
                aria-label={refreshing ? 'Gerando novo QR Code...' : 'Atualizar QR Code'}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                {refreshing ? 'Gerando...' : 'Atualizar QR Code'}
              </Button>

              {/* Instruções compactas */}
              <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/30 rounded-lg">
                <p className="font-medium text-foreground mb-2">Como escanear:</p>
                <p>1. Abra o WhatsApp no celular</p>
                <p>2. Menu → Dispositivos conectados</p>
                <p>3. Conectar dispositivo → Escanear</p>
              </div>

              {/* Status */}
              <div
                className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20"
                role="status"
                aria-live="polite"
              >
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" aria-hidden="true" />
                <span className="text-xs text-primary font-medium">Aguardando escaneamento...</span>
              </div>
            </CardContent>
          </Card>

          {/* Pairing Code Card */}
          <Card className="border-border shadow-lg overflow-hidden">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-lg">Código de Pareamento</CardTitle>
                  <CardDescription>Digite o código no WhatsApp</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {!pairingCode ? (
                <>
                  {/* Input de telefone */}
                  <div className="space-y-3">
                    <Label htmlFor="phone" className="text-sm text-foreground">
                      Número do WhatsApp (com DDD)
                    </Label>
                    <div className="flex gap-2">
                      <div className="flex items-center px-3 bg-muted rounded-lg border border-input text-sm font-medium text-muted-foreground">
                        +55
                      </div>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="11 99999-9999"
                        value={phoneNumber}
                        onChange={handlePhoneChange}
                        className="flex-1"
                        aria-describedby="phone-help"
                        autoComplete="tel-national"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleGeneratePairingCode}
                    disabled={generatingCode || phoneNumber.replace(/\D/g, '').length < 10}
                    className="w-full"
                  >
                    {generatingCode ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" aria-hidden="true" />
                    )}
                    Gerar Código
                  </Button>

                  {/* Instruções compactas */}
                  <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/30 rounded-lg">
                    <p className="font-medium text-foreground mb-2">Como usar:</p>
                    <p>1. Gere o código acima</p>
                    <p>2. Menu → Dispositivos conectados</p>
                    <p>3. Conectar com número → Digite o código</p>
                  </div>
                </>
              ) : (
                <>
                  {/* Código gerado */}
                  <button
                    type="button"
                    className={cn(
                      "w-full bg-primary/10 border-2 border-primary/30 rounded-xl p-4 text-center cursor-pointer transition-all duration-200",
                      "hover:border-primary/50 hover:bg-primary/15",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      copied && "bg-green-500/10 border-green-500/50"
                    )}
                    onClick={handleCopyCode}
                    aria-label={`Código de pareamento: ${pairingCode}. Clique para copiar.`}
                  >
                    <p className="text-3xl font-mono font-bold tracking-[0.25em] text-primary" aria-hidden="true">
                      {pairingCode}
                    </p>
                    <p className="text-xs text-primary/70 mt-2 flex items-center justify-center gap-1">
                      {copied ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          Clique para copiar
                        </>
                      )}
                    </p>
                  </button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => { setPairingCode(null); setPhoneNumber(''); }}
                    >
                      Outro número
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={handleGeneratePairingCode}
                      disabled={generatingCode}
                    >
                      {generatingCode ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        'Novo código'
                      )}
                    </Button>
                  </div>

                  {/* Status */}
                  <div
                    className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" aria-hidden="true" />
                    <span className="text-xs text-primary font-medium">Aguardando pareamento...</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Security Notice */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Conexão segura e criptografada</span>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center">
          <p className="text-muted-foreground/60 text-sm">
            Powered by <strong className="text-muted-foreground">{instance.organizationName}</strong>
          </p>
        </footer>
      </main>
    </div>
  );
}

/**
 * Página de Compartilhamento de Conexão WhatsApp
 * 
 * Esta página permite que usuários conectem seu WhatsApp à plataforma
 * através de um link de compartilhamento seguro.
 * 
 * Implementa:
 * - Design System tokens para consistência visual
 * - WCAG 2.1 AA para acessibilidade
 * - UX otimizada com skeleton loading e feedback visual
 * - Jornada do usuário clara com instruções contextuais
 */
export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    params.then(({ token }) => setToken(token));
  }, [params]);

  if (!token) {
    return <SharePageSkeleton />;
  }

  return <SharePageContent token={token} />;
}
