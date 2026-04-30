import { cookies } from "next/headers"
import { LoginFormFinal } from "@/client/components/auth/login-form-final"
import { AuthShell } from "@/client/components/auth/auth-shell"
import { isAuthV3Enabled } from "@/lib/feature-flags/auth-v3"

export default async function LoginPage() {
  const cookieStore = await cookies()
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const v3 = isAuthV3Enabled(null, override)

  // Decisao de arquitetura (2026-04-08):
  // V3 renderiza o MESMO LoginFormFinal do v2 (todos os campos: email/phone toggle,
  // country selector, Turnstile, passkey WebAuthn, Google OAuth, termos) dentro do
  // AuthShell v3 que provem logo Q-bolt + hero image + DM Sans typography.
  // Tokens DS v3 aplicam via [data-auth-v3] no layout (cores/radius/fontes do
  // quayer-ds-v3.html). O form ja usa paleta dark compativel (text-white,
  // bg-white/[0.04]) — nao precisa de reescrita.
  if (v3) {
    return (
      <AuthShell>
        <div className="flex w-full max-w-[420px] flex-col gap-10 mx-auto">
          <LoginFormFinal />
        </div>
      </AuthShell>
    )
  }

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-10 mx-auto">
      <LoginFormFinal />
    </div>
  )
}
