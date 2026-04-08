import { cookies } from 'next/headers'
import { OnboardingForm } from "@/client/components/auth/onboarding-form"
import { OnboardingV3 } from "@/client/components/auth/onboarding-v3"
import { AuthShell } from "@/client/components/auth/auth-shell"
import { isAuthV3Enabled } from "@/lib/feature-flags/auth-v3"

export default async function OnboardingPage() {
  const cookieStore = await cookies()
  const seedId = cookieStore.get('accessToken')?.value ?? null
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(seedId, override)

  if (v3) {
    return (
      <AuthShell>
        <OnboardingV3 />
      </AuthShell>
    )
  }

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-10 mx-auto">
      <OnboardingForm />
    </div>
  )
}
