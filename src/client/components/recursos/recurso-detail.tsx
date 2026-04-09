"use client"

import Link from "next/link"
import { ArrowLeft, ChevronRight, Download, FileText } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { Resource } from "@/server/ai-module/content/content.data"

interface RecursoDetailProps {
  resource: Resource
}

/**
 * RecursoDetail — detalhe de um recurso (guia, cheatsheet, etc).
 *
 * Tema reativo via useAppTokens. Fontes:
 *  - Display: Instrument Serif (--font-display) pra títulos + heading "Sobre"
 *  - Body: DM Sans (--font-sans) — herda default
 *
 * Layout copiando o pattern Epic CLI docs (ref: print da sessão).
 */
export function RecursoDetail({ resource }: RecursoDetailProps) {
  const { tokens } = useAppTokens()

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back button */}
      <Link
        href="/recursos"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] transition-colors hover:underline"
        style={{ color: tokens.textSecondary }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Voltar
      </Link>

      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-8 flex items-center gap-1.5 text-[13px]"
        style={{ color: tokens.textTertiary }}
      >
        <Link
          href="/recursos"
          className="transition-colors hover:underline"
          style={{ color: tokens.textTertiary }}
        >
          Recursos
        </Link>
        <ChevronRight className="h-3 w-3 opacity-60" />
        <span className="truncate" style={{ color: tokens.textSecondary }}>
          {resource.title}
        </span>
      </nav>

      {/* Title */}
      <h1
        className="mb-4 text-[2.5rem] font-bold leading-[1.05] tracking-tight sm:text-[3rem]"
        style={{
          fontFamily:
            "var(--font-display), Georgia, 'Times New Roman', serif",
          color: tokens.textPrimary,
        }}
      >
        {resource.title}
      </h1>

      {/* Category pill */}
      <span
        className="mb-8 inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium"
        style={{
          borderColor: tokens.brandBorder,
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        {resource.categoryLabel}
      </span>

      {/* Hero */}
      <div
        className="mb-8 flex h-[280px] items-center justify-center rounded-2xl"
        style={{
          background: resource.heroGradient,
          border: `1px solid ${tokens.divider}`,
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
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.divider,
            boxShadow: tokens.shadow,
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
              style={{
                backgroundColor: tokens.brandSubtle,
                color: tokens.brand,
              }}
            >
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3
                className="truncate text-sm font-semibold"
                style={{ color: tokens.textPrimary }}
              >
                {resource.title}
              </h3>
              <p
                className="truncate text-[11px]"
                style={{ color: tokens.textTertiary }}
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
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
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
            color: tokens.textPrimary,
            letterSpacing: "-0.01em",
          }}
        >
          Sobre este recurso
        </h2>
        <div
          className="flex flex-col gap-5 text-[15px] leading-[1.7]"
          style={{ color: tokens.textSecondary }}
        >
          {resource.body.split("\n\n").map((paragraph, i) => (
            <p key={i} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>
      </section>
    </div>
  )
}
