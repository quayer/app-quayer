# Skill: ds (Design System customizado)

Componentes de identidade e UI específicos da marca Quayer.
Diferente de `ui/` (shadcn primitivos), esta pasta contém componentes com opinião visual do produto.

## Inventário de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `logo.tsx` | Logo SVG do Quayer com variants (color, light, dark) e tamanhos |
| `message-input.tsx` | Input de mensagem do chat do Builder — com upload, send, resize |
| `model-icons.tsx` | Ícones dos modelos de IA (Claude, GPT-4, etc.) como componentes SVG |

## Logo — props

```typescript
interface LogoProps {
  size?: number          // padrão: 32
  variant?: "color" | "light" | "dark"  // padrão: "color"
  className?: string
}
```

## model-icons — uso

```tsx
import { ClaudeIcon, GPT4Icon } from "@/client/components/ds/model-icons"

// Renderiza ícone do modelo em seletor de AI
<ClaudeIcon className="h-5 w-5" />
```

Ver [message-input.skill.md](./message-input.skill.md) para documentação completa do `MessageInput`.

## Ao estender

- Novo ícone de modelo: adicionar export em `model-icons.tsx`
- Nova variante do logo: adicionar case no switch de `variant` em `logo.tsx`
- Novos componentes de marca: criar nesta pasta (não em `ui/`)
- `ui/` é para primitivos genéricos; `ds/` é para componentes com identidade Quayer
