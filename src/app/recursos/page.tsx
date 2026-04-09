import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"
import { RESOURCES, UPCOMING_EVENTS } from "@/server/ai-module/content/content.data"
import { EventsSidebar } from "@/client/components/recursos/events-sidebar"

export const metadata = {
  title: "Recursos | Quayer",
}

export default function RecursosPage() {
  return (
    <div className="flex min-h-screen">
      <main className="flex-1 min-w-0 px-8 py-10 lg:px-12 xl:px-16">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="mb-10">
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--color-brand, #FFD60A)" }}
            >
              Aprenda
            </p>
            <h1
              className="text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-[3rem]"
              style={{
                fontFamily:
                  "var(--font-display), Georgia, 'Times New Roman', serif",
                color: "var(--color-text-primary, #ffffff)",
              }}
            >
              Recursos
            </h1>
            <p
              className="mt-3 text-[15px] leading-[1.5]"
              style={{
                color: "var(--color-text-secondary, rgba(255,255,255,0.65))",
              }}
            >
              Guias, cheatsheets e workshops pra você construir agentes que
              convertem no WhatsApp.
            </p>
          </div>

          {/* Resource list */}
          <div className="flex flex-col gap-4">
            {RESOURCES.map((resource) => (
              <Link
                key={resource.slug}
                href={`/recursos/${resource.slug}`}
                className="group flex flex-col gap-3 rounded-2xl border p-6 transition-all hover:-translate-y-0.5"
                style={{
                  backgroundColor: "var(--color-bg-surface, #060402)",
                  borderColor:
                    "var(--color-border-subtle, rgba(255,255,255,0.06))",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span
                      className="inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                      style={{
                        borderColor: "rgba(255,214,10,0.25)",
                        backgroundColor: "rgba(255,214,10,0.06)",
                        color: "var(--color-brand, #FFD60A)",
                      }}
                    >
                      {resource.categoryLabel}
                    </span>
                    <h2
                      className="text-2xl font-semibold leading-tight"
                      style={{
                        fontFamily:
                          "var(--font-display), Georgia, 'Times New Roman', serif",
                        color: "var(--color-text-primary, #ffffff)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {resource.title}
                    </h2>
                    <p
                      className="line-clamp-2 text-[14px] leading-[1.55]"
                      style={{
                        color:
                          "var(--color-text-secondary, rgba(255,255,255,0.65))",
                      }}
                    >
                      {resource.description}
                    </p>
                  </div>
                  <ArrowRight
                    className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1"
                    style={{
                      color:
                        "var(--color-text-tertiary, rgba(255,255,255,0.55))",
                    }}
                  />
                </div>
                {resource.file && (
                  <div
                    className="mt-1 flex items-center gap-2 text-[11px]"
                    style={{
                      color:
                        "var(--color-text-tertiary, rgba(255,255,255,0.55))",
                    }}
                  >
                    <FileText className="h-3 w-3" />
                    PDF disponível · {resource.file.sizeLabel}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      </main>

      <EventsSidebar events={UPCOMING_EVENTS} />
    </div>
  )
}
