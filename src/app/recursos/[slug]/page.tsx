import { notFound } from "next/navigation"
import {
  findResourceBySlug,
  UPCOMING_EVENTS,
} from "@/server/ai-module/content/content.data"
import { EventsSidebar } from "@/client/components/recursos/events-sidebar"
import { RecursoDetail } from "@/client/components/recursos/recurso-detail"

interface RecursoDetailPageProps {
  params: Promise<{ slug: string }>
}

export default async function RecursoDetailPage({
  params,
}: RecursoDetailPageProps) {
  const { slug } = await params
  const resource = findResourceBySlug(slug)
  if (!resource) notFound()

  return (
    <div className="flex min-h-screen">
      <main className="flex-1 min-w-0 px-8 py-10 lg:px-12 xl:px-16">
        <RecursoDetail resource={resource} />
      </main>
      <EventsSidebar events={UPCOMING_EVENTS} />
    </div>
  )
}
