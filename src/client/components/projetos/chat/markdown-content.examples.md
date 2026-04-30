# MarkdownContent — exemplos de uso

Componente que renderiza texto Markdown do assistant com tipografia Medium-quality,
usando os tokens do design system para dark mode e brand color automáticos.

## Uso básico

```tsx
import { MarkdownContent } from "./markdown-content"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

function AssistantText({ content }: { content: string }) {
  const { tokens } = useAppTokens()
  return <MarkdownContent content={content} tokens={tokens} />
}
```

## Com className extra

```tsx
<MarkdownContent
  content={displayContent}
  tokens={tokens}
  className="max-w-[95%]"
/>
```

## O que é renderizado

| Markdown | Resultado |
|---|---|
| `**texto**` | **negrito** (font-semibold) |
| `_texto_` | *itálico* (color: textSecondary) |
| `### Título` | h3 14px semibold |
| `` `código` `` | inline code com bgSurface |
| ` ```bloco``` ` | code block com bgBase |
| `- item` | lista com gap-1.5 |
| `1. item` | lista numerada |
| `> quote` | blockquote com border-l brand |
| `[link](url)` | link brand color, target=_blank |

## Tipografia

- Body: 15px / line-height 1.7 (paragráfos)
- Listas: 14px / 1.65
- Headings: 17/16/14px semibold
- Máximo de leitura: usa max-w do container pai (max-w-2xl)

## Quando usar

Sempre que renderizar texto de mensagem do assistant. NÃO usar para:
- Mensagens do usuário (mantém plain text)
- System banners (texto simples, sem markdown)
- Labels de UI (usar text-[13px] direto)
