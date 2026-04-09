import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ChevronRight, Download, FileText } from "lucide-react"
import {
  findResourceBySlug,
  UPCOMING_EVENTS,
} from "@/server/ai-module/content/content.data"
import { EventsSidebar } from "@/client/components/recursos/events-sidebar"

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
        <div className="mx-auto max-w-3xl">
          {/* Back button */}
          <Link
            href="/recursos"
            className="mb-6 inline-flex items-center gap-1.5 text-[13px] transition-colors hover:underline"
            style={{
              color: "var(--color-text-secondary, rgba(255,255,255,0.65))",
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>

          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="mb-8 flex items-center gap-1.5 text-[13px]"
            style={{
              color: "var(--color-text-tertiary, rgba(255,255,255,0.55))",
            }}
          >
            <Link href="/recursos" className="hover:underline">
              Recursos
            </Link>
            <ChevronRight className="h-3 w-3 opacity-50" />
            <span
              className="truncate"
              style={{
                color: "var(--color-text-secondary, rgba(255,255,255,0.75))",
              }}
            >
              {resource.title}
            </span>
          </nav>

          {/* Title */}
          <h1
            className="mb-4 text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-[3rem]"
            style={{
              fontFamily:
                "var(--font-display), Georgia, 'Times New Roman', serif",
              color: "var(--color-text-primary, #ffffff)",
            }}
          >
            {resource.title}
          </h1>

          {/* Category pill */}
          <span
            className="mb-8 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium"
            style={{
              borderColor: "rgba(255,214,10,0.25)",
              backgroundColor: "rgba(255,214,10,0.06)",
              color: "var(--color-brand, #FFD60A)",
            }}
          >
            {resource.categoryLabel}
          </span>

          {/* Hero */}
          <div
            className="mb-8 flex h-[280px] items-center justify-center rounded-2xl"
            style={{
              background: resource.heroGradient,
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            aria-hidden
          >
            <div
              className="flex h-40 w-32 flex-col items-center justify-center rounded-xl p-4"
              style={{
                backgroundColor: "rgba(26,8,0,0.75)",
                border: "1px solid rgba(255,214,10,0.3)",
                boxShadow: "0 20px 60px -20px rgba(0,0,0,0.8)",
              }}
            >
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "rgba(255,214,10,0.7)" }}
              >
                Quayer
              </span>
              <span
                className="mt-2 text-center text-xs font-semibold"
                style={{
                  fontFamily:
                    "var(--font-display), Georgia, 'Times New Roman', serif",
                  color: "rgba(255,255,255,0.9)",
                }}
              >
                {resource.categoryLabel}
              </span>
            </div>
          </div>

          {/* Download card */}
          {resource.file && (
            <div
              className="mb-10 flex items-center justify-between gap-4 rounded-2xl border p-5"
              style={{
                backgroundColor: "var(--color-bg-surface, #060402)",
                borderColor:
                  "var(--color-border-subtle, rgba(255,255,255,0.08))",
              }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: "var(--color-bg-elevated, #0C0804)",
                    border:
                      "1px solid var(--color-border-default, rgba(255,255,255,0.1))",
                  }}
                >
                  <FileText
                    className="h-5 w-5"
                    style={{ color: "var(--color-brand, #FFD60A)" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3
                    className="truncate text-sm font-semibold"
                    style={{
                      color: "var(--color-text-primary, #ffffff)",
                    }}
                  >
                    {resource.title}
                  </h3>
                  <p
                    className="truncate text-[11px]"
                    style={{
                      color:
                        "var(--color-text-tertiary, rgba(255,255,255,0.55))",
                    }}
                  >
                    {resource.file.name} · {resource.file.sizeLabel}
                  </p>
                </div>
              </div>
              <a
                href={resource.file.url}
                download
                className="flex h-10 items-center gap-2 rounded-full px-5 text-[13px] font-semibold transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: "var(--color-brand, #FFD60A)",
                  color: "var(--color-text-inverse, #1A0800)",
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Baixar
              </a>
            </div>
          )}

          {/* Body */}
          <section>
            <h2
              className="mb-5 text-2xl font-semibold"
              style={{
                fontFamily:
                  "var(--font-display), Georgia, 'Times New Roman', serif",
                color: "var(--color-text-primary, #ffffff)",
                letterSpacing: "-0.01em",
              }}
            >
              Sobre este recurso
            </h2>
            <div
              className="flex flex-col gap-5 text-[15px] leading-[1.7]"
              style={{
                color: "var(--color-text-secondary, rgba(255,255,255,0.75))",
              }}
            >
              {resource.body.split("\n\n").map((paragraph, i) => (
                <p key={i} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        </div>
      </main>

      <EventsSidebar events={UPCOMING_EVENTS} />
    </div>
  )
}
