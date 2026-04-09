/**
 * Content — Recursos & Eventos (stub data)
 *
 * Fonte temporária de dados para a jornada /recursos enquanto o módulo
 * de conteúdo + CMS não existe. Futuro: mover para Prisma model Resource,
 * Event e expor via Igniter.
 */

export type ResourceCategory =
  | "claude-code"
  | "mcp"
  | "builder"
  | "whatsapp-ai"
  | "prompts"

export interface Resource {
  slug: string
  title: string
  category: ResourceCategory
  categoryLabel: string
  description: string
  body: string
  heroGradient: string
  file?: {
    name: string
    sizeLabel: string
    url: string
  }
  author: {
    name: string
    avatar?: string
  }
  publishedAt: string // ISO date
}

export interface CommunityEvent {
  id: string
  title: string
  startsAt: string // ISO datetime
  endsAt: string
  description?: string
  joinUrl?: string
}

// ──────────────────────────────────────────────────────────────────
// Sample resources
// ──────────────────────────────────────────────────────────────────

export const RESOURCES: Resource[] = [
  {
    slug: "guia-claude-code-iniciantes",
    title: "Guia do Claude Code para pessoas normais",
    category: "claude-code",
    categoryLabel: "Claude Code",
    description:
      "Os 20 conceitos que você precisa entender para começar a usar Claude Code sem se perder nos termos técnicos.",
    body: `Se você já tentou entrar no Claude Code e se perdeu nos termos técnicos, esse guia é pra você. Aqui você vai encontrar os 20 conceitos mais importantes do Claude Code — dos mais básicos aos mais avançados — explicados em linguagem humana, sem jargão, sem inscrição. Terminal, Tokens, Janela de Contexto, CLAUDE.md, MCPs, Skills, Subagents e mais.

Você vai aprender:

• Como configurar o Claude Code do zero em 5 minutos
• A diferença entre Skills, MCPs e Subagents (e quando usar cada um)
• Como escrever um CLAUDE.md que economiza horas de retrabalho
• Estratégias de contexto pra tarefas longas sem estourar o budget
• Os 7 comandos slash que você vai usar todos os dias
• Como debugar quando o Claude parece "esquecer" algo

Perfeito pra quem é novo em ferramentas de codificação agentica e quer pular a curva de aprendizado.`,
    heroGradient:
      "linear-gradient(135deg, #1e3a5f 0%, #2d4a6e 30%, #b8633a 70%, #7a3a20 100%)",
    file: {
      name: "claude_code_cheatsheet_quayer.pdf",
      sizeLabel: "1.2 MB",
      url: "#",
    },
    author: { name: "Deborah Folloni" },
    publishedAt: "2026-04-08T20:30:00Z",
  },
  {
    slug: "mcp-servers-whatsapp",
    title: "Conectando MCPs a agentes de WhatsApp",
    category: "mcp",
    categoryLabel: "MCP",
    description:
      "Como usar Model Context Protocol para dar superpoderes aos seus agentes de atendimento.",
    body: `Model Context Protocol (MCP) é um padrão aberto que permite que agentes de IA conversem com sistemas externos de forma segura e composable. Neste guia você aprende a conectar servidores MCP aos agentes criados no Quayer Builder, expandindo o que eles podem fazer: consultar banco de dados, enviar emails, criar tickets, acessar APIs internas e muito mais.

Você vai ver:

• O que é MCP e por que importa
• Como adicionar um MCP server ao seu agente
• 5 servidores MCP prontos pra produção (PostgreSQL, Stripe, Linear, Google Drive, Slack)
• Exemplos práticos de casos de uso por vertical
• Boas práticas de segurança e limites de escopo`,
    heroGradient:
      "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
    author: { name: "Equipe Quayer" },
    publishedAt: "2026-04-05T14:00:00Z",
  },
  {
    slug: "prompt-anatomy-agentes-vendas",
    title: "Anatomia de prompts para agentes de vendas",
    category: "prompts",
    categoryLabel: "Prompts",
    description:
      "A estrutura exata que usamos nos agentes com maior taxa de conversão da plataforma.",
    body: `Um prompt bem construído pode triplicar a taxa de conversão do seu agente de vendas. Depois de analisar mais de 200 agentes em produção, documentamos a estrutura exata que separa os melhores dos medianos. Esse guia cobre os 5 componentes essenciais de um system prompt de vendas: Papel, Objetivo, Regras, Limitações e Formato de resposta.

Tópicos:

• Como definir o papel do agente em 2 parágrafos
• A regra de ouro do objetivo único (por que múltiplos objetivos destroem a conversão)
• As 7 regras de conduta que todo agente comercial precisa ter
• Limitações que protegem você e o cliente
• Formatos de resposta que convertem (com exemplos reais)`,
    heroGradient:
      "linear-gradient(135deg, #2d1b3d 0%, #4a2646 40%, #8b3c4a 80%, #c9563a 100%)",
    author: { name: "Equipe Quayer" },
    publishedAt: "2026-04-02T10:00:00Z",
  },
]

// ──────────────────────────────────────────────────────────────────
// Sample upcoming events
// ──────────────────────────────────────────────────────────────────

export const UPCOMING_EVENTS: CommunityEvent[] = [
  {
    id: "evt-1",
    title: "Reagindo aos projetos da comunidade",
    startsAt: "2026-04-16T17:30:00-03:00",
    endsAt: "2026-04-16T19:00:00-03:00",
    description:
      "Live aberta analisando agentes criados pela comunidade esta semana.",
  },
  {
    id: "evt-2",
    title: "Workshop: construindo MCPs do zero",
    startsAt: "2026-04-22T19:00:00-03:00",
    endsAt: "2026-04-22T20:30:00-03:00",
    description: "Hands-on criando um MCP server customizado.",
  },
  {
    id: "evt-3",
    title: "AMA com fundadores — Roadmap Q2",
    startsAt: "2026-04-29T18:00:00-03:00",
    endsAt: "2026-04-29T19:00:00-03:00",
    description: "Perguntas abertas sobre o roadmap do Quayer Builder.",
  },
]

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

export function findResourceBySlug(slug: string): Resource | null {
  return RESOURCES.find((r) => r.slug === slug) ?? null
}
