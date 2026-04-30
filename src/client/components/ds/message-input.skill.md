# MessageInput — Skill de Manutenção

## O que é
Componente unificado de input de mensagem. Qualquer input com mic + send no Quayer usa este componente.

## Arquivo principal
`src/client/components/ds/message-input.tsx`

## Consumidores atuais
| Arquivo | leftSlot | aboveTextarea | minLength |
|---|---|---|---|
| `home-page.tsx` | Attach + ModelPicker | FileChip | 10 |
| `chat/chat-input.tsx` | Hint ⌘+Enter | SlashCommandMenu (aboveActionBar) | 1 |

## Regra de posicionamento dos botões
- Ordem no DOM: `[send][mic]`
- Send usa `width: 0 → 42px` (animação CSS, não mount/unmount)
- Mic é sempre o último filho — posição nunca muda

**NÃO inverter esta ordem.** O mic precisa ficar fixo no canto direito.

## Props críticas
```tsx
minLength   // controla quando send ativa (home=10, chat=1)
borderColor // override de cor p/ estado de erro (ex: vermelho)
textareaRef // para auto-focus no mount (home usa isso)
textareaProps.id // "builder-home-input" no home (usado pelo ⌘K)
onKeyDown   // injetado ANTES do Ctrl+Enter interno (slash commands)
leftSlot    // só aparece no estado normal (oculto automaticamente durante gravação)
aboveTextarea  // renderizado antes do textarea (file chip no home)
aboveActionBar // renderizado antes da action bar (slash menu no chat)
```

## Comportamento de voz (interno — não duplicar nos consumidores)
- `useVoiceInput` roda dentro do componente
- Durante `isListening`: leftSlot é substituído por "Fale agora…"
- Durante `isTranscribing`: leftSlot é substituído por "Aguarde…"
- Consumidores **não** precisam saber sobre estado de voz

## Como adicionar um novo consumidor
1. Importar `MessageInput` de `@/client/components/ds/message-input`
2. Passar `tokens` (obrigatório)
3. Definir `leftSlot` com os controles do lado esquerdo
4. Se precisar de slash commands: passar em `aboveActionBar` + `onKeyDown` + `textareaProps`
5. NÃO re-implementar a lógica de [send][mic] — ela já está aqui

## Não fazer
- ❌ Criar outro componente de input com mic/send fora deste
- ❌ Usar `{canSend && <button send>}` (causa shift do mic)
- ❌ Montar/desmontar o botão send — usar a animação de largura
- ❌ Passar `boxShadow` com sombra preta pura em dark theme (invisible)
