import { Suspense } from 'react'
import Image from 'next/image'
import { cookies } from 'next/headers'
import { DM_Sans, DM_Mono } from 'next/font/google'
import { isAuthV3Enabled } from '@/lib/feature-flags/auth-v3'

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-dm-mono',
})

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const seedId = cookieStore.get('accessToken')?.value ?? null
  const override = cookieStore.get('auth-v3-override')?.value ?? null
  const authV3 = isAuthV3Enabled(seedId, override)

  // ============================================================
  // V3 layout — minimalist wrapper. Pages compose their own
  // <AuthShell> which controls the full left/right split.
  // Zero brand panel here, zero marketing copy. Design System v3
  // tokens activate via data-auth-v3="true" on this root wrapper.
  // ============================================================
  if (authV3) {
    return (
      <div
        data-auth-v3="true"
        className={`${dmSans.variable} ${dmMono.variable} min-h-screen`}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-screen" role="status">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                <span className="text-sm text-gray-500">Carregando...</span>
              </div>
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    )
  }

  // ============================================================
  // V2 layout — legacy, preserved exactly as it was. Contains
  // the marketing brand panel with "Sua inteligência artificial..."
  // copy on the right side. Will be removed in US-322 after 30d
  // stable at flag on in production.
  // ============================================================
  return (
    <div
      className={`${dmSans.variable} ${dmMono.variable} relative min-h-screen overflow-x-hidden bg-[#fafafa] dark:bg-[#0a0d14]`}
      style={{
        '--ring': 'oklch(0.708 0 0)',
        '--color-ring': 'var(--ring)',
        '--primary': 'oklch(0.95 0 0)',
        '--primary-foreground': 'oklch(0.13 0 0)',
      } as React.CSSProperties}
    >
      <div className="flex min-h-screen">
        {/* ── Form Panel (left) ────────────────────────────── */}
        <main className="flex-1 flex flex-col min-h-screen">
          {/* Logo — top left */}
          <div className="px-8 pt-8 lg:px-12 lg:pt-10">
            <Image
              src="/logo.svg"
              alt="Quayer"
              width={140}
              height={32}
              style={{ height: 'auto' }}
              priority
              className="dark:invert-0 text-[#0a0d14] dark:text-white"
            />
          </div>

          {/* Form — centered */}
          <div className="flex-1 flex items-center justify-center px-8 py-12 lg:px-12 xl:px-24">
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[400px]" role="status">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-white/20 dark:border-t-white animate-spin" />
                  <span className="text-sm text-gray-500 dark:text-white/40">Carregando...</span>
                </div>
              </div>
            }>
              {children}
            </Suspense>
          </div>
        </main>

        {/* ── Brand Panel (right) — V2 ONLY ── */}
        <div role="complementary" className="hidden lg:flex lg:w-[42%] xl:w-[45%] relative overflow-hidden border-l border-white/[0.1]">
          {/* Deep indigo background — clearly distinct from form panel */}
          <div className="absolute inset-0 bg-[#060c1e]" />

          {/* Radial indigo glow — top center */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(79,70,229,0.18),transparent_70%)]" />

          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#040810] to-transparent" />

          {/* ── Centered content ──────────────────────── */}
          <div className="relative z-10 flex flex-col justify-center items-center w-full px-12 xl:px-16">
            {/* Headline */}
            <h2 className="text-[1.5rem] xl:text-[1.75rem] font-bold text-white text-center leading-tight tracking-[-0.02em] mb-4">
              Sua inteligência artificial<br />
              <span className="text-white/60">vendendo 24 horas por dia.</span>
            </h2>

            {/* Separator */}
            <div className="w-8 h-px bg-white/20 mb-6" />

            {/* Sub-copy */}
            <p className="text-[0.9rem] text-white/50 text-center leading-relaxed max-w-[320px]">
              Automatize conversas, converta leads e escale seu atendimento com IA.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
