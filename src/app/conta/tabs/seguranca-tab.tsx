'use client'

/**
 * Tab: Segurança — passkeys + 2FA + métodos OTP permitidos.
 * Structural extraction from conta-client.tsx (no behavior change).
 */

import { useState, useEffect } from 'react'
import { Shield } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/client/components/ui/card'
import { PasskeyManager } from '@/client/components/settings/passkey-manager'

import { apiFetch } from './shared'
import { PrefRow } from './pref-row'
import { TwoFactorSection } from './two-factor-section'

// ============================================================================
// Tab: Segurança — OTP Methods
// ============================================================================

function OtpMethodsSection({ is2FAEnabled }: { is2FAEnabled: boolean }) {
  const [otpEmailDisabled, setOtpEmailDisabled] = useState(false)
  const [otpPhoneDisabled, setOtpPhoneDisabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<'email' | 'phone' | null>(null)

  useEffect(() => {
    apiFetch<{ data?: { otpEmailDisabled: boolean; otpPhoneDisabled: boolean } }>(
      '/api/v1/auth/me/otp-preferences'
    )
      .then((res) => {
        const d = res.data ?? (res as unknown as { otpEmailDisabled: boolean; otpPhoneDisabled: boolean })
        setOtpEmailDisabled(d.otpEmailDisabled ?? false)
        setOtpPhoneDisabled(d.otpPhoneDisabled ?? false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggle = async (field: 'email' | 'phone', value: boolean) => {
    setSaving(field)
    try {
      await apiFetch('/api/v1/auth/me/otp-preferences', {
        method: 'PATCH',
        body: JSON.stringify(
          field === 'email' ? { otpEmailDisabled: value } : { otpPhoneDisabled: value }
        ),
      })
      if (field === 'email') setOtpEmailDisabled(value)
      else setOtpPhoneDisabled(value)
      toast.success(value ? 'Método desabilitado' : 'Método reabilitado')
    } catch (err) {
      toast.error((err as Error).message || 'Erro ao salvar preferência')
    } finally {
      setSaving(null)
    }
  }

  if (!is2FAEnabled) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-muted-foreground" />
          Métodos de login permitidos
        </CardTitle>
        <CardDescription>
          Com o 2FA ativo, você pode desabilitar métodos OTP mais fracos e exigir somente o código do autenticador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-0 divide-y divide-border">
        <PrefRow
          id="otp-email-toggle"
          label="OTP por email"
          description="Permite receber código de acesso por email para fazer login."
          checked={!otpEmailDisabled}
          onChange={() => !loading && toggle('email', !otpEmailDisabled)}
          disabled={loading || saving === 'email'}
        />
        <PrefRow
          id="otp-phone-toggle"
          label="OTP por WhatsApp"
          description="Permite receber código de acesso via WhatsApp para fazer login."
          checked={!otpPhoneDisabled}
          onChange={() => !loading && toggle('phone', !otpPhoneDisabled)}
          disabled={loading || saving === 'phone'}
        />
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Tab: Segurança — wrapper
// ============================================================================

export function SegurancaTab() {
  const [is2FAEnabled, setIs2FAEnabled] = useState(false)

  return (
    <div className="space-y-6">
      <PasskeyManager />
      <TwoFactorSection onStatusChange={setIs2FAEnabled} />
      <OtpMethodsSection is2FAEnabled={is2FAEnabled} />
    </div>
  )
}
