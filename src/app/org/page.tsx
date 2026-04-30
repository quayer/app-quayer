import { Suspense } from 'react'
import { OrgSettingsClient } from './org-settings-client'
import { Skeleton } from '@/client/components/ui/skeleton'

/**
 * /org — Configurações da Organização (dados gerais + business profile
 * WhatsApp + zona de perigo). Server shell que delega para o client.
 */
export default function OrgPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 space-y-4 p-8 pt-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <OrgSettingsClient />
    </Suspense>
  )
}
