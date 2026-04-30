'use client';

import { Logo } from '@/client/components/ds/logo';

export function PageHeader({ orgName }: { orgName?: string }) {
  return (
    <header className="pt-10 pb-4 px-6 flex flex-col items-center gap-3" role="banner">
      <Logo size={32} variant="color" />
      {orgName && (
        <span
          className="text-xs font-medium px-3 py-1 rounded-full border"
          style={{ color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-subtle)' }}
        >
          {orgName}
        </span>
      )}
    </header>
  );
}
