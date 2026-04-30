'use client';

import { CheckCircle, PartyPopper, Wifi } from 'lucide-react';
import { PageHeader } from './page-header';
import type { InstanceData } from '../_constants';

interface ConnectedScreenProps {
  instance: InstanceData;
}

export function ConnectedScreen({ instance }: ConnectedScreenProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg-base, #000)' }}>
      <PageHeader orgName={instance.organizationName} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div
          className="w-full max-w-md rounded-2xl border overflow-hidden"
          style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-subtle)' }}
        >
          <div className="p-8 text-center" style={{ background: 'var(--color-success-bg)' }}>
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(46,204,88,.15)' }}
            >
              <PartyPopper className="h-10 w-10" style={{ color: 'var(--color-success)' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Conectado com Sucesso!</h1>
          </div>
          <div className="p-8 text-center space-y-4">
            <p style={{ color: 'var(--color-text-secondary)' }}>
              WhatsApp conectado a{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>{instance.organizationName}</strong>
            </p>
            {instance.phoneNumber && (
              <div
                className="rounded-xl p-4 border flex items-center justify-center gap-3"
                style={{ background: 'var(--color-success-bg)', borderColor: 'var(--color-success-border)' }}
              >
                <Wifi className="h-5 w-5" style={{ color: 'var(--color-success)' }} />
                <span className="font-semibold text-lg" style={{ color: 'var(--color-success)' }}>{instance.phoneNumber}</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 pt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              <CheckCircle className="h-4 w-4" style={{ color: 'var(--color-success)' }} />
              <span className="text-sm">Você pode fechar esta página.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
