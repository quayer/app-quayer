import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { AuthShell } from '@/client/components/auth/auth-shell'
import { isAuthV3Enabled } from '@/lib/feature-flags/auth-v3'
import { GoogleCallbackV2Client } from './google-callback-v2-client'

export default async function GoogleCallbackPage() {
  const cookieStore = await cookies()
  const seedId = cookieStore.get('accessToken')?.value ?? null
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(seedId, override)

  const fallback = (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500 dark:text-gray-400">Carregando...</p>
    </div>
  )

  // Decisao de arquitetura (2026-04-08):
  // V3 renderiza o MESMO GoogleCallbackV2Client do v2 dentro do AuthShell v3.
  // Tokens DS v3 aplicam via [data-auth-v3] scope no layout.
  if (v3) {
    return (
      <Suspense fallback={fallback}>
        <AuthShell>
          <div className="flex w-full max-w-[420px] flex-col gap-10 mx-auto">
            <GoogleCallbackV2Client />
          </div>
        </AuthShell>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={fallback}>
      <GoogleCallbackV2Client />
    </Suspense>
  )
}
