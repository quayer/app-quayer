// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

export const QR_EXPIRY = 120;
export const WARNING_AT = 30;
export const CRITICAL_AT = 10;

export const POLL = { FAST: 2000, MED: 5000, SLOW: 10000, FAST_T: 30000, MED_T: 60000 };

export type DeviceType = 'iphone' | 'android';
export type ViewMode = 'qr' | 'phone';
export type TimerState = 'normal' | 'warning' | 'critical' | 'refreshing';

export interface InstanceData {
  id: string;
  name: string;
  status: string;
  phoneNumber?: string;
  profileName?: string;
  qrCode?: string;
  expiresAt: Date;
  organizationName: string;
}

export function extractQrCode(data: Record<string, unknown>): string | undefined {
  return (data.qrCode || data.qrcode || data.qr || data.base64 || data.code) as string | undefined;
}
