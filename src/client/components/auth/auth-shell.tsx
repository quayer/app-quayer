import Image from 'next/image';
import { Logo } from '@/client/components/ds/logo';
import type { ReactNode } from 'react';

export interface AuthShellProps {
  children: ReactNode;
  showImage?: boolean;
  className?: string;
}

export function AuthShell({ children, showImage = true, className = '' }: AuthShellProps) {
  return (
    <div className={`min-h-screen grid md:grid-cols-2 ${className}`}>
      {/* Left: form */}
      <div className="flex flex-col items-center justify-center p-6 md:p-12 bg-ds-bg">
        <div className="w-full max-w-md">
          <Logo size={48} className="mb-8" />
          {children}
        </div>
      </div>

      {/* Right: hero image */}
      {showImage && (
        <div className="relative hidden md:block bg-gray-50">
          <Image
            src="/images/auth/login-hero.png"
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="(max-width: 768px) 0vw, 50vw"
            className="object-cover"
          />
        </div>
      )}
    </div>
  );
}

export default AuthShell;
