"use client"

import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { Resource } from "@/server/ai-module/content/content.data"

interface RecursosListProps {
  resources: Array<
    Pick<
      Resource,
      "slug" | "title" | "category" | "categoryLabel" | "description" | "file"
    >
  >
}

/**
 * RecursosList — listagem de recursos (guias, cheatsheets, workshops).
 *
 * Tema reativo via useAppTokens. Fontes:
 *  - Heading: Instrument Serif (--font-display) só em títulos grandes
 *  - Body: DM Sans (--font-sans) default
 */
export function RecursosList({ resources }: RecursosListProps) {
  const { tokens } = useAppTokens()

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-10">
        <p
          className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: tokens.brand }}
        >
          Aprenda
        </p>
        <h1
          className="text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-[3rem]"
          style={{
            fontFamily:
              "var(--font-display), Georgia, 'Times New Roman', serif",
            color: tokens.textPrimary,
          }}
        >
          Recursos
        </h1>
        <p
          className="mt-3 max-w-xl text-[15px] leading-[1.55]"
          style={{ color: tokens.textSecondary }}
        >
          Guias, cheatsheets e workshops pra você construir agentes que
          convertem no WhatsApp.
        </p>
      </div>

      {/* Resource list */}
      <div className="flex flex-col gap-4">
        {resources.map((resource) => (
          <Link
            key={resource.slug}
            href={`/recursos/${resource.slug}`}
            className="group flex flex-col gap-3 rounded-2xl border p-6 transition-all hover:-translate-y-0.5"
            style={{
              backgroundColor: tokens.bgSurface,
              borderColor: tokens.divider,
              boxShadow: tokens.shadow,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span
                  className="inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    borderColor: tokens.brandBorder,
                    backgroundColor: tokens.brandSubtle,
                    color: tokens.brand,
                  }}
                >
                  {resource.categoryLabel}
                </span>
                <h2
                  className="text-2xl font-semibold leading-tight"
                  style={{
                    fontFamily:
                      "var(--font-display), Georgia, 'Times New Roman', serif",
                    color: tokens.textPrimary,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {resource.title}
                </h2>
                <p
                  className="line-clamp-2 text-[14px] leading-[1.55]"
                  style={{ color: tokens.textSecondary }}
                >
                  {resource.description}
                </p>
              </div>
              <ArrowRight
                className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1"
                style={{ color: tokens.textTertiary }}
              />
            </div>
            {resource.file && (
              <div
                className="mt-1 flex items-center gap-2 text-[11px]"
                style={{ color: tokens.textTertiary }}
              >
                <FileText className="h-3 w-3" />
                PDF disponível · {resource.file.sizeLabel}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
