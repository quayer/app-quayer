/**
 * Slash commands do chat do Builder IA.
 *
 * Registry tipado de atalhos disparados ao digitar `/` no início do textarea.
 * Commands com `expansion: string` preenchem o input com um prompt pronto
 * (usuário pode complementar antes de enviar). Commands com `action` executam
 * ação client-side sem chamar o backend (ex.: limpar input, listar help).
 */

export type SlashCommandAction = "clear-input" | "show-help"

export interface SlashCommand {
  id: string
  /** Nome com `/` incluso (ex.: `/publish`). */
  name: string
  description: string
  /**
   * Texto que substitui o valor do input quando o comando é selecionado.
   * Quando a ação é puramente client-side usa o literal `"client-action"`
   * em conjunto com a prop `action`.
   */
  expansion: string | "client-action"
  action?: SlashCommandAction
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: "publish",
    name: "/publish",
    description: "Publica a versão atual do agente",
    expansion: "Publique a versão atual do agente agora.",
  },
  {
    id: "test",
    name: "/test",
    description: "Testa com uma mensagem",
    expansion: "Execute um teste no playground com esta mensagem: ",
  },
  {
    id: "status",
    name: "/status",
    description: "Status do agente",
    expansion: "Qual o status atual do meu agente?",
  },
  {
    id: "tools",
    name: "/tools",
    description: "Lista tools anexadas",
    expansion: "Liste todas as tools anexadas ao agente e explique cada uma.",
  },
  {
    id: "prompt",
    name: "/prompt",
    description: "Mostra o prompt atual",
    expansion: "Mostre o system prompt atual do agente.",
  },
  {
    id: "clear",
    name: "/clear",
    description: "Limpa o input",
    expansion: "client-action",
    action: "clear-input",
  },
  {
    id: "help",
    name: "/help",
    description: "Lista comandos disponíveis",
    expansion: "client-action",
    action: "show-help",
  },
] as const

/**
 * Filtra commands pelo nome (sem `/`) ou descrição, priorizando matches
 * por prefixo. Case-insensitive. Query vazia retorna todos os commands
 * na ordem original do registry.
 */
export function filterCommands(query: string): SlashCommand[] {
  const normalized = query.trim().toLowerCase()
  if (normalized.length === 0) return [...SLASH_COMMANDS]

  const scored = SLASH_COMMANDS.map((cmd) => {
    const nameNoSlash = cmd.name.replace(/^\//, "").toLowerCase()
    const desc = cmd.description.toLowerCase()

    let score = -1
    if (nameNoSlash.startsWith(normalized)) score = 0
    else if (desc.startsWith(normalized)) score = 1
    else if (nameNoSlash.includes(normalized)) score = 2
    else if (desc.includes(normalized)) score = 3

    return { cmd, score }
  })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score)

  return scored.map((entry) => entry.cmd)
}
