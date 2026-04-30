# QuickReplyBar — exemplos de uso

Componente que renderiza chips de resposta rápida extraídos de mensagens do
assistant. Substitui listas numeradas por botões clicáveis interativos.

## Uso (integrado via chat-message.tsx)

O componente é usado internamente pelo `AssistantBubble` via `parseQuickReply`.
Não precisa ser instanciado manualmente em uso normal.

## Uso direto (testes / Storybook)

```tsx
import { QuickReplyBar } from "./quick-reply-bar"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

function Demo() {
  const { tokens } = useAppTokens()

  const chips = [
    { index: 1, label: "Ativar ferramenta extra", message: "Ativar ferramenta extra" },
    { index: 2, label: "Ajustar tom de voz", message: "Ajustar tom de voz" },
    { index: 3, label: "Criar agente assim", message: "Criar agente assim" },
  ]

  return <QuickReplyBar chips={chips} tokens={tokens} />
}
```

## Comportamento

- **Antes do clique**: todos os chips habilitados, hover mostra bordas brand color
- **Após o clique**: chip selecionado fica com bgSubtle + border brand; outros ficam
  `opacity: 0.38` e `cursor: not-allowed` (transcript imutável)
- **Streaming**: se `actions.isStreaming === true`, clique é bloqueado silenciosamente

## Integração com parseQuickReply

```typescript
import { parseQuickReply } from "./utils/parse-quick-reply"

const { cleanText, chips } = parseQuickReply(message.content)
// cleanText → vai para MarkdownContent (sem a lista numerada)
// chips     → vai para QuickReplyBar (como botões)
```

## Padrão de texto que ativa os chips

O parser detecta qualquer mensagem que termine com 2+ itens numerados:

```
Próximos passos:
1. Deseja ativar alguma ferramenta extra?
2. Quer ajustar o tom de voz?
3. Posso criar o agente com esse escopo?
```

Resultado: texto antes da lista → `MarkdownContent`; lista → `QuickReplyBar`

## Acessibilidade

- `role="group"` + `aria-label` no container
- `aria-pressed` em cada botão (estado selecionado)
- `disabled` HTML nativo para chips inativos
- `focus-visible:ring-2` para navegação por teclado
