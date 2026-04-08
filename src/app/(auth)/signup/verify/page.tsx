import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { isAuthV3Enabled } from '@/lib/feature-flags/auth-v3'
import { AuthShell } from '@/client/components/auth/auth-shell'
import { SignupVerifyV3 } from '@/client/components/auth/signup-verify-v3'
import SignupVerifyV2Client from './SignupVerifyV2Client'

export default async function SignupVerifyPage() {
  const cookieStore = await cookies()
  const seedId = cookieStore.get('accessToken')?.value ?? null
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(seedId, override)

  if (v3) {
    return (
      <Suspense fallback={null}>
        <AuthShell>
          <SignupVerifyV3 />
        </AuthShell>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 dark:text-gray-400">Carregando...</p>
      </div>
    }>
      <SignupVerifyV2Client />
    </Suspense>
  )
}
