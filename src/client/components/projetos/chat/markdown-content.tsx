"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useAppTokens, type AppTokens } from "@/client/hooks/use-app-tokens"

export interface MarkdownContentProps {
  content: string
  className?: string
  tokens?: AppTokens
}

export function MarkdownContent({ content, className, tokens: tokensProp }: MarkdownContentProps) {
  const { tokens: tokensHook } = useAppTokens()
  const tokens = tokensProp ?? tokensHook

  return (
    <div
      className={className}
      style={{ color: tokens.textPrimary, fontSize: "0.875rem", lineHeight: 1.55, overflowWrap: "anywhere" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3
              style={{
                margin: "0 0 0.45em",
                color: tokens.textPrimary,
                fontSize: "0.95rem",
                fontWeight: 700,
              }}
            >
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h4
              style={{
                margin: "0.2em 0 0.4em",
                color: tokens.textPrimary,
                fontSize: "0.9rem",
                fontWeight: 650,
              }}
            >
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h5
              style={{
                margin: "0.2em 0 0.35em",
                color: tokens.textPrimary,
                fontSize: "0.85rem",
                fontWeight: 650,
              }}
            >
              {children}
            </h5>
          ),
          p: ({ children }) => (
            <p style={{ margin: "0 0 0.5em" }}>{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: tokens.brand, textDecoration: "underline" }}
            >
              {children}
            </a>
          ),
          code: ({ className: cls, children }) => {
            const isBlock = cls?.startsWith("language-")
            if (isBlock) {
              return (
                <pre
                  style={{
                    background: tokens.bgElevated,
                    border: `1px solid ${tokens.divider}`,
                    borderRadius: 8,
                    padding: "0.75rem 1rem",
                    overflowX: "auto",
                    margin: "0.5em 0",
                    fontSize: "0.8125rem",
                  }}
                >
                  <code>{children}</code>
                </pre>
              )
            }
            return (
              <code
                style={{
                  background: tokens.bgElevated,
                  borderRadius: 4,
                  padding: "0.1em 0.35em",
                  fontSize: "0.85em",
                }}
              >
                {children}
              </code>
            )
          },
          ul: ({ children }) => (
            <ul style={{ margin: "0 0 0.55em", paddingLeft: "1.15rem" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: "0 0 0.55em", paddingLeft: "1.15rem" }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: "0.22em", paddingLeft: "0.1rem" }}>{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "0.4em 0 0.65em",
                padding: "0.55rem 0.75rem",
                borderLeft: `3px solid ${tokens.brand}`,
                background: tokens.bgElevated,
                color: tokens.textSecondary,
                borderRadius: 6,
              }}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div style={{ maxWidth: "100%", overflowX: "auto", margin: "0.5em 0" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.8125rem",
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                borderBottom: `1px solid ${tokens.divider}`,
                color: tokens.textPrimary,
                fontWeight: 650,
                padding: "0.4rem 0.5rem",
                textAlign: "left",
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                borderBottom: `1px solid ${tokens.divider}`,
                color: tokens.textSecondary,
                padding: "0.4rem 0.5rem",
                verticalAlign: "top",
              }}
            >
              {children}
            </td>
          ),
          strong: ({ children }) => (
            <strong style={{ color: tokens.textPrimary, fontWeight: 600 }}>{children}</strong>
          ),
          em: ({ children }) => <em style={{ color: tokens.textSecondary }}>{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
