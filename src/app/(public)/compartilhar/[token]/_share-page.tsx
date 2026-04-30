'use client';

import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { useDeviceDetection } from './_hooks/use-device-detection';
import { useShareData } from './_hooks/use-share-data';
import { PageSkeleton } from './_components/page-skeleton';
import { ExpiredScreen } from './_components/expired-screen';
import { ConnectedScreen } from './_components/connected-screen';
import { QRView } from './_components/qr-view';
import { PhoneView } from './_components/phone-view';
import { PageHeader } from './_components/page-header';
import type { ViewMode, DeviceType } from './_constants';

export function SharePageContent({ token }: { token: string }) {
  const detectedDevice = useDeviceDetection();
  const [device, setDevice] = useState<DeviceType>(detectedDevice);
  const [viewMode, setViewMode] = useState<ViewMode>('qr');

  useEffect(() => { setDevice(detectedDevice); }, [detectedDevice]);

  const {
    instance,
    loading,
    connectionStatus,
    refreshingQR,
    qrReady,
    handleRefreshQR,
    timeLeft,
    timerState,
    fmt,
    announcerRef,
  } = useShareData(token);

  if (loading) return <PageSkeleton />;
  if (!instance || connectionStatus === 'expired') return <ExpiredScreen />;
  if (connectionStatus === 'connected') return <ConnectedScreen instance={instance} />;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-base, #000)' }}>
      {/* sr-only announcer for screen readers */}
      <div ref={announcerRef} className="sr-only" role="status" aria-live="polite" />

      <PageHeader orgName={instance.organizationName} />

      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div
          className="w-full max-w-[820px] rounded-2xl border"
          style={{
            background: 'var(--color-bg-elevated, #0C0804)',
            borderColor: 'var(--color-border-subtle)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {viewMode === 'qr' ? (
            <QRView
              instance={instance}
              device={device}
              onDeviceChange={setDevice}
              onSwitchToPhone={() => setViewMode('phone')}
              qrReady={qrReady}
              refreshingQR={refreshingQR}
              onRefreshQR={handleRefreshQR}
              timeLeft={timeLeft}
              timerState={timerState}
              fmt={fmt}
            />
          ) : (
            <PhoneView
              instance={instance}
              device={device}
              onDeviceChange={setDevice}
              onSwitchToQR={() => setViewMode('qr')}
              token={token}
            />
          )}
        </div>
      </div>

      <footer className="py-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color: 'var(--color-text-disabled)' }}>
          <Shield className="h-3 w-3" />
          Conexão criptografada de ponta a ponta
        </div>
      </footer>
    </div>
  );
}

