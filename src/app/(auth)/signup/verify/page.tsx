import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { isAuthV3Enabled } from '@/lib/feature-flags/auth-v3'
import { AuthShell } from '@/client/components/auth/auth-shell'
import SignupVerifyV2Client from './SignupVerifyV2Client'

export default async function SignupVerifyPage() {
  const cookieStore = await cookies()
  const seedId = cookieStore.get('accessToken')?.value ?? null
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(seedId, override)

  if (v3) {
    return (
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[300px]" role="status" aria-live="polite" aria-busy="true" aria-atomic="true">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 rounded-full border-2 border-ds-border border-t-ds-fg animate-spin" aria-hidden="true" />
            <span className="text-ds-sm text-ds-fg/70">Carregando...</span>
          </div>
        </div>
      }>
        <AuthShell>
          <div className="flex w-full max-w-[420px] flex-col gap-8 mx-auto">
            <SignupVerifyV2Client />
          </div>
        </AuthShell>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" role="status" aria-live="polite" aria-busy="true" aria-atomic="true">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 rounded-full border-2 border-border border-t-foreground animate-spin" aria-hidden="true" />
          <span className="text-sm text-foreground/70">Carregando...</span>
        </div>
      </div>
    }>
      <SignupVerifyV2Client />
    </Suspense>
  )
}
