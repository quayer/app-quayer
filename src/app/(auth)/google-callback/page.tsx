import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { GoogleCallbackV3 } from '@/client/components/auth/google-callback-v3'
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

  if (v3) {
    return (
      <Suspense fallback={fallback}>
        <AuthShell>
          <GoogleCallbackV3 />
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
