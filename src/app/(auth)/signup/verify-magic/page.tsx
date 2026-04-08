import { Suspense } from "react"
import { cookies } from "next/headers"
import { AuthShell } from "@/client/components/auth/auth-shell"
import { isAuthV3Enabled } from "@/lib/feature-flags/auth-v3"
import { SignupVerifyMagicClient } from "./SignupVerifyMagicClient"

export default async function SignupVerifyMagicPage() {
  const cookieStore = await cookies()
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(null, override)

  if (v3) {
    return (
      <AuthShell>
        <div className="flex w-full max-w-[420px] flex-col gap-10 mx-auto">
          <Suspense fallback={null}>
            <SignupVerifyMagicClient />
          </Suspense>
        </div>
      </AuthShell>
    )
  }

  return (
    <Suspense fallback={null}>
      <SignupVerifyMagicClient />
    </Suspense>
  )
}
