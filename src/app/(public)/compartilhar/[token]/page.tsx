'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  ChevronDown,
  Smartphone,
  Monitor,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================================
// CONSTANTS
// ============================================================================

const EXPIRATION_TIMES = {
  QR_CODE: 120,           // 2 minutos em segundos (UZAPI)
  PAIRING_CODE: 120,      // 2 minutos em segundos (UZAPI)
  WARNING_THRESHOLD: 30,  // Mostrar warning quando < 30s
  CRITICAL_THRESHOLD: 10, // Mostrar crítico quando < 10s
  AUTO_REFRESH_BUFFER: 5, // Fazer refresh 5s antes de expirar
};

const POLLING_INTERVALS = {
  CONNECTION_STATUS: 5000, // 5s - verificar se conectou
};

// ============================================================================
// TYPES
// ============================================================================

type DeviceType = 'iphone' | 'android' | 'desktop';
type TimerState = 'normal' | 'warning' | 'critical' | 'refreshing';
type ConnectionMethod = 'pairing' | 'qr';

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

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook para detectar o tipo de dispositivo do usuário
 */
function useDeviceDetection(): DeviceType {
  const [device, setDevice] = useState<DeviceType>('desktop');

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(ua)) {
      setDevice('iphone');
    } else if (/android/.test(ua)) {
      setDevice('android');
    } else {
      setDevice('desktop');
    }
  }, []);

  return device;
}

/**
 * Hook para gerenciar o timer com estados visuais
 */
function useCodeTimer(initialTime: number, onExpire: () => void) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [timerState, setTimerState] = useState<TimerState>('normal');

  useEffect(() => {
    setTimeLeft(initialTime);
  }, [initialTime]);

  useEffect(() => {
    if (timeLeft <= 0) {
      setTimerState('refreshing');
      onExpire();
      return;
    }

    if (timeLeft <= EXPIRATION_TIMES.CRITICAL_THRESHOLD) {
      setTimerState('critical');
    } else if (timeLeft <= EXPIRATION_TIMES.WARNING_THRESHOLD) {
      setTimerState('warning');
    } else {
      setTimerState('normal');
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onExpire]);

  const resetTimer = useCallback((newTime: number) => {
    setTimeLeft(newTime);
    setTimerState('normal');
  }, []);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return { timeLeft, timerState, resetTimer, formatTime };
}

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Skeleton loading para a página de compartilhamento
 */
function SharePageSkeleton() {
  return (
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      role="status"
      aria-label="Carregando página de conexão"
      aria-busy="true"
    >
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-6 w-32 mx-auto" />
        <Card className="border-border">
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </Card>
      </div>
      <span className="sr-only">Carregando informações da conexão, aguarde...</span>
    </div>
  );
}

/**
 * Instruções contextuais baseadas no SO
 */
function InstructionsSteps({
  device,
  method,
  code
}: {
  device: DeviceType;
  method: ConnectionMethod;
  code?: string;
}) {
  const isIPhone = device === 'iphone';
  const isPairing = method === 'pairing';

  const steps = useMemo(() => {
    if (isPairing) {
      // Instruções para código de pareamento
      return [
        { step: 1, text: 'Abra o WhatsApp', hasAction: true },
        {
          step: 2,
          text: isIPhone
            ? 'Toque em Configurações ⚙️ (canto inferior)'
            : 'Toque em ⋮ (3 pontinhos, canto superior)'
        },
        { step: 3, text: 'Toque em Dispositivos conectados' },
        { step: 4, text: 'Toque em "Conectar com número de telefone"' },
        { step: 5, text: code ? `Digite o código: ${code}` : 'Digite o código gerado' },
      ];
    } else {
      // Instruções para QR Code
      return [
        { step: 1, text: 'Abra o WhatsApp no celular' },
        {
          step: 2,
          text: isIPhone
            ? 'Toque em Configurações ⚙️ (canto inferior)'
            : 'Toque em ⋮ (3 pontinhos, canto superior)'
        },
        { step: 3, text: 'Toque em Dispositivos conectados' },
        { step: 4, text: 'Toque em "Conectar dispositivo"' },
        { step: 5, text: 'Aponte a câmera para o QR Code' },
      ];
    }
  }, [isIPhone, isPairing, code]);

  const handleOpenWhatsApp = () => {
    // Deep link para abrir WhatsApp
    window.open('whatsapp://', '_blank');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-foreground">
          {isIPhone ? '📱 Instruções para iPhone' : '🤖 Instruções para Android'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-auto py-1 px-2"
          onClick={() => {
            // Toggle para mostrar instruções do outro SO
            const event = new CustomEvent('toggleDevice');
            window.dispatchEvent(event);
          }}
        >
          {isIPhone ? 'Usa Android?' : 'Usa iPhone?'}
        </Button>
      </div>

      <div className="space-y-2">
        {steps.map(({ step, text, hasAction }) => (
          <div key={step} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
              {step}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{text}</span>
              {hasAction && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={handleOpenWhatsApp}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Abrir
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Timer visual com estados
 */
function CodeTimer({
  timeLeft,
  timerState,
  formatTime,
  label = 'Código expira em'
}: {
  timeLeft: number;
  timerState: TimerState;
  formatTime: (s: number) => string;
  label?: string;
}) {
  const progressValue = (timeLeft / EXPIRATION_TIMES.PAIRING_CODE) * 100;

  if (timerState === 'refreshing') {
    return (
      <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-primary font-medium">Atualizando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center justify-center gap-2 p-3 rounded-lg transition-colors",
          timerState === 'normal' && "bg-primary/10",
          timerState === 'warning' && "bg-amber-500/10",
          timerState === 'critical' && "bg-destructive/10 animate-pulse"
        )}
      >
        {timerState === 'critical' ? (
          <AlertTriangle className={cn(
            "h-4 w-4",
            timerState === 'critical' && "text-destructive"
          )} />
        ) : (
          <Clock className={cn(
            "h-4 w-4",
            timerState === 'normal' && "text-primary",
            timerState === 'warning' && "text-amber-600"
          )} />
        )}
        <span className={cn(
          "text-sm font-medium",
          timerState === 'normal' && "text-primary",
          timerState === 'warning' && "text-amber-600",
          timerState === 'critical' && "text-destructive"
        )}>
          {label}: <strong>{formatTime(timeLeft)}</strong>
        </span>
      </div>
      <Progress
        value={progressValue}
        className={cn(
          "h-1.5",
          timerState === 'critical' && "[&>div]:bg-destructive",
          timerState === 'warning' && "[&>div]:bg-amber-500"
        )}
      />
      {timerState === 'warning' && (
        <p className="text-xs text-amber-600 text-center">
          O código será renovado automaticamente
        </p>
      )}
    </div>
  );
}

/**
 * Componente de código de pareamento
 */
function PairingCodeDisplay({
  code,
  copied,
  onCopy,
  onNewCode,
  onChangeNumber,
  isGenerating,
}: {
  code: string;
  copied: boolean;
  onCopy: () => void;
  onNewCode: () => void;
  onChangeNumber: () => void;
  isGenerating: boolean;
}) {
  // Formata o código com espaço no meio (XXXX-XXXX)
  const formattedCode = code.length === 8
    ? `${code.slice(0, 4)}-${code.slice(4)}`
    : code;

  return (
    <div className="space-y-4">
      <button
        type="button"
        className={cn(
          "w-full bg-primary/10 border-2 border-primary/30 rounded-xl p-6 text-center cursor-pointer transition-all duration-200",
          "hover:border-primary/50 hover:bg-primary/15",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          copied && "bg-green-500/10 border-green-500/50"
        )}
        onClick={onCopy}
        aria-label={`Código de pareamento: ${code}. Clique para copiar.`}
      >
        <p className="text-4xl font-mono font-bold tracking-[0.3em] text-primary" aria-hidden="true">
          {formattedCode}
        </p>
        <p className="text-sm text-primary/70 mt-3 flex items-center justify-center gap-2">
          {copied ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Toque para copiar
            </>
          )}
        </p>
      </button>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onChangeNumber}
        >
          Outro número
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onNewCode}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-1" />
              Novo código
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Componente principal de conteúdo da página de compartilhamento
 */
function SharePageContent({ token }: SharePageProps) {
  // Device detection
  const detectedDevice = useDeviceDetection();
  const [selectedDevice, setSelectedDevice] = useState<DeviceType | null>(null);
  const device = selectedDevice || detectedDevice;
  const isMobile = device === 'iphone' || device === 'android';

  // Instance data
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'waiting' | 'connecting' | 'connected' | 'expired'>('waiting');
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  // QR Code state
  const [refreshingQR, setRefreshingQR] = useState(false);

  // Pairing Code state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // UI state
  const [showAlternative, setShowAlternative] = useState(false);
  const announcerRef = useRef<HTMLDivElement>(null);

  // Timer para código/QR (2 minutos)
  const handleCodeExpire = useCallback(async () => {
    if (pairingCode) {
      toast.info('Gerando novo código automaticamente...');
      // Auto-refresh do pairing code
      await handleGeneratePairingCode(true);
    }
  }, [pairingCode]);

  const { timeLeft: codeTimeLeft, timerState: codeTimerState, resetTimer: resetCodeTimer, formatTime } =
    useCodeTimer(EXPIRATION_TIMES.PAIRING_CODE, handleCodeExpire);

  // Listeners
  useEffect(() => {
    const handleToggleDevice = () => {
      setSelectedDevice(prev => {
        if (prev === 'iphone' || (!prev && detectedDevice === 'iphone')) {
          return 'android';
        }
        return 'iphone';
      });
    };

    window.addEventListener('toggleDevice', handleToggleDevice);
    return () => window.removeEventListener('toggleDevice', handleToggleDevice);
  }, [detectedDevice]);

  // Announce for screen readers
  const announce = useCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = message;
    }
  }, []);

  // Normalize status
  const normalizeStatus = (status: string): 'connecting' | 'connected' | 'disconnected' => {
    const normalized = status.toLowerCase();
    if (normalized === 'connected') return 'connected';
    if (normalized === 'connecting') return 'connecting';
    return 'disconnected';
  };

  // Phone number formatting
  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 2)} ${numbers.slice(2)}`;
    if (numbers.length <= 11) return `${numbers.slice(0, 2)} ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    return `${numbers.slice(0, 2)} ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(formatPhoneNumber(e.target.value));
  };

  // Fetch instance data
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
        setInstance(prev => {
          const instanceData: InstanceData = {
            id: data.id,
            name: data.name,
            status: normalizeStatus(data.status || 'connecting'),
            phoneNumber: data.phoneNumber,
            profileName: data.profileName || data.name,
            // Preservar QR Code existente se a API não retornar um novo
            qrCode: data.qrCode || prev?.qrCode,
            pairingCode: data.pairingCode || prev?.pairingCode,
            expiresAt: new Date(data.expiresAt || Date.now() + 3600000),
            organizationName: data.organizationName || 'Organização'
          };
          return instanceData;
        });

        const isReallyConnected = normalizeStatus(data.status) === 'connected' && data.phoneNumber;

        if (isReallyConnected) {
          setConnectionStatus('connected');
          announce('WhatsApp conectado com sucesso!');
          if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar instância:', error);
      if (showLoading) setConnectionStatus('expired');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token, pollInterval, announce]);

  // Initial fetch
  useEffect(() => {
    fetchInstanceData();
  }, [fetchInstanceData]);

  // Polling for connection status
  useEffect(() => {
    if (connectionStatus === 'waiting' && !pollInterval) {
      const interval = setInterval(() => fetchInstanceData(false), POLLING_INTERVALS.CONNECTION_STATUS);
      setPollInterval(interval);
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connectionStatus, pollInterval, fetchInstanceData]);

  // Handle QR refresh
  const handleRefreshQR = async () => {
    try {
      setRefreshingQR(true);
      announce('Gerando novo QR Code, aguarde');

      const response = await fetch(`/api/v1/instances/share/${token}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Erro ao gerar QR Code');
      }

      const result = await response.json();
      const data = result.data || result;

      setInstance(prev => prev ? {
        ...prev,
        qrCode: data.qrCode || prev.qrCode,
      } : null);

      if (data.qrCode) {
        toast.success('QR Code atualizado!');
        announce('Novo QR Code gerado com sucesso');
      }
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar QR Code');
    } finally {
      setRefreshingQR(false);
    }
  };

  // Handle pairing code generation
  const handleGeneratePairingCode = async (isAutoRefresh = false) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      if (!isAutoRefresh) {
        toast.error('Digite um número de telefone válido com DDD');
      }
      return;
    }

    try {
      setGeneratingCode(true);
      if (!isAutoRefresh) {
        announce('Gerando código de pareamento, aguarde');
      }

      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      const response = await fetch(`/api/v1/instances/share/${token}/pairing-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 409) {
          toast.error('Já existe uma conexão em andamento. Aguarde alguns segundos.', { duration: 5000 });
          return;
        }

        throw new Error(errorData.message || errorData.error || 'Erro ao gerar código');
      }

      const result = await response.json();
      const data = result.data || result;

      if (data.alreadyConnected || data.status === 'connected') {
        toast.success('Esta instância já está conectada!');
        setConnectionStatus('connected');
        return;
      }

      if (data && data.pairingCode) {
        setPairingCode(data.pairingCode);
        resetCodeTimer(EXPIRATION_TIMES.PAIRING_CODE);

        if (isAutoRefresh) {
          toast.success('Código renovado automaticamente!');
        } else {
          toast.success('Código gerado com sucesso!');
        }
        announce(`Código de pareamento: ${data.pairingCode.split('').join(' ')}`);
      } else {
        throw new Error('Código não foi gerado.');
      }
    } catch (error) {
      console.error('Erro ao gerar código:', error);
      const message = error instanceof Error ? error.message : 'Erro ao gerar código';
      toast.error(message);
    } finally {
      setGeneratingCode(false);
    }
  };

  // Handle copy code
  const handleCopyCode = async () => {
    if (pairingCode) {
      try {
        await navigator.clipboard.writeText(pairingCode);
        setCopied(true);
        toast.success('Código copiado!');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error('Erro ao copiar código');
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Clock className="h-10 w-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3">
              Link Expirado
            </h1>
            <p className="text-muted-foreground mb-6">
              Este link de conexão expirou ou não existe mais.
              Solicite um novo link ao administrador.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 text-center">
            <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mx-auto mb-4">
              <PartyPopper className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              Conectado com Sucesso!
            </h1>
          </div>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-6">
              Seu WhatsApp foi conectado a{' '}
              <strong className="text-foreground">{instance.organizationName}</strong>
            </p>
            {instance.phoneNumber && (
              <div className="bg-green-500/10 rounded-xl p-4 mb-6 border border-green-500/30">
                <div className="flex items-center justify-center gap-3 text-green-600 dark:text-green-400">
                  <Wifi className="h-5 w-5" />
                  <span className="font-semibold text-lg">{instance.phoneNumber}</span>
                </div>
                {instance.profileName && (
                  <p className="text-green-600/70 dark:text-green-400/70 text-sm mt-1">
                    {instance.profileName}
                  </p>
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
  return (
    <div className="min-h-screen bg-background">
      {/* Screen reader announcer */}
      <div ref={announcerRef} className="sr-only" role="status" aria-live="polite" />

      <main className="container mx-auto px-4 py-6 max-w-md">
        {/* Header */}
        <header className="text-center mb-6 space-y-3">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={140}
              height={35}
              priority
              className="dark:brightness-0 dark:invert"
            />
          </div>

          <Badge variant="secondary" className="gap-2 py-1.5 px-4">
            <Building2 className="h-3.5 w-3.5" />
            <span>{instance.organizationName}</span>
          </Badge>

          <h1 className="text-xl font-bold text-foreground">
            Conectar WhatsApp
          </h1>

          {/* Device indicator */}
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {isMobile ? (
              <>
                <Smartphone className="h-4 w-4" />
                <span>{device === 'iphone' ? 'iPhone' : 'Android'} detectado</span>
              </>
            ) : (
              <>
                <Monitor className="h-4 w-4" />
                <span>Computador detectado</span>
              </>
            )}
          </div>
        </header>

        {/* Main Card */}
        <Card className="border-border shadow-lg mb-4">
          <CardContent className="p-6 space-y-5">

            {/* === MOBILE VIEW: Pairing Code Primary === */}
            {isMobile && (
              <>
                {!pairingCode ? (
                  // Input form
                  <div className="space-y-4">
                    <div className="text-center mb-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                        <KeyRound className="h-6 w-6 text-primary" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Digite seu número para gerar o código de conexão
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-sm">
                        Número do WhatsApp (com DDD)
                      </Label>
                      <div className="flex gap-2">
                        <div className="flex items-center px-3 bg-muted rounded-lg border border-input text-sm font-medium">
                          +55
                        </div>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="11 99999-9999"
                          value={phoneNumber}
                          onChange={handlePhoneChange}
                          className="flex-1 text-lg"
                          autoComplete="tel-national"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => handleGeneratePairingCode(false)}
                      disabled={generatingCode || phoneNumber.replace(/\D/g, '').length < 10}
                      className="w-full h-12 text-base"
                      size="lg"
                    >
                      {generatingCode ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          Gerar Código
                          <ArrowRight className="h-5 w-5 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  // Code display
                  <div className="space-y-4">
                    <CodeTimer
                      timeLeft={codeTimeLeft}
                      timerState={codeTimerState}
                      formatTime={formatTime}
                    />

                    <PairingCodeDisplay
                      code={pairingCode}
                      copied={copied}
                      onCopy={handleCopyCode}
                      onNewCode={() => handleGeneratePairingCode(false)}
                      onChangeNumber={() => { setPairingCode(null); setPhoneNumber(''); }}
                      isGenerating={generatingCode}
                    />

                    <div className="pt-2 border-t">
                      <InstructionsSteps
                        device={device}
                        method="pairing"
                        code={pairingCode}
                      />
                    </div>
                  </div>
                )}

                {/* Status indicator */}
                {pairingCode && (
                  <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <span className="text-sm text-primary font-medium">Aguardando você digitar o código...</span>
                  </div>
                )}

                {/* Alternative method: QR Code */}
                <Collapsible open={showAlternative} onOpenChange={setShowAlternative}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <QrCode className="h-4 w-4" />
                        Prefere usar QR Code?
                      </span>
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        showAlternative && "rotate-180"
                      )} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4 space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Use esta opção se estiver acessando de outro dispositivo
                    </p>

                    <div className="flex justify-center">
                      <div className="bg-white p-3 rounded-xl shadow-lg border">
                        {instance.qrCode ? (
                          <img
                            src={instance.qrCode.startsWith('data:') ? instance.qrCode : `data:image/png;base64,${instance.qrCode}`}
                            alt="QR Code para conectar WhatsApp"
                            className="w-40 h-40 object-contain"
                          />
                        ) : (
                          <div className="w-40 h-40 bg-muted rounded-lg flex flex-col items-center justify-center">
                            <QrCode className="h-8 w-8 mb-2 opacity-50" />
                            <Button variant="link" size="sm" onClick={handleRefreshQR}>
                              Gerar QR Code
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      onClick={handleRefreshQR}
                      disabled={refreshingQR}
                      className="w-full"
                    >
                      {refreshingQR ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Atualizar QR Code
                    </Button>

                    <InstructionsSteps device={device} method="qr" />
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}

            {/* === DESKTOP VIEW: QR Code Primary === */}
            {!isMobile && (
              <>
                <div className="text-center mb-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                    <QrCode className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Escaneie o QR Code com a câmera do seu WhatsApp
                  </p>
                </div>

                <div className="flex justify-center">
                  <div className="bg-white p-4 rounded-2xl shadow-lg border">
                    {instance.qrCode ? (
                      <img
                        src={instance.qrCode.startsWith('data:') ? instance.qrCode : `data:image/png;base64,${instance.qrCode}`}
                        alt="QR Code para conectar WhatsApp"
                        className="w-56 h-56 object-contain"
                      />
                    ) : (
                      <div className="w-56 h-56 bg-muted rounded-xl flex flex-col items-center justify-center">
                        <QrCode className="h-12 w-12 mb-3 opacity-50" />
                        <span className="text-sm text-muted-foreground mb-2">QR Code indisponível</span>
                        <Button variant="link" size="sm" onClick={handleRefreshQR}>
                          Clique para gerar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={handleRefreshQR}
                  disabled={refreshingQR}
                  className="w-full"
                >
                  {refreshingQR ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Atualizar QR Code
                </Button>

                {/* Status */}
                <div className="flex items-center justify-center gap-2 p-3 bg-primary/10 rounded-lg">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span className="text-sm text-primary font-medium">Aguardando escaneamento...</span>
                </div>

                {/* Instructions */}
                <div className="pt-2 border-t">
                  <InstructionsSteps device={device} method="qr" />
                </div>

                {/* Alternative method: Pairing Code */}
                <Collapsible open={showAlternative} onOpenChange={setShowAlternative}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4" />
                        Não consegue escanear? Use código
                      </span>
                      <ChevronDown className={cn(
                        "h-4 w-4 transition-transform",
                        showAlternative && "rotate-180"
                      )} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-4 space-y-4">
                    {!pairingCode ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="phone-desktop" className="text-sm">
                            Número do WhatsApp (com DDD)
                          </Label>
                          <div className="flex gap-2">
                            <div className="flex items-center px-3 bg-muted rounded-lg border border-input text-sm font-medium">
                              +55
                            </div>
                            <Input
                              id="phone-desktop"
                              type="tel"
                              placeholder="11 99999-9999"
                              value={phoneNumber}
                              onChange={handlePhoneChange}
                              className="flex-1"
                              autoComplete="tel-national"
                            />
                          </div>
                        </div>

                        <Button
                          onClick={() => handleGeneratePairingCode(false)}
                          disabled={generatingCode || phoneNumber.replace(/\D/g, '').length < 10}
                          className="w-full"
                        >
                          {generatingCode ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              Gerar Código
                              <ArrowRight className="h-4 w-4 ml-2" />
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      <>
                        <CodeTimer
                          timeLeft={codeTimeLeft}
                          timerState={codeTimerState}
                          formatTime={formatTime}
                        />

                        <PairingCodeDisplay
                          code={pairingCode}
                          copied={copied}
                          onCopy={handleCopyCode}
                          onNewCode={() => handleGeneratePairingCode(false)}
                          onChangeNumber={() => { setPairingCode(null); setPhoneNumber(''); }}
                          isGenerating={generatingCode}
                        />

                        <InstructionsSteps device={device} method="pairing" code={pairingCode} />
                      </>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </>
            )}

          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span>Conexão segura e criptografada</span>
          </div>
          <p className="text-muted-foreground/60 text-xs">
            Powered by <strong>{instance.organizationName}</strong>
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * Página de Compartilhamento de Conexão WhatsApp
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
