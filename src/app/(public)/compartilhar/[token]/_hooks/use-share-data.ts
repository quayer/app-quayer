'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { QR_EXPIRY, POLL, extractQrCode } from '../_constants';
import type { InstanceData } from '../_constants';
import { useQRTimer } from './use-qr-timer';

export function useShareData(token: string) {
  const [instance, setInstance] = useState<InstanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'waiting' | 'connected' | 'expired'>('waiting');
  const [refreshingQR, setRefreshingQR] = useState(false);
  const [qrReady, setQrReady] = useState(false);

  const pollingStartRef = useRef(Date.now());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollingMsRef = useRef(POLL.FAST);
  const announcerRef = useRef<HTMLDivElement>(null);

  const handleQRExpire = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/instances/share/${token}/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      });
      if (r.ok) {
        const d = await r.json().then((j: { data?: unknown } & Record<string, unknown>) => (j.data ?? j) as Record<string, unknown>);
        const qr = extractQrCode(d);
        if (qr) {
          setInstance(p => p ? { ...p, qrCode: qr } : null);
          resetTimer(QR_EXPIRY);
        }
      }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const { left: timeLeft, state: timerState, reset: resetTimer, fmt } = useQRTimer(QR_EXPIRY, handleQRExpire);

  const announce = useCallback((msg: string) => {
    if (announcerRef.current) announcerRef.current.textContent = msg;
  }, []);

  const fetchInstance = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const r = await fetch(`/api/v1/instances/share/${token}`, { headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) { if (r.status === 404) setConnectionStatus('expired'); return; }
      const data = await r.json().then((j: { data?: unknown } & Record<string, unknown>) => (j.data ?? j) as Record<string, unknown>);
      if (!data?.id && !data?.name) return;
      const qr = extractQrCode(data);
      setInstance(prev => ({
        id: data.id as string,
        name: data.name as string,
        status: ((data.status as string) || 'connecting').toLowerCase(),
        phoneNumber: data.phoneNumber as string | undefined,
        profileName: (data.profileName as string | undefined) || (data.name as string),
        qrCode: qr || prev?.qrCode,
        expiresAt: new Date((data.expiresAt as string) || Date.now() + 3600000),
        organizationName: (data.organizationName as string) || 'Organização',
      }));
      if (qr) setQrReady(true);
      if (((data.status as string) || '').toLowerCase() === 'connected' && data.phoneNumber) {
        setConnectionStatus('connected');
        announce('WhatsApp conectado!');
      }
    } catch (e) {
      console.error(e);
      if (showLoading) setConnectionStatus('expired');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token, announce]);

  // Init + auto QR (with retry — provisioning may need a few seconds)
  useEffect(() => {
    let cancelled = false;

    const tryRefresh = async (): Promise<boolean> => {
      try {
        const r = await fetch(`/api/v1/instances/share/${token}/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
        });
        if (r.ok) {
          const d = await r.json().then((j: { data?: unknown } & Record<string, unknown>) => (j.data ?? j) as Record<string, unknown>);
          const qr = extractQrCode(d);
          if (qr && !cancelled) {
            setInstance(p => p ? { ...p, qrCode: qr } : null);
            setQrReady(true);
            resetTimer(QR_EXPIRY);
            return true;
          }
        }
      } catch { /* noop */ }
      return false;
    };

    (async () => {
      await fetchInstance();
      const got = await tryRefresh();
      if (got || cancelled) return;
      await new Promise(r => setTimeout(r, 3000));
      if (cancelled) return;
      const got2 = await tryRefresh();
      if (got2 || cancelled) return;
      await new Promise(r => setTimeout(r, 5000));
      if (!cancelled) await tryRefresh();
    })();

    return () => { cancelled = true; };
  }, [fetchInstance, token, resetTimer]);

  // Polling
  const getIv = useCallback(() => {
    const e = Date.now() - pollingStartRef.current;
    if (e < POLL.FAST_T) return POLL.FAST;
    if (e < POLL.MED_T) return POLL.MED;
    return POLL.SLOW;
  }, []);

  const resetPolling = useCallback(() => {
    pollingStartRef.current = Date.now();
    pollingMsRef.current = POLL.FAST;
  }, []);

  useEffect(() => {
    if (connectionStatus !== 'waiting') {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
    const sched = () => {
      const iv = getIv();
      pollingMsRef.current = iv;
      pollingRef.current = setInterval(() => {
        fetchInstance(false);
        const niv = getIv();
        if (niv !== pollingMsRef.current) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          sched();
        }
      }, iv);
    };
    sched();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [connectionStatus, fetchInstance, getIv]);

  // Refresh QR
  const handleRefreshQR = async () => {
    try {
      setRefreshingQR(true);
      resetPolling();
      const r = await fetch(`/api/v1/instances/share/${token}/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(e.message || 'Erro');
      }
      const d = await r.json().then((j: { data?: unknown } & Record<string, unknown>) => (j.data ?? j) as Record<string, unknown>);
      const qr = extractQrCode(d);
      if (qr) {
        setInstance(p => p ? { ...p, qrCode: qr } : null);
        setQrReady(true);
        resetTimer(QR_EXPIRY);
        const { toast } = await import('sonner');
        toast.success('QR Code atualizado!');
      }
    } catch (e) {
      const { toast } = await import('sonner');
      toast.error(e instanceof Error ? e.message : 'Erro');
    } finally {
      setRefreshingQR(false);
    }
  };

  return {
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
  };
}
