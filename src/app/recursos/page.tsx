import {
  RESOURCES,
  UPCOMING_EVENTS,
} from "@/server/ai-module/content/content.data"
import { EventsSidebar } from "@/client/components/recursos/events-sidebar"
import { RecursosList } from "@/client/components/recursos/recursos-list"

export const metadata = {
  title: "Recursos | Quayer",
}

export default function RecursosPage() {
  const resources = RESOURCES.map((r) => ({
    slug: r.slug,
    title: r.title,
    category: r.category,
    categoryLabel: r.categoryLabel,
    description: r.description,
    file: r.file,
  }))

  return (
    <div className="flex min-h-screen">
      <main className="flex-1 min-w-0 px-8 py-10 lg:px-12 xl:px-16">
        <RecursosList resources={resources} />
      </main>
      <EventsSidebar events={UPCOMING_EVENTS} />
    </div>
  )
}
