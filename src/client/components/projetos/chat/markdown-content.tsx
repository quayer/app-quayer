"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Components } from "react-markdown"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

interface MarkdownContentProps {
  content: string
  tokens: AppTokens
  /** Extra className applied to the wrapper div */
  className?: string
}

/**
 * MarkdownContent — renders assistant message text as proper Markdown.
 *
 * Uses react-markdown + remark-gfm (GFM: tables, strikethrough, task lists).
 * All elements are styled via the shared AppTokens to stay in sync with the
 * rest of the UI (dark mode, brand color, etc.).
 *
 * Typography targets Medium-quality readability:
 *  - Body: 15px / line-height 1.7
 *  - Headings: 16–14px, semibold
 *  - Lists: 14px / 1.65, gap-1.5 between items
 */
export function MarkdownContent({
  content,
  tokens,
  className,
}: MarkdownContentProps) {
  const components: Components = React.useMemo(
    () => ({
      p({ children }) {
        return (
          <p
            className="mb-3 text-[15px] leading-[1.7] last:mb-0"
            style={{ color: tokens.textPrimary }}
          >
            {children}
          </p>
        )
      },
      h1({ children }) {
        return (
          <h1
            className="mb-2 mt-5 text-[17px] font-semibold first:mt-0"
            style={{ color: tokens.textPrimary }}
          >
            {children}
          </h1>
        )
      },
      h2({ children }) {
        return (
          <h2
            className="mb-2 mt-4 text-[16px] font-semibold first:mt-0"
            style={{ color: tokens.textPrimary }}
          >
            {children}
          </h2>
        )
      },
      h3({ children }) {
        return (
          <h3
            className="mb-1.5 mt-3 text-[14px] font-semibold first:mt-0"
            style={{ color: tokens.textPrimary }}
          >
            {children}
          </h3>
        )
      },
      ul({ children }) {
        return (
          <ul className="mb-3 flex flex-col gap-1 pl-5 last:mb-0">
            {children}
          </ul>
        )
      },
      ol({ children }) {
        return (
          <ol className="mb-3 flex flex-col gap-1 pl-5 last:mb-0 list-decimal">
            {children}
          </ol>
        )
      },
      li({ children }) {
        return (
          <li
            className="text-[14px] leading-[1.65]"
            style={{ color: tokens.textPrimary }}
          >
            {children}
          </li>
        )
      },
      strong({ children }) {
        return (
          <strong
            className="font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            {children}
          </strong>
        )
      },
      em({ children }) {
        return (
          <em className="italic" style={{ color: tokens.textSecondary }}>
            {children}
          </em>
        )
      },
      code({ children, className: codeClass }) {
        const isBlock = Boolean(codeClass?.startsWith("language-"))
        if (isBlock) {
          return (
            <code
              className="block overflow-x-auto rounded-lg px-3 py-2 font-mono text-[12px] leading-relaxed"
              style={{
                backgroundColor: tokens.bgBase,
                color: tokens.textSecondary,
              }}
            >
              {children}
            </code>
          )
        }
        return (
          <code
            className="rounded px-1.5 py-0.5 font-mono text-[11px]"
            style={{
              backgroundColor: tokens.bgSurface,
              color: tokens.textPrimary,
            }}
          >
            {children}
          </code>
        )
      },
      pre({ children }) {
        return (
          <pre
            className="mb-3 overflow-x-auto rounded-lg p-0 last:mb-0"
            style={{ backgroundColor: tokens.bgBase }}
          >
            {children}
          </pre>
        )
      },
      blockquote({ children }) {
        return (
          <blockquote
            className="my-3 border-l-2 pl-3 text-[14px] italic"
            style={{
              borderColor: tokens.brand,
              color: tokens.textSecondary,
            }}
          >
            {children}
          </blockquote>
        )
      },
      hr() {
        return <hr className="my-4" style={{ borderColor: tokens.divider }} />
      },
      a({ href, children }) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: tokens.brand }}
          >
            {children}
          </a>
        )
      },
    }),
    [tokens],
  )

  return (
    <div className={`min-w-0 w-full${className ? ` ${className}` : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
