import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { isAuthV3Enabled } from '@/lib/feature-flags/auth-v3'
import { AuthShell } from '@/client/components/auth/auth-shell'
import { LoginVerifyV3 } from '@/client/components/auth/login-verify-v3'
import { LoginVerifyV2Client } from './LoginVerifyV2Client'

export default async function LoginVerifyPage() {
  const cookieStore = await cookies()
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(null, override)

  if (v3) {
    return (
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[300px]" role="status">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-ds-border border-t-ds-fg animate-spin" />
            <span className="text-ds-sm text-ds-muted">Carregando...</span>
          </div>
        </div>
      }>
        <AuthShell>
          <LoginVerifyV3 />
        </AuthShell>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]" role="status">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <span className="text-sm text-white/40">Carregando...</span>
        </div>
      </div>
    }>
      <LoginVerifyV2Client />
    </Suspense>
  )
}
