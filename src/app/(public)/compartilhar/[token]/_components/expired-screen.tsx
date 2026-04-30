'use client';

import { Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/client/components/ui/button';
import { PageHeader } from './page-header';

export function ExpiredScreen() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-base, #000)' }}>
      <PageHeader />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-sm space-y-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'var(--color-error-bg)' }}
          >
            <Clock className="h-10 w-10" style={{ color: 'var(--color-error)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Link Expirado</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Este link expirou ou não existe. Solicite um novo ao administrador.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar Novamente
          </Button>
        </div>
      </div>
    </div>
  );
}
