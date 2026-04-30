# ContextUsage — exemplos de uso

Componente discreto para mostrar o uso do context window do Builder IA.

## Uso básico (compact — só a barra)

```tsx
import { ContextUsage } from "@/client/components/projetos/chat/context-usage"

<ContextUsage messages={liveMessages} />
```

## Full (barra + label + icone)

```tsx
<ContextUsage messages={liveMessages} variant="full" />
```

## Override do threshold (raramente necessario)

```tsx
<ContextUsage messages={liveMessages} threshold={64_000} />
```

## Onde plugar

- **Header sticky do `workspace.tsx`**: ao lado do nome do projeto, variant `compact`.
- **Topo do `chat-panel.tsx`**: logo acima do `chat-input`, variant `full` quando o tempo de execucao da convo for critico (>= 85%).

## Zonas visuais

| Zona      | Threshold  | Cor                                     |
|-----------|------------|-----------------------------------------|
| Normal    | < 60%      | `tokens.textTertiary` (cinza discreto)  |
| Atencao   | 60%-85%    | `tokens.brand` (amber da marca)         |
| Critico   | >= 85%     | `#ef4444` + `animate-pulse`             |

## Re-renders

O calculo de tokens ja esta memoizado com `React.useMemo` internamente e so
recomputa quando o array `messages` trocar de referencia. Se voce mutar
`messages` in-place (nao recomendado), force re-criacao com spread:

```tsx
setMessages((prev) => [...prev, novaMsg])
```

## Heuristica (match do backend)

`Math.ceil(content.length / 4)` por mensagem, incluindo
`JSON.stringify(toolCalls[i].args)` e `.result`. Mesma formula de
`src/server/ai-module/builder/services/context-budget.service.ts`.
