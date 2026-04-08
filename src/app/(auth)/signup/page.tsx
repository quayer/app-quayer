import { cookies } from 'next/headers'
import { SignupForm } from "@/client/components/auth/signup-form"
import { SignupFormV3 } from "@/client/components/auth/signup-form-v3"
import { AuthShell } from "@/client/components/auth/auth-shell"
import { isAuthV3Enabled } from "@/lib/feature-flags/auth-v3"

export default async function SignupPage() {
  const cookieStore = await cookies()
  const seedId = cookieStore.get('accessToken')?.value ?? null
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(seedId, override)

  if (v3) {
    return (
      <AuthShell>
        <SignupFormV3 />
      </AuthShell>
    )
  }

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-10 mx-auto">
      <SignupForm />
    </div>
  )
}
