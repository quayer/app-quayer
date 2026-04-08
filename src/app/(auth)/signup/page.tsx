import { cookies } from 'next/headers'
import { SignupForm } from "@/client/components/auth/signup-form"
import { AuthShell } from "@/client/components/auth/auth-shell"
import { isAuthV3Enabled } from "@/lib/feature-flags/auth-v3"

export default async function SignupPage() {
  const cookieStore = await cookies()
  const seedId = cookieStore.get('accessToken')?.value ?? null
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(seedId, override)

  // Decisao de arquitetura (2026-04-08):
  // V3 renderiza o MESMO SignupForm do v2 dentro do AuthShell v3.
  // Tokens DS v3 aplicam via [data-auth-v3] scope no layout.
  if (v3) {
    return (
      <AuthShell>
        <div className="flex w-full max-w-[420px] flex-col gap-10 mx-auto">
          <SignupForm />
        </div>
      </AuthShell>
    )
  }

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-10 mx-auto">
      <SignupForm />
    </div>
  )
}
