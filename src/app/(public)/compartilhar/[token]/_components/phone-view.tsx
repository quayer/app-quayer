'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Copy, Loader2, Phone, QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/client/components/ui/button';
import { Input } from '@/client/components/ui/input';
import { DeviceToggle } from './device-toggle';
import { WhatsAppSquareIcon } from '../_icons';
import type { InstanceData, DeviceType } from '../_constants';

interface PhoneViewProps {
  instance: InstanceData;
  device: DeviceType;
  onDeviceChange: (d: DeviceType) => void;
  onSwitchToQR: () => void;
  token: string;
}

export function PhoneView({ instance: _instance, device, onDeviceChange, onSwitchToQR, token }: PhoneViewProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isIPhone = device === 'iphone';

  const fmtPhone = (v: string) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 2) return n;
    if (n.length <= 7) return `${n.slice(0, 2)} ${n.slice(2)}`;
    if (n.length <= 11) return `${n.slice(0, 2)} ${n.slice(2, 7)}-${n.slice(7)}`;
    return `${n.slice(0, 2)} ${n.slice(2, 7)}-${n.slice(7, 11)}`;
  };

  const handleGenerate = async () => {
    const clean = phoneNumber.replace(/\D/g, '');
    if (clean.length < 10) { toast.error('Digite um número válido com DDD'); return; }
    try {
      setGenerating(true);
      const full = clean.startsWith('55') ? clean : `55${clean}`;
      const r = await fetch(`/api/v1/instances/share/${token}/pairing-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: full }),
      });
      if (!r.ok) {
        if (r.status === 409) { toast.error('Conexão em andamento, aguarde.'); return; }
        const e = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(e.message || 'Erro');
      }
      const d = await r.json().then((j: { data?: unknown } & Record<string, unknown>) => (j.data ?? j) as Record<string, unknown>);
      if (d.pairingCode) { setPairingCode(d.pairingCode as string); toast.success('Código gerado!'); }
      else throw new Error('Código não gerado.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erro ao gerar código'); }
    finally { setGenerating(false); }
  };

  const handleCopy = async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      toast.success('Copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Erro ao copiar'); }
  };

  const fmtCode = (code: string) =>
    code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

  // Instructions for pairing code
  const steps = pairingCode
    ? isIPhone
      ? [
          'Abra o WhatsApp no seu iPhone principal',
          'Toque na sua foto do perfil e, em seguida, em Dispositivos conectados > Conectar dispositivo',
          'Desbloqueie com Touch ID, Face ID ou o código do celular',
          'Toque em "Conectar com número de telefone"',
          `Digite o código: ${fmtCode(pairingCode)}`,
        ]
      : [
          'Abra o WhatsApp no seu celular principal Android',
          'Toque no ícone Mais opções (⋮) > Dispositivos conectados > Conectar dispositivo',
          'Se solicitado, confirme sua identidade (biometria ou PIN)',
          'Toque em "Conectar com número de telefone"',
          `Digite o código: ${fmtCode(pairingCode)}`,
        ]
    : [];

  return (
    <div className="flex flex-col md:flex-row">
      {/* LEFT: Instructions (visible only after code is generated) */}
      <div className="flex-1 p-8 md:p-10 flex flex-col justify-center order-2 md:order-1">
        {!pairingCode ? (
          /* Phone input centered */
          <div className="flex flex-col items-center text-center max-w-xs mx-auto">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
              style={{ background: 'var(--color-brand-muted)' }}
            >
              <Phone className="h-7 w-7" style={{ color: 'var(--color-brand)' }} />
            </div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              Entrar com telefone
            </h1>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
              Digite seu número para gerar um código de conexão
            </p>

            <div className="w-full space-y-4">
              <div className="flex gap-2">
                <div className="flex items-center px-3 rounded-lg border text-sm font-medium"
                  style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                >+55</div>
                <Input
                  type="tel"
                  placeholder="11 99999-9999"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(fmtPhone(e.target.value))}
                  className="flex-1 text-lg"
                  autoComplete="tel-national"
                  autoFocus
                />
              </div>
              <Button
                onClick={handleGenerate}
                className="w-full h-12 text-base"
                disabled={generating || phoneNumber.replace(/\D/g, '').length < 10}
              >
                {generating
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <>Gerar Código <ArrowRight className="h-5 w-5 ml-2" /></>
                }
              </Button>
            </div>

            <div className="mt-6">
              <DeviceToggle device={device} onChange={onDeviceChange} />
            </div>
          </div>
        ) : (
          /* Instructions after code generated */
          <>
            <div className="flex items-center gap-3 mb-5">
              <WhatsAppSquareIcon size={32} />
              <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                  Digite o código no WhatsApp
                </h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  Use o código abaixo no seu celular
                </p>
              </div>
            </div>
            <ol className="space-y-4 mb-6" aria-label="Passos para conectar via código">
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
          </>
        )}

        {/* Switch back */}
        <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <button
            type="button"
            onClick={onSwitchToQR}
            className="flex items-center gap-2 text-xs font-medium cursor-pointer bg-transparent border-0 p-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm"
            style={{ color: 'var(--color-brand)' }}
          >
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            Entrar com QR Code
          </button>
        </div>
      </div>

      {/* RIGHT: Code display */}
      <div
        className="md:w-[340px] shrink-0 p-8 md:p-10 flex flex-col items-center justify-center border-b md:border-b-0 md:border-l order-1 md:order-2"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        {!pairingCode ? (
          /* Waiting state */
          <div className="text-center space-y-4">
            <div
              className="w-56 h-56 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center"
              style={{ borderColor: 'var(--color-border-default)' }}
            >
              <Smartphone className="h-12 w-12 mb-3" style={{ color: 'var(--color-text-disabled)' }} />
              <p className="text-sm px-4" style={{ color: 'var(--color-text-disabled)' }}>
                Digite seu número para gerar o código
              </p>
            </div>
          </div>
        ) : (
          /* Code display */
          <div className="w-full space-y-5 flex flex-col items-center">
            <button
              type="button"
              onClick={handleCopy}
              className="w-full max-w-[264px] rounded-2xl p-8 text-center cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                background: copied ? 'var(--color-success-bg)' : 'var(--color-brand-muted)',
                borderColor: copied ? 'var(--color-success-border)' : 'var(--color-border-brand)',
              }}
            >
              <p className="text-4xl font-mono font-bold tracking-[0.25em]" style={{ color: 'var(--color-brand)' }}>
                {fmtCode(pairingCode)}
              </p>
              <p className="text-xs mt-3 flex items-center justify-center gap-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
                {copied
                  ? <><CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} /> Copiado!</>
                  : <><Copy className="h-3.5 w-3.5" /> Toque para copiar</>
                }
              </p>
            </button>

            <div className="flex gap-2 w-full max-w-[264px]">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setPairingCode(null); setPhoneNumber(''); }}>
                Outro número
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-1" />Novo</>}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--color-brand)' }} />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>Aguardando digitação do código...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
