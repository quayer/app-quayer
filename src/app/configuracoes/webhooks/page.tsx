'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function WebhooksRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/ferramentas/webhooks');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground">Redirecionando para Webhooks...</p>
    </div>
  );
}
