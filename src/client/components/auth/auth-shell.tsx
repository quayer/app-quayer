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

        {/* Right panel — hero image (zero texto, zero gradient overlays) */}
        {showImage && (
          <aside
            role="complementary"
            aria-hidden="true"
            className="hidden lg:block lg:w-[42%] xl:w-[45%] relative overflow-hidden border-l border-white/[0.1]"
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
          </aside>
        )}
      </div>
    </div>
  );
}

export default AuthShell;
