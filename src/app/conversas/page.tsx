'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Redirect to main conversations page
 * The complete conversation interface is at /integracoes/conversations
 */
export default function ConversasRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/integracoes/conversations');
    }, [router]);

    return (
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
            <div className="text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Redirecionando...</p>
            </div>
        </div>
    );
}
