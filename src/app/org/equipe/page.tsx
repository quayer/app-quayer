import { Suspense } from 'react'
import { EquipeClient } from './equipe-client'
import { Skeleton } from '@/client/components/ui/skeleton'

/**
 * /org/equipe — Membros e convites unificados em uma única tabela.
 */
export default function OrgEquipePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 space-y-4 p-8 pt-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <EquipeClient />
    </Suspense>
  )
}
