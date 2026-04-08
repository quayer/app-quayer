import Image from 'next/image';
import { Logo } from '@/client/components/ds/logo';
import type { ReactNode } from 'react';

export interface AuthShellProps {
  children: ReactNode;
  /**
   * Se exibe a imagem hero no lado direito em desktop (>= 1024px).
   * Default true.
   */
  showImage?: boolean;
  className?: string;
}

/**
 * AuthShell — layout v3 das paginas de auth.
 *
 * Estrutura (espelha o padrao do layout v2 para manter posicionamento consistente):
 * - Left panel: logo top-left + form centralizado verticalmente
 * - Right panel: imagem hero full-bleed (sem texto, sem gradientes, sem marketing copy)
 * - Mobile (<1024px): apenas left panel, imagem escondida
 */
export function AuthShell({ children, showImage = true, className = '' }: AuthShellProps) {
  return (
    <div
      className={`relative min-h-screen overflow-x-hidden ${className}`}
      style={{
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        backgroundColor: 'var(--color-bg-base, #000000)',
        color: 'var(--color-text-primary, #ffffff)',
      }}
    >
      <div className="flex min-h-screen">
        {/* Left panel — form area. Background usa var(--color-bg-base)=#000000
            do DS v3 quayer-ds-v3.html (nao mais o #0a0d14 do v2). */}
        <main className="flex-1 flex flex-col min-h-screen" style={{ backgroundColor: 'var(--color-bg-base, #000000)' }}>
          {/* Logo top-left (mesmo posicionamento do v2: px-8 pt-8 lg:px-12 lg:pt-10) */}
          <div className="px-8 pt-8 lg:px-12 lg:pt-10">
            <Logo size={32} variant="color" />
          </div>

          {/* Form centralizado */}
          <div className="flex-1 flex items-center justify-center px-8 py-12 lg:px-12 xl:px-24">
            <div className="w-full max-w-md">{children}</div>
          </div>
        </main>

        {/* Right panel — hero image com mascara gradient na borda esquerda
            para fundir com o painel #000000 sem costura visivel */}
        {showImage && (
          <aside
            role="complementary"
            aria-hidden="true"
            className="hidden lg:block lg:w-[42%] xl:w-[45%] relative overflow-hidden"
            style={{ backgroundColor: 'var(--color-bg-base, #000000)' }}
          >
            <Image
              src="/images/auth/login-hero.webp"
              alt=""
              fill
              priority
              fetchPriority="high"
              sizes="(max-width: 1280px) 42vw, 45vw"
              className="object-cover"
            />
            {/* Mascara gradient esquerda: 0-25% preto puro, 25-50% fade,
                50%-100% transparente. Esconde a costura com o painel do form
                enquanto preserva sombra, reflexo do chao e feixes de luz. */}
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 w-[50%] pointer-events-none"
              style={{
                background:
                  'linear-gradient(to right, var(--color-bg-base, #000000) 0%, var(--color-bg-base, #000000) 25%, transparent 100%)',
              }}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default AuthShell;
