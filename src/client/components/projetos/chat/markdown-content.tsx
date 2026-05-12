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
      style={{ color: tokens.textPrimary, fontSize: "0.875rem", lineHeight: 1.55 }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
            <ul style={{ margin: "0 0 0.5em", paddingLeft: "1.25rem" }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: "0 0 0.5em", paddingLeft: "1.25rem" }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ marginBottom: "0.15em" }}>{children}</li>,
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
