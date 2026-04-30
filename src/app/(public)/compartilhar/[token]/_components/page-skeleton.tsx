'use client';

import { Skeleton } from '@/client/components/ui/skeleton';

export function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-base, #000)' }}>
      <header className="py-6 px-6 flex flex-col items-center gap-3">
        <Skeleton className="h-8 w-48" />
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div
          className="w-full max-w-[820px] rounded-2xl border p-10"
          style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-subtle)' }}
        >
          <div className="flex flex-col md:flex-row gap-10">
            <div className="flex-1 space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="w-64 h-64 rounded-xl shrink-0 mx-auto md:mx-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
