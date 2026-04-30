'use client';

import { Clock, RefreshCw, QrCode, Loader2, Phone, AlertTriangle } from 'lucide-react';
import { Progress } from '@/client/components/ui/progress';
import { cn } from '@/lib/utils';
import { DeviceToggle } from './device-toggle';
import { WhatsAppSquareIcon } from '../_icons';
import { QR_EXPIRY } from '../_constants';
import type { InstanceData, DeviceType, TimerState } from '../_constants';

interface QRViewProps {
  instance: InstanceData;
  device: DeviceType;
  onDeviceChange: (d: DeviceType) => void;
  onSwitchToPhone: () => void;
  qrReady: boolean;
  refreshingQR: boolean;
  onRefreshQR: () => void;
  timeLeft: number;
  timerState: TimerState;
  fmt: (s: number) => string;
}

export function QRView({
  instance, device, onDeviceChange, onSwitchToPhone,
  qrReady, refreshingQR, onRefreshQR, timeLeft, timerState, fmt,
}: QRViewProps) {
  const isIPhone = device === 'iphone';
  const steps = isIPhone
    ? [
        'Abra o WhatsApp no seu iPhone principal',
        'Toque na sua foto do perfil e, em seguida, em Dispositivos conectados > Conectar dispositivo',
        'Desbloqueie com Touch ID, Face ID ou o código do celular',
        'Aponte seu celular para a tela para escanear o QR Code',
      ]
    : [
        'Abra o WhatsApp no seu celular principal Android',
        'Toque no ícone Mais opções (⋮) > Dispositivos conectados > Conectar dispositivo',
        'Se solicitado, confirme sua identidade (biometria ou PIN)',
        'Aponte seu celular para a tela para escanear o QR Code',
      ];

  return (
    <div className="flex flex-col md:flex-row">
      {/* LEFT: Instructions */}
      <div className="flex-1 p-8 md:p-10 flex flex-col justify-center order-2 md:order-1">
        <div className="flex items-center gap-3 mb-5">
          <WhatsAppSquareIcon size={32} />
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              Escaneie para conectar
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              Conecte seu WhatsApp em segundos
            </p>
          </div>
        </div>

        <ol className="space-y-4 mb-6" aria-label="Passos para conectar via QR Code">
          {steps.map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                aria-hidden="true"
                style={{ background: 'var(--color-brand-muted)', color: 'var(--color-brand)' }}
              >{i + 1}</span>
              <span className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{text}</span>
            </li>
          ))}
        </ol>

        <DeviceToggle device={device} onChange={onDeviceChange} />

        {/* Switch to phone */}
        <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <button
            type="button"
            onClick={onSwitchToPhone}
            className="flex items-center gap-2 text-xs font-medium cursor-pointer bg-transparent border-0 p-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
            style={{ color: 'var(--color-brand)' }}
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            Entrar com número de telefone
          </button>
        </div>
      </div>

      {/* RIGHT: QR Code */}
      <div
        className="md:w-[340px] shrink-0 p-8 md:p-10 flex flex-col items-center justify-center border-b md:border-b-0 md:border-l order-1 md:order-2"
        role="region"
        aria-label="QR Code para conexão"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <div
          className="p-4 rounded-2xl border mb-5"
          style={{ background: '#fff', borderColor: 'var(--color-border-brand)', boxShadow: '0 0 32px rgba(255,214,10,.12)' }}
        >
          {instance.qrCode ? (
            <img
              src={instance.qrCode.startsWith('data:') ? instance.qrCode : `data:image/png;base64,${instance.qrCode}`}
              alt="QR Code para conectar WhatsApp — escaneie com seu celular"
              className="w-56 h-56 object-contain"
            />
          ) : (
            <div
              className="w-56 h-56 flex flex-col items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-200"
              role="status"
              aria-label="Carregando QR Code"
            >
              {refreshingQR
                ? <Loader2 className="h-10 w-10 animate-spin text-neutral-400" aria-hidden="true" />
                : (
                  <>
                    <QrCode className="h-12 w-12 mb-3 text-neutral-300 dark:text-neutral-400" aria-hidden="true" />
                    <span className="text-sm text-neutral-500">Gerando QR...</span>
                  </>
                )
              }
            </div>
          )}
        </div>

        {/* Timer */}
        {qrReady && (
          <div className="w-full space-y-2 mb-4" role="timer" aria-label={`QR Code expira em ${fmt(timeLeft)}`}>
            <div className="flex items-center justify-center gap-2">
              {timerState === 'critical'
                ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" style={{ color: 'var(--color-error)' }} />
                : <Clock className="h-3.5 w-3.5" aria-hidden="true" style={{ color: timerState === 'warning' ? 'var(--color-warning)' : 'var(--color-text-tertiary)' }} />
              }
              <span className="text-xs font-medium" style={{
                color: timerState === 'critical' ? 'var(--color-error)' : timerState === 'warning' ? 'var(--color-warning)' : 'var(--color-text-tertiary)',
              }}>{fmt(timeLeft)}</span>
            </div>
            <Progress
              value={(timeLeft / QR_EXPIRY) * 100}
              aria-label="Tempo restante do QR Code"
              className={cn('h-1', timerState === 'critical' && '[&>div]:bg-destructive', timerState === 'warning' && '[&>div]:bg-amber-500')}
            />
          </div>
        )}

        <button
          type="button"
          onClick={onRefreshQR}
          disabled={refreshingQR}
          className="flex items-center gap-1.5 text-xs font-medium disabled:opacity-50 cursor-pointer bg-transparent border-0 p-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
          style={{ color: 'var(--color-brand)' }}
          aria-label={refreshingQR ? 'Atualizando QR Code...' : 'Atualizar QR Code'}
        >
          {refreshingQR
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          }
          Atualizar QR Code
        </button>

        <div className="flex items-center gap-2 mt-5">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-brand)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Aguardando escaneamento...</span>
        </div>
      </div>
    </div>
  );
}
